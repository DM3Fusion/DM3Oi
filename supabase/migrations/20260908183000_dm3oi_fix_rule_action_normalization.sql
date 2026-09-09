-- Normalize Rule action payloads at the trusted database boundary. Rule Builder
-- state intentionally carries defaults for every action type, but non-task
-- actions must never persist task-only values.

create or replace function public.save_rule_definition(
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
    values(action_id,target_organization_id,item.id,action_type,
      case when action_type in ('SHOW_QUESTION','REQUIRE_QUESTION') then nullif(action->>'target_question_id','')::uuid else null end,
      case when action_type='CREATE_TASK' then nullif(trim(action->>'task_title'),'') else null end,
      case when action_type='CREATE_TASK' then coalesce(trim(action->>'task_description'),'') else null end,
      case when action_type='CREATE_TASK' then nullif(action->>'task_priority','')::public.priority_level else null end,
      case when action_type='CREATE_TASK' then coalesce((action->>'task_required')::boolean,false) else null end,
      case when action_type='CREATE_TASK' then coalesce((action->>'task_blocking')::boolean,false) else null end,
      action_order-1,actor,actor);
  end loop;
  perform public.assert_rule_graph_acyclic(target_organization_id);
  select * into item from public.rule_definitions where id=item.id;
  if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then item.created_by_user_id:=null; end if;
  if not public.is_super_admin(actor) and public.is_super_admin(item.updated_by_user_id) then item.updated_by_user_id:=null; end if;
  return item;
end $$;

alter function public.save_rule_definition(uuid,uuid,text,text,uuid,public.rule_condition_operator,uuid,boolean,integer,jsonb,timestamptz) owner to postgres;
revoke all on function public.save_rule_definition(uuid,uuid,text,text,uuid,public.rule_condition_operator,uuid,boolean,integer,jsonb,timestamptz) from public,anon;
grant execute on function public.save_rule_definition(uuid,uuid,text,text,uuid,public.rule_condition_operator,uuid,boolean,integer,jsonb,timestamptz) to authenticated;
