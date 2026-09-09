-- Atomic Rule Builder mutations and authoritative active dependency-cycle validation.

alter table public.rule_actions add column task_blocking boolean;
update public.rule_actions set task_blocking=false where action_type='CREATE_TASK';
alter table public.rule_actions drop constraint rule_actions_target_shape;
alter table public.rule_actions add constraint rule_actions_target_shape check (
  (action_type in ('SHOW_QUESTION','REQUIRE_QUESTION') and target_question_id is not null
    and task_title is null and task_description is null and task_priority is null
    and task_required is null and task_blocking is null)
  or
  (action_type='CREATE_TASK' and target_question_id is null
    and task_title is not null and length(trim(task_title))>0
    and task_description is not null and task_priority is not null
    and task_required is not null and task_blocking is not null)
);

drop view public.organization_rule_actions;
create view public.organization_rule_actions with (security_barrier=true) as
select a.id,a.organization_id,a.rule_definition_id,a.action_type,a.target_question_id,
  a.task_title,a.task_description,a.task_priority,a.task_required,a.task_blocking,a.display_order,
  public.organization_actor_id(a.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(a.created_by_user_id) as created_by_display_name,
  public.organization_actor_id(a.updated_by_user_id) as updated_by_user_id,
  public.organization_actor_label(a.updated_by_user_id) as updated_by_display_name,
  a.created_at,a.updated_at
from public.rule_actions a
where public.has_effective_organization_permission(a.organization_id,'VIEW_RULES');
revoke all on public.organization_rule_actions from public,anon,authenticated;
grant select on public.organization_rule_actions to authenticated;

create function public.assert_rule_graph_acyclic(target_organization_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
declare has_cycle boolean;
begin
  with recursive edges(source_question_id,target_question_id) as (
    select r.source_question_id,a.target_question_id
    from public.rule_definitions r
    join public.rule_actions a on a.organization_id=r.organization_id and a.rule_definition_id=r.id
    where r.organization_id=target_organization_id and r.active
      and a.action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
  ), reach(source_question_id,target_question_id) as (
    select e.source_question_id,e.target_question_id from edges e
    union
    select r.source_question_id,e.target_question_id
    from reach r join edges e on e.source_question_id=r.target_question_id
  )
  select exists(select 1 from reach where source_question_id=target_question_id) into has_cycle;
  if has_cycle then raise exception 'active rule dependency cycle detected' using errcode='23514'; end if;
end $$;

create function public.enforce_rule_graph_acyclic()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    perform public.assert_rule_graph_acyclic(old.organization_id);
    return old;
  end if;
  perform public.assert_rule_graph_acyclic(new.organization_id);
  return new;
end $$;

create constraint trigger rule_definitions_graph_acyclic
after insert or update or delete on public.rule_definitions
deferrable initially deferred for each row execute function public.enforce_rule_graph_acyclic();
create constraint trigger rule_actions_graph_acyclic
after insert or update or delete on public.rule_actions
deferrable initially deferred for each row execute function public.enforce_rule_graph_acyclic();

create function public.save_rule_definition(
  target_organization_id uuid,
  target_rule_id uuid,
  target_name text,
  target_description text,
  target_source_question_id uuid,
  target_condition_operator public.rule_condition_operator,
  target_condition_option_id uuid,
  target_active boolean,
  target_display_order integer,
  target_actions jsonb,
  expected_updated_at timestamptz default null
) returns public.rule_definitions language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); item public.rule_definitions; action jsonb; action_id uuid; action_order bigint;
  action_type public.rule_action_type; target_question uuid; existing_action public.rule_actions;
begin
  if actor is null or not public.has_effective_organization_permission(target_organization_id,'MANAGE_RULES')
    then raise exception 'not authorized' using errcode='42501'; end if;
  if target_name is null or length(trim(target_name))=0 or length(trim(target_name))>160
    then raise exception 'rule name is required' using errcode='23514'; end if;
  if target_display_order<0 then raise exception 'invalid display order' using errcode='23514'; end if;
  if jsonb_typeof(target_actions)<>'array' or jsonb_array_length(target_actions)=0
    then raise exception 'rule requires at least one action' using errcode='23514'; end if;

  if target_rule_id is null then
    if not exists(select 1 from public.question_definitions q where q.id=target_source_question_id and q.organization_id=target_organization_id and q.active)
      then raise exception 'select an active source question' using errcode='23514'; end if;
    insert into public.rule_definitions(organization_id,name,description,source_question_id,condition_operator,condition_option_id,active,display_order,created_by_user_id,updated_by_user_id)
    values(target_organization_id,trim(target_name),coalesce(trim(target_description),''),target_source_question_id,target_condition_operator,target_condition_option_id,target_active,target_display_order,actor,actor)
    returning * into item;
  else
    select * into item from public.rule_definitions where id=target_rule_id and organization_id=target_organization_id for update;
    if not found then raise exception 'rule not found' using errcode='P0002'; end if;
    if expected_updated_at is null or item.updated_at<>expected_updated_at
      then raise exception 'rule configuration changed' using errcode='40001'; end if;
    if item.source_question_id<>target_source_question_id and not exists(
      select 1 from public.question_definitions q where q.id=target_source_question_id and q.organization_id=target_organization_id and q.active
    ) then raise exception 'select an active source question' using errcode='23514'; end if;
    update public.rule_definitions set name=trim(target_name),description=coalesce(trim(target_description),''),
      source_question_id=target_source_question_id,condition_operator=target_condition_operator,
      condition_option_id=target_condition_option_id,active=target_active,display_order=target_display_order
    where id=item.id returning * into item;
  end if;

  -- Validate every replacement action before deleting anything. Any later error
  -- still rolls the entire function transaction back.
  for action in select value from jsonb_array_elements(target_actions) loop
    action_type:=(action->>'action_type')::public.rule_action_type;
    action_id:=nullif(action->>'id','')::uuid;
    target_question:=nullif(action->>'target_question_id','')::uuid;
    if action_id is not null then
      select * into existing_action from public.rule_actions
      where id=action_id and organization_id=target_organization_id and rule_definition_id=item.id;
      if not found then raise exception 'invalid rule action' using errcode='23514'; end if;
    else existing_action:=null; end if;
    if action_type in ('SHOW_QUESTION','REQUIRE_QUESTION') then
      if target_question=item.source_question_id then raise exception 'rule cannot directly target its source question' using errcode='23514'; end if;
      if not exists(
        select 1 from public.question_definitions q where q.id=target_question and q.organization_id=target_organization_id
          and (q.active or (existing_action.id is not null and existing_action.action_type=action_type and existing_action.target_question_id=target_question))
      ) then raise exception 'select an active target question' using errcode='23514'; end if;
    elsif action_type='CREATE_TASK' then
      if length(trim(coalesce(action->>'task_title','')))=0 then raise exception 'task title is required' using errcode='23514'; end if;
      perform (action->>'task_priority')::public.priority_level;
    end if;
  end loop;

  delete from public.rule_actions where organization_id=target_organization_id and rule_definition_id=item.id;
  for action,action_order in select value,ordinality from jsonb_array_elements(target_actions) with ordinality loop
    action_type:=(action->>'action_type')::public.rule_action_type;
    action_id:=coalesce(nullif(action->>'id','')::uuid,gen_random_uuid());
    insert into public.rule_actions(id,organization_id,rule_definition_id,action_type,target_question_id,
      task_title,task_description,task_priority,task_required,task_blocking,display_order,created_by_user_id,updated_by_user_id)
    values(action_id,target_organization_id,item.id,action_type,nullif(action->>'target_question_id','')::uuid,
      nullif(trim(action->>'task_title'),''),case when action_type='CREATE_TASK' then coalesce(trim(action->>'task_description'),'') else null end,
      nullif(action->>'task_priority','')::public.priority_level,case when action_type='CREATE_TASK' then coalesce((action->>'task_required')::boolean,false) else null end,
      case when action_type='CREATE_TASK' then coalesce((action->>'task_blocking')::boolean,false) else null end,
      action_order-1,actor,actor);
  end loop;
  perform public.assert_rule_graph_acyclic(target_organization_id);
  select * into item from public.rule_definitions where id=item.id;
  if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then item.created_by_user_id:=null; end if;
  if not public.is_super_admin(actor) and public.is_super_admin(item.updated_by_user_id) then item.updated_by_user_id:=null; end if;
  return item;
end $$;

alter function public.assert_rule_graph_acyclic(uuid) owner to postgres;
alter function public.enforce_rule_graph_acyclic() owner to postgres;
alter function public.save_rule_definition(uuid,uuid,text,text,uuid,public.rule_condition_operator,uuid,boolean,integer,jsonb,timestamptz) owner to postgres;
revoke all on function public.assert_rule_graph_acyclic(uuid),public.enforce_rule_graph_acyclic(),public.save_rule_definition(uuid,uuid,text,text,uuid,public.rule_condition_operator,uuid,boolean,integer,jsonb,timestamptz) from public,anon;
revoke all on function public.assert_rule_graph_acyclic(uuid),public.enforce_rule_graph_acyclic() from authenticated;
grant execute on function public.save_rule_definition(uuid,uuid,text,text,uuid,public.rule_condition_operator,uuid,boolean,integer,jsonb,timestamptz) to authenticated;
