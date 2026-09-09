-- Materialize deterministic CREATE_TASK Rule effects with durable lineage.

-- Rule Actions that have produced operational history must remain addressable.
-- Current configuration reads exclude retired rows, while retained actions keep
-- their UUID across reorder and template edits.
alter table public.rule_actions add column retired_at timestamptz;
alter table public.rule_actions drop constraint rule_actions_rule_definition_id_display_order_key;
create unique index rule_actions_current_rule_order_uidx
  on public.rule_actions(rule_definition_id,display_order) where retired_at is null;
alter table public.rule_actions add constraint rule_actions_organization_rule_id_key
  unique(organization_id,rule_definition_id,id);

alter table public.case_tasks
  add column priority public.priority_level not null default 'NORMAL',
  add column blocking boolean not null default false,
  add column source_rule_id uuid,
  add column source_rule_action_id uuid,
  add column prior_actionable_status public.case_task_status;

alter table public.case_tasks add constraint case_tasks_rule_provenance_shape check (
  (source_rule_id is null and source_rule_action_id is null and prior_actionable_status is null)
  or
  (source_rule_id is not null and source_rule_action_id is not null
    and (prior_actionable_status is null
      or (status='NOT_APPLICABLE' and prior_actionable_status in ('NOT_STARTED','IN_PROGRESS','BLOCKED'))))
);
alter table public.case_tasks add constraint case_tasks_rule_action_provenance_fkey
  foreign key(organization_id,source_rule_id,source_rule_action_id)
  references public.rule_actions(organization_id,rule_definition_id,id) on delete restrict;
create unique index case_tasks_rule_action_lineage_uidx
  on public.case_tasks(organization_id,case_id,source_rule_action_id)
  where source_rule_action_id is not null;

drop view public.organization_case_tasks;
create view public.organization_case_tasks with (security_barrier=true) as
select t.id,t.organization_id,t.case_id,t.title,t.description,t.assigned_user_id,t.status,t.required,t.due_at,
  t.completed_at,public.organization_actor_id(t.completed_by_user_id) as completed_by_user_id,
  public.organization_actor_label(t.completed_by_user_id) as completed_by_display_name,
  t.sequence,public.organization_actor_id(t.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(t.created_by_user_id) as created_by_display_name,t.created_at,t.updated_at,
  t.priority,t.blocking,(t.source_rule_action_id is not null) as generated_by_rule
from public.case_tasks t
where public.can_access_case(t.case_id,t.organization_id,auth.uid());
revoke all on public.organization_case_tasks from public,anon;
grant select on public.organization_case_tasks to authenticated;

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
where a.retired_at is null
  and public.has_effective_organization_permission(a.organization_id,'VIEW_RULES');
revoke all on public.organization_rule_actions from public,anon,authenticated;
grant select on public.organization_rule_actions to authenticated;

create or replace function public.validate_rule_condition()
returns trigger language plpgsql set search_path='' as $$
declare source_type public.question_response_type;
begin
  select q.response_type into source_type
  from public.question_definitions q
  where q.organization_id=new.organization_id and q.id=new.source_question_id;
  if source_type is null then raise exception 'invalid rule source question' using errcode='23514'; end if;

  if new.condition_operator in ('IS_ANSWERED','IS_NOT_ANSWERED') then
    if new.condition_option_id is not null then raise exception 'general operator cannot compare an option' using errcode='23514'; end if;
  elsif new.condition_operator in ('IS_YES','IS_NO') then
    if source_type<>'YES_NO' or new.condition_option_id is not null then raise exception 'operator is incompatible with source question' using errcode='23514'; end if;
  elsif new.condition_operator in ('EQUALS','NOT_EQUALS') then
    if source_type<>'SINGLE_SELECT' or new.condition_option_id is null then raise exception 'operator is incompatible with source question' using errcode='23514'; end if;
  elsif new.condition_operator in ('CONTAINS','NOT_CONTAINS') then
    if source_type<>'MULTI_SELECT' or new.condition_option_id is null then raise exception 'operator is incompatible with source question' using errcode='23514'; end if;
  else
    raise exception 'unsupported rule operator' using errcode='23514';
  end if;
  if exists(
    select 1 from public.rule_actions a
    where a.organization_id=new.organization_id and a.rule_definition_id=new.id
      and a.retired_at is null and a.action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
      and a.target_question_id=new.source_question_id
  ) then
    raise exception 'rule cannot directly target its source question' using errcode='23514';
  end if;
  return new;
end $$;

create or replace function public.assert_rule_graph_acyclic(target_organization_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
declare has_cycle boolean;
begin
  with recursive edges(source_question_id,target_question_id) as (
    select r.source_question_id,a.target_question_id
    from public.rule_definitions r
    join public.rule_actions a on a.organization_id=r.organization_id and a.rule_definition_id=r.id
    where r.organization_id=target_organization_id and r.active and a.retired_at is null
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
  requested_action_type public.rule_action_type; target_question uuid; existing_action public.rule_actions;
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

  if exists(
    select submitted->>'id' from jsonb_array_elements(target_actions) submitted
    where nullif(submitted->>'id','') is not null
    group by submitted->>'id' having count(*)>1
  ) then raise exception 'duplicate rule action' using errcode='23514'; end if;

  for action in select value from jsonb_array_elements(target_actions) loop
    requested_action_type:=(action->>'action_type')::public.rule_action_type;
    action_id:=nullif(action->>'id','')::uuid;
    target_question:=nullif(action->>'target_question_id','')::uuid;
    if action_id is not null then
      select * into existing_action from public.rule_actions
      where id=action_id and organization_id=target_organization_id
        and rule_definition_id=item.id and retired_at is null;
      if not found then raise exception 'invalid rule action' using errcode='23514'; end if;
    else existing_action:=null; end if;
    if requested_action_type in ('SHOW_QUESTION','REQUIRE_QUESTION') then
      if target_question=item.source_question_id then raise exception 'rule cannot directly target its source question' using errcode='23514'; end if;
      if not exists(
        select 1 from public.question_definitions q where q.id=target_question and q.organization_id=target_organization_id
          and (q.active or (existing_action.id is not null and existing_action.action_type=requested_action_type and existing_action.target_question_id=target_question))
      ) then raise exception 'select an active target question' using errcode='23514'; end if;
    elsif requested_action_type='CREATE_TASK' then
      if length(trim(coalesce(action->>'task_title','')))=0 then raise exception 'task title is required' using errcode='23514'; end if;
      perform (action->>'task_priority')::public.priority_level;
    end if;
  end loop;

  -- Omitted actions and type changes are retired instead of deleted so any
  -- generated Task keeps valid historical provenance.
  update public.rule_actions current_action set retired_at=now()
  where current_action.organization_id=target_organization_id
    and current_action.rule_definition_id=item.id and current_action.retired_at is null
    and not exists(
      select 1 from jsonb_array_elements(target_actions) submitted
      where nullif(submitted->>'id','')::uuid=current_action.id
        and (submitted->>'action_type')::public.rule_action_type=current_action.action_type
    );
  update public.rule_actions set display_order=display_order+1000000
  where organization_id=target_organization_id and rule_definition_id=item.id and retired_at is null;

  for action,action_order in select value,ordinality from jsonb_array_elements(target_actions) with ordinality loop
    requested_action_type:=(action->>'action_type')::public.rule_action_type;
    action_id:=nullif(action->>'id','')::uuid;
    if action_id is not null then
      select * into existing_action from public.rule_actions current_action
      where current_action.id=action_id and current_action.organization_id=target_organization_id
        and current_action.rule_definition_id=item.id and current_action.retired_at is null
        and current_action.action_type=requested_action_type;
    else existing_action:=null; end if;
    if existing_action.id is null then action_id:=gen_random_uuid(); end if;

    if existing_action.id is not null then
      update public.rule_actions set
        target_question_id=case when requested_action_type in ('SHOW_QUESTION','REQUIRE_QUESTION') then nullif(action->>'target_question_id','')::uuid else null end,
        task_title=case when requested_action_type='CREATE_TASK' then nullif(trim(action->>'task_title'),'') else null end,
        task_description=case when requested_action_type='CREATE_TASK' then coalesce(trim(action->>'task_description'),'') else null end,
        task_priority=case when requested_action_type='CREATE_TASK' then nullif(action->>'task_priority','')::public.priority_level else null end,
        task_required=case when requested_action_type='CREATE_TASK' then coalesce((action->>'task_required')::boolean,false) else null end,
        task_blocking=case when requested_action_type='CREATE_TASK' then coalesce((action->>'task_blocking')::boolean,false) else null end,
        display_order=action_order-1
      where id=action_id;
    else
      insert into public.rule_actions(id,organization_id,rule_definition_id,action_type,target_question_id,
        task_title,task_description,task_priority,task_required,task_blocking,display_order,created_by_user_id,updated_by_user_id)
      values(action_id,target_organization_id,item.id,requested_action_type,
        case when requested_action_type in ('SHOW_QUESTION','REQUIRE_QUESTION') then nullif(action->>'target_question_id','')::uuid else null end,
        case when requested_action_type='CREATE_TASK' then nullif(trim(action->>'task_title'),'') else null end,
        case when requested_action_type='CREATE_TASK' then coalesce(trim(action->>'task_description'),'') else null end,
        case when requested_action_type='CREATE_TASK' then nullif(action->>'task_priority','')::public.priority_level else null end,
        case when requested_action_type='CREATE_TASK' then coalesce((action->>'task_required')::boolean,false) else null end,
        case when requested_action_type='CREATE_TASK' then coalesce((action->>'task_blocking')::boolean,false) else null end,
        action_order-1,actor,actor);
    end if;
  end loop;
  perform public.assert_rule_graph_acyclic(target_organization_id);
  select * into item from public.rule_definitions where id=item.id;
  if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then item.created_by_user_id:=null; end if;
  if not public.is_super_admin(actor) and public.is_super_admin(item.updated_by_user_id) then item.updated_by_user_id:=null; end if;
  return item;
end $$;

alter table public.case_activity drop constraint case_activity_event_type_check;
alter table public.case_activity add constraint case_activity_event_type_check check(event_type in (
  'CASE_CREATED','CASE_ASSIGNED','CASE_UNASSIGNED','STATUS_CHANGED','PRIORITY_CHANGED','DUE_DATE_CHANGED',
  'TASK_CREATED','TASK_UPDATED','TASK_DELETED','TASK_ASSIGNED','TASK_STARTED','TASK_COMPLETED',
  'CUSTOMER_RESPONSE_RECEIVED','CASE_MOVED_TO_REVIEW','CASE_COMPLETED','CASE_REOPENED',
  'QUESTION_RESPONSE_UPDATED','CUSTOMER_CHANGED','RULE_TASK_CREATED','RULE_TASK_NOT_APPLICABLE','RULE_TASK_REACTIVATED'
));

create or replace function public.delete_case_task(target_task_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.case_tasks;
begin
  select * into existing from public.case_tasks where id=target_task_id for update;
  if not found then raise exception 'task not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(existing.organization_id,'MANAGE_TASKS')
    or not public.can_access_case(existing.case_id,existing.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  if existing.source_rule_action_id is not null then raise exception 'rule-generated tasks retain history' using errcode='23514'; end if;
  delete from public.case_tasks where id=existing.id;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
  values(existing.organization_id,existing.case_id,actor,'TASK_DELETED',jsonb_build_object('task_id',existing.id,'title',existing.title));
end $$;

create or replace function public.update_case_task(target_task_id uuid,target_title text,target_description text,target_assigned_user_id uuid,target_status public.case_task_status,target_required boolean,target_due_at timestamptz)
returns public.case_tasks language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.case_tasks; changed public.case_tasks; event_name text:='TASK_UPDATED';
begin
  select * into existing from public.case_tasks where id=target_task_id for update;
  if not found then raise exception 'task not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(existing.organization_id,'WORK_TASKS') then raise exception 'not authorized' using errcode='42501'; end if;
  if not public.can_access_case(existing.case_id,existing.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  if not public.can_manage_case(existing.organization_id,actor) and existing.assigned_user_id<>actor
    and not public.has_effective_organization_permission(existing.organization_id,'MANAGE_TASKS') then raise exception 'not authorized' using errcode='42501'; end if;
  if (target_title<>existing.title or target_description<>existing.description or target_required<>existing.required or target_due_at is distinct from existing.due_at)
    and not public.has_effective_organization_permission(existing.organization_id,'MANAGE_TASKS') then raise exception 'task management permission required' using errcode='42501'; end if;
  if target_assigned_user_id is distinct from existing.assigned_user_id
    and not public.has_effective_organization_permission(existing.organization_id,'ASSIGN_TASKS') then raise exception 'task assignment permission required' using errcode='42501'; end if;
  if target_assigned_user_id is not null and not public.is_internal_member(existing.organization_id,target_assigned_user_id) then raise exception 'invalid task assignee' using errcode='23514'; end if;
  update public.case_tasks set title=trim(target_title),description=coalesce(target_description,''),assigned_user_id=target_assigned_user_id,status=target_status,required=target_required,due_at=target_due_at,
    completed_at=case when target_status='COMPLETED' then coalesce(completed_at,now()) else null end,
    completed_by_user_id=case when target_status='COMPLETED' then actor else null end,
    prior_actionable_status=case when target_status='NOT_APPLICABLE' then prior_actionable_status else null end
    where id=existing.id returning * into changed;
  if target_status='COMPLETED' and existing.status<>'COMPLETED' then event_name:='TASK_COMPLETED'; elsif target_status='IN_PROGRESS' and existing.status<>'IN_PROGRESS' then event_name:='TASK_STARTED'; elsif target_assigned_user_id is distinct from existing.assigned_user_id then event_name:='TASK_ASSIGNED'; end if;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(changed.organization_id,changed.case_id,actor,event_name,jsonb_build_object('task_id',changed.id,'before_status',existing.status,'after_status',changed.status,'before_assigned_user_id',existing.assigned_user_id,'after_assigned_user_id',changed.assigned_user_id));
  if not public.is_super_admin(actor) and public.is_super_admin(changed.created_by_user_id) then changed.created_by_user_id:=null; end if;
  if not public.is_super_admin(actor) and public.is_super_admin(changed.completed_by_user_id) then changed.completed_by_user_id:=null; end if;
  return changed;
end $$;

create function public.synchronize_case_rule_tasks(
  target_organization_id uuid,
  target_case_id uuid,
  target_effective_action_ids uuid[],
  target_actor_user_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare
  item public.cases; action public.rule_actions; changed public.case_tasks; next_sequence integer;
  effective_action_ids uuid[]:=coalesce(target_effective_action_ids,'{}'::uuid[]);
  actor_role public.application_role; actor_can_create boolean:=false; actor_can_work boolean:=false; actor_can_manage_rules boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  select * into item from public.cases
  where id=target_case_id and organization_id=target_organization_id for update;
  if not found then raise exception 'case not found' using errcode='P0002'; end if;
  if target_actor_user_id is null or not public.is_valid_organization_actor(target_organization_id,target_actor_user_id)
    then raise exception 'invalid synchronization actor' using errcode='42501'; end if;
  if public.is_super_admin(target_actor_user_id) then
    actor_can_create:=true; actor_can_work:=true; actor_can_manage_rules:=true;
  else
    select m.role into actor_role from public.organization_members m
    where m.organization_id=target_organization_id and m.user_id=target_actor_user_id and m.is_active
      and m.role in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER');
    actor_can_create:=coalesce(public.effective_organization_role_permission(target_organization_id,actor_role,'CREATE_CASE'),false);
    actor_can_work:=coalesce(public.effective_organization_role_permission(target_organization_id,actor_role,'WORK_CASES'),false);
    actor_can_manage_rules:=coalesce(public.effective_organization_role_permission(target_organization_id,actor_role,'MANAGE_RULES'),false);
  end if;
  if not (((actor_can_create or actor_can_work) and public.can_access_case(target_case_id,target_organization_id,target_actor_user_id))
    or actor_can_manage_rules) then raise exception 'not authorized' using errcode='42501'; end if;
  if exists(
    select 1 from unnest(effective_action_ids) requested(id)
    left join public.rule_actions a on a.id=requested.id and a.organization_id=target_organization_id
      and a.action_type='CREATE_TASK' and a.retired_at is null
    left join public.rule_definitions r on r.id=a.rule_definition_id
      and r.organization_id=a.organization_id and r.active
    where a.id is null or r.id is null
  ) then raise exception 'invalid effective Rule action' using errcode='23514'; end if;

  for action in
    select a.* from public.rule_actions a
    join public.rule_definitions r on r.organization_id=a.organization_id and r.id=a.rule_definition_id
    where a.organization_id=target_organization_id and a.id=any(effective_action_ids)
      and a.action_type='CREATE_TASK' and a.retired_at is null and r.active
    order by r.display_order,a.display_order,a.id
  loop
    select coalesce(max(sequence),0)+1 into next_sequence from public.case_tasks where case_id=target_case_id;
    insert into public.case_tasks(
      organization_id,case_id,title,description,status,required,sequence,created_by_user_id,
      priority,blocking,source_rule_id,source_rule_action_id
    ) values(
      target_organization_id,target_case_id,action.task_title,action.task_description,'NOT_STARTED',
      action.task_required,next_sequence,target_actor_user_id,action.task_priority,action.task_blocking,
      action.rule_definition_id,action.id
    ) on conflict(organization_id,case_id,source_rule_action_id)
      where source_rule_action_id is not null do nothing
    returning * into changed;
    if changed.id is not null then
      insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
      values(target_organization_id,target_case_id,target_actor_user_id,'RULE_TASK_CREATED',
        jsonb_build_object('task_id',changed.id,'title',changed.title));
    end if;
    changed:=null;
  end loop;

  for changed in
    update public.case_tasks set status=coalesce(prior_actionable_status,'NOT_STARTED'),prior_actionable_status=null
    where organization_id=target_organization_id and case_id=target_case_id
      and source_rule_action_id=any(effective_action_ids) and status='NOT_APPLICABLE'
    returning *
  loop
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
    values(target_organization_id,target_case_id,target_actor_user_id,'RULE_TASK_REACTIVATED',
      jsonb_build_object('task_id',changed.id,'title',changed.title,'after_status',changed.status));
  end loop;

  for changed in
    update public.case_tasks set prior_actionable_status=status,status='NOT_APPLICABLE'
    where organization_id=target_organization_id and case_id=target_case_id
      and source_rule_action_id is not null and not(source_rule_action_id=any(effective_action_ids))
      and status in ('NOT_STARTED','IN_PROGRESS','BLOCKED')
    returning *
  loop
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
    values(target_organization_id,target_case_id,target_actor_user_id,'RULE_TASK_NOT_APPLICABLE',
      jsonb_build_object('task_id',changed.id,'title',changed.title,'before_status',changed.prior_actionable_status));
  end loop;
end $$;

alter function public.synchronize_case_rule_tasks(uuid,uuid,uuid[],uuid) owner to postgres;
revoke all on function public.synchronize_case_rule_tasks(uuid,uuid,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.synchronize_case_rule_tasks(uuid,uuid,uuid[],uuid) to service_role;
