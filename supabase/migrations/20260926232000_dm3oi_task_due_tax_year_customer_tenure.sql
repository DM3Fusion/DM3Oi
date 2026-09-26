-- Case tax year, mandatory due-date semantics, and staged intake follow-ups.
-- Historical Cases and Tasks remain unchanged.

create schema if not exists private;
revoke all on schema private from public,anon,authenticated;

alter table public.cases
  add column tax_year integer;
alter table public.cases
  add constraint cases_tax_year_valid
  check (tax_year is null or tax_year between 1900 and 2200);
create index cases_organization_tax_year_customer_idx
  on public.cases(organization_id,tax_year,customer_id)
  where tax_year is not null;

alter table public.guided_case_intake_drafts
  add column tax_year integer,
  add column follow_up_tasks jsonb not null default '[]'::jsonb;
alter table public.guided_case_intake_drafts
  add constraint guided_case_intake_drafts_tax_year_valid
    check (tax_year is null or tax_year between 1900 and 2200),
  add constraint guided_case_intake_drafts_follow_up_tasks_array
    check (jsonb_typeof(follow_up_tasks)='array');

alter table public.rule_actions
  add column task_due_in_days integer;

-- Existing active and retired CREATE_TASK templates keep working with a
-- conservative relative default. This does not modify any historical Task.
-- This is a migration-owned configuration backfill, so bypass only the
-- application actor-stamping trigger while preserving all other safeguards.
alter table public.rule_actions disable trigger rule_actions_stamp_actor;

update public.rule_actions
set task_due_in_days=7
where action_type='CREATE_TASK' and task_due_in_days is null;

-- The Rule graph constraint trigger is DEFERRABLE INITIALLY DEFERRED.
-- Flush its queued validation before the next ALTER TABLE on rule_actions.
set constraints rule_actions_graph_acyclic immediate;

alter table public.rule_actions enable trigger rule_actions_stamp_actor;

alter table public.rule_actions drop constraint rule_actions_target_shape;
alter table public.rule_actions
  add constraint rule_actions_target_shape check (
    (
      action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
      and target_question_id is not null
      and task_title is null and task_description is null
      and task_priority is null and task_required is null
      and task_blocking is null and task_due_in_days is null
    )
    or
    (
      action_type='CREATE_TASK'
      and target_question_id is null
      and task_title is not null and length(trim(task_title))>0
      and task_description is not null
      and task_priority is not null
      and task_required is not null
      and task_blocking is not null
      and task_due_in_days between 0 and 3650
    )
  );

alter table public.case_tasks
  add column intake_follow_up_id uuid,
  add column intake_question_definition_id uuid,
  add column intake_requirement_context jsonb;
alter table public.case_tasks
  add constraint case_tasks_intake_question_fkey
  foreign key(organization_id,intake_question_definition_id)
  references public.question_definitions(organization_id,id) on delete restrict;
alter table public.case_tasks
  add constraint case_tasks_intake_follow_up_shape check (
    (intake_follow_up_id is null and intake_question_definition_id is null and intake_requirement_context is null)
    or
    (intake_follow_up_id is not null and intake_question_definition_id is not null
      and jsonb_typeof(intake_requirement_context)='object'
      and jsonb_typeof(intake_requirement_context->'missing_option_ids')='array'
      and jsonb_array_length(intake_requirement_context->'missing_option_ids')>0)
  );
create unique index case_tasks_intake_follow_up_uidx
  on public.case_tasks(organization_id,case_id,intake_follow_up_id)
  where intake_follow_up_id is not null;

create or replace function public.organization_end_of_date(
  target_organization_id uuid,
  target_date date
) returns timestamptz
language sql stable security definer set search_path=''
as $$
  select (
    ((target_date+1)::timestamp at time zone coalesce(settings.timezone,'UTC'))
    - interval '1 microsecond'
  )
  from (select 1) seed
  left join public.organization_settings settings
    on settings.organization_id=target_organization_id
$$;

create or replace function public.organization_task_due_at(
  target_organization_id uuid,
  target_due_in_days integer
) returns timestamptz
language sql stable security definer set search_path=''
as $$
  select public.organization_end_of_date(
    target_organization_id,
    (now() at time zone coalesce(settings.timezone,'UTC'))::date+target_due_in_days
  )
  from (select 1) seed
  left join public.organization_settings settings
    on settings.organization_id=target_organization_id
$$;

revoke all on function public.organization_end_of_date(uuid,date),public.organization_task_due_at(uuid,integer)
  from public,anon,authenticated;

create or replace function public.prepare_case_task_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
declare relative_days integer; requirement_satisfied boolean;
begin
  if tg_op='INSERT' and new.due_at is null and new.source_rule_action_id is not null then
    select action.task_due_in_days into relative_days
    from public.rule_actions action
    where action.id=new.source_rule_action_id
      and action.organization_id=new.organization_id
      and action.action_type='CREATE_TASK';
    if relative_days is not null then
      new.due_at:=public.organization_task_due_at(new.organization_id,relative_days);
    end if;
  end if;
  if tg_op='INSERT' and new.due_at is null then
    raise exception 'Task Due Date is required' using errcode='23514';
  end if;
  if tg_op='UPDATE' and old.due_at is not null and new.due_at is null then
    raise exception 'Task Due Date cannot be cleared' using errcode='23514';
  end if;

  if new.status='COMPLETED' and new.intake_follow_up_id is not null
    and (tg_op='INSERT' or old.status<>'COMPLETED') then
    select exists(
      select 1
      from public.case_questions question
      join public.case_question_responses response
        on response.case_question_id=question.id
       and response.case_id=question.case_id
       and response.organization_id=question.organization_id
      where question.case_id=new.case_id
        and question.organization_id=new.organization_id
        and question.question_definition_id=new.intake_question_definition_id
        and jsonb_typeof(response.response_value)='array'
        and not exists(
          select 1
          from jsonb_array_elements_text(new.intake_requirement_context->'missing_option_ids') missing(value)
          where not(response.response_value ? missing.value)
        )
    ) into requirement_satisfied;
    if not coalesce(requirement_satisfied,false) then
      raise exception 'missing documents prevent follow-up Task completion' using errcode='23514';
    end if;
  end if;

  if new.status='COMPLETED' then
    if tg_op='INSERT' or old.status<>'COMPLETED' then
      new.completed_at:=now();
      new.completed_by_user_id:=coalesce(auth.uid(),new.created_by_user_id);
    else
      new.completed_at:=old.completed_at;
      new.completed_by_user_id:=old.completed_by_user_id;
    end if;
  else
    new.completed_at:=null;
    new.completed_by_user_id:=null;
  end if;
  return new;
end $$;

create trigger case_tasks_prepare_lifecycle
before insert or update on public.case_tasks
for each row execute function public.prepare_case_task_lifecycle();
revoke all on function public.prepare_case_task_lifecycle()
  from public,anon,authenticated;

drop function public.create_case_task(uuid,text,text,uuid,boolean,timestamptz);
create function public.create_case_task(
  target_case_id uuid,
  target_title text,
  target_description text default '',
  target_assigned_user_id uuid default null,
  target_required boolean default true,
  target_due_date date default null,
  target_priority public.priority_level default 'NORMAL',
  target_blocking boolean default false
) returns public.case_tasks language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.cases; created public.case_tasks; next_sequence integer;
begin
  select * into item from public.cases where id=target_case_id for update;
  if not found then raise exception 'case not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(item.organization_id,'MANAGE_TASKS')
    or not public.can_access_case(item.id,item.organization_id,actor)
    then raise exception 'not authorized' using errcode='42501'; end if;
  if length(trim(coalesce(target_title,'')))=0 then raise exception 'Task title is required' using errcode='23514'; end if;
  if target_due_date is null then raise exception 'Task Due Date is required' using errcode='23514'; end if;
  if target_assigned_user_id is not null and not public.is_internal_member(item.organization_id,target_assigned_user_id)
    then raise exception 'invalid task assignee' using errcode='23514'; end if;
  select coalesce(max(sequence),0)+1 into next_sequence from public.case_tasks where case_id=item.id;
  insert into public.case_tasks(
    organization_id,case_id,title,description,assigned_user_id,status,required,due_at,
    sequence,created_by_user_id,priority,blocking
  ) values(
    item.organization_id,item.id,trim(target_title),coalesce(target_description,''),target_assigned_user_id,
    'NOT_STARTED',target_required,public.organization_end_of_date(item.organization_id,target_due_date),
    next_sequence,actor,target_priority,target_blocking
  ) returning * into created;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
  values(item.organization_id,item.id,actor,'TASK_CREATED',jsonb_build_object('task_id',created.id,'title',created.title));
  return created;
end $$;

drop function public.update_case_task(uuid,text,text,uuid,public.case_task_status,boolean,timestamptz);
create function public.update_case_task(
  target_task_id uuid,
  target_title text,
  target_description text,
  target_assigned_user_id uuid,
  target_status public.case_task_status,
  target_required boolean,
  target_due_date date
) returns public.case_tasks language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.case_tasks; changed public.case_tasks; event_name text:='TASK_UPDATED'; can_manage boolean;
begin
  select * into existing from public.case_tasks where id=target_task_id for update;
  if not found then raise exception 'task not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(existing.organization_id,'WORK_TASKS')
    or not public.can_access_case(existing.case_id,existing.organization_id,actor)
    then raise exception 'not authorized' using errcode='42501'; end if;
  can_manage:=public.has_effective_organization_permission(existing.organization_id,'MANAGE_TASKS');
  if not public.can_manage_case(existing.organization_id,actor) and existing.assigned_user_id<>actor and not can_manage
    then raise exception 'not authorized' using errcode='42501'; end if;
  if (target_title<>existing.title or target_description<>existing.description or target_required<>existing.required or target_due_date is not null)
    and not can_manage then raise exception 'task management permission required' using errcode='42501'; end if;
  if can_manage and target_due_date is null then raise exception 'Task Due Date is required when updating a Task' using errcode='23514'; end if;
  if target_assigned_user_id is distinct from existing.assigned_user_id
    and not public.has_effective_organization_permission(existing.organization_id,'ASSIGN_TASKS')
    then raise exception 'task assignment permission required' using errcode='42501'; end if;
  if target_assigned_user_id is not null and not public.is_internal_member(existing.organization_id,target_assigned_user_id)
    then raise exception 'invalid task assignee' using errcode='23514'; end if;
  update public.case_tasks set
    title=case when can_manage then trim(target_title) else existing.title end,
    description=case when can_manage then coalesce(target_description,'') else existing.description end,
    assigned_user_id=target_assigned_user_id,status=target_status,
    required=case when can_manage then target_required else existing.required end,
    due_at=case when target_due_date is null then existing.due_at else public.organization_end_of_date(existing.organization_id,target_due_date) end,
    prior_actionable_status=case when target_status='NOT_APPLICABLE' then prior_actionable_status else null end
  where id=existing.id returning * into changed;
  if target_status='COMPLETED' and existing.status<>'COMPLETED' then event_name:='TASK_COMPLETED';
  elsif target_status='IN_PROGRESS' and existing.status<>'IN_PROGRESS' then event_name:='TASK_STARTED';
  elsif target_assigned_user_id is distinct from existing.assigned_user_id then event_name:='TASK_ASSIGNED'; end if;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
  values(changed.organization_id,changed.case_id,actor,event_name,jsonb_build_object(
    'task_id',changed.id,'before_status',existing.status,'after_status',changed.status,
    'before_assigned_user_id',existing.assigned_user_id,'after_assigned_user_id',changed.assigned_user_id
  ));
  return changed;
end $$;

revoke all on function public.create_case_task(uuid,text,text,uuid,boolean,date,public.priority_level,boolean),public.update_case_task(uuid,text,text,uuid,public.case_task_status,boolean,date)
  from public,anon;
grant execute on function public.create_case_task(uuid,text,text,uuid,boolean,date,public.priority_level,boolean),public.update_case_task(uuid,text,text,uuid,public.case_task_status,boolean,date)
  to authenticated;

create or replace function public.save_rule_definition(
  target_organization_id uuid,target_rule_id uuid,target_name text,target_description text,
  target_source_question_id uuid,target_condition_operator public.rule_condition_operator,
  target_condition_option_id uuid,target_active boolean,target_display_order integer,
  target_actions jsonb,expected_updated_at timestamptz default null
) returns public.rule_definitions language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); item public.rule_definitions; action jsonb; action_id uuid; action_order bigint;
  requested_action_type public.rule_action_type; target_question uuid; existing_action public.rule_actions; due_days integer;
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
    if expected_updated_at is null or item.updated_at<>expected_updated_at then raise exception 'rule configuration changed' using errcode='40001'; end if;
    if item.source_question_id<>target_source_question_id and not exists(select 1 from public.question_definitions q where q.id=target_source_question_id and q.organization_id=target_organization_id and q.active)
      then raise exception 'select an active source question' using errcode='23514'; end if;
    update public.rule_definitions set name=trim(target_name),description=coalesce(trim(target_description),''),source_question_id=target_source_question_id,
      condition_operator=target_condition_operator,condition_option_id=target_condition_option_id,active=target_active,display_order=target_display_order
    where id=item.id returning * into item;
  end if;
  if exists(select submitted->>'id' from jsonb_array_elements(target_actions) submitted where nullif(submitted->>'id','') is not null group by submitted->>'id' having count(*)>1)
    then raise exception 'duplicate rule action' using errcode='23514'; end if;
  for action in select value from jsonb_array_elements(target_actions) loop
    requested_action_type:=(action->>'action_type')::public.rule_action_type;
    action_id:=nullif(action->>'id','')::uuid;
    target_question:=nullif(action->>'target_question_id','')::uuid;
    if action_id is not null then
      select * into existing_action from public.rule_actions where id=action_id and organization_id=target_organization_id and rule_definition_id=item.id and retired_at is null;
      if not found then raise exception 'invalid rule action' using errcode='23514'; end if;
    else existing_action:=null; end if;
    if requested_action_type in ('SHOW_QUESTION','REQUIRE_QUESTION') then
      if target_question=item.source_question_id then raise exception 'rule cannot directly target its source question' using errcode='23514'; end if;
      if not exists(select 1 from public.question_definitions q where q.id=target_question and q.organization_id=target_organization_id
        and (q.active or (existing_action.id is not null and existing_action.action_type=requested_action_type and existing_action.target_question_id=target_question)))
        then raise exception 'select an active target question' using errcode='23514'; end if;
    elsif requested_action_type='CREATE_TASK' then
      if length(trim(coalesce(action->>'task_title','')))=0 then raise exception 'task title is required' using errcode='23514'; end if;
      perform (action->>'task_priority')::public.priority_level;
      due_days:=nullif(action->>'task_due_in_days','')::integer;
      if due_days is null or due_days<0 or due_days>3650 then raise exception 'valid due_in_days is required' using errcode='23514'; end if;
    end if;
  end loop;
  update public.rule_actions current_action set retired_at=now()
  where current_action.organization_id=target_organization_id and current_action.rule_definition_id=item.id and current_action.retired_at is null
    and not exists(select 1 from jsonb_array_elements(target_actions) submitted where nullif(submitted->>'id','')::uuid=current_action.id
      and (submitted->>'action_type')::public.rule_action_type=current_action.action_type);
  update public.rule_actions set display_order=display_order+1000000
  where organization_id=target_organization_id and rule_definition_id=item.id and retired_at is null;
  for action,action_order in select value,ordinality from jsonb_array_elements(target_actions) with ordinality loop
    requested_action_type:=(action->>'action_type')::public.rule_action_type;
    action_id:=nullif(action->>'id','')::uuid;
    if action_id is not null then
      select * into existing_action from public.rule_actions current_action where current_action.id=action_id and current_action.organization_id=target_organization_id
        and current_action.rule_definition_id=item.id and current_action.retired_at is null and current_action.action_type=requested_action_type;
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
        task_due_in_days=case when requested_action_type='CREATE_TASK' then nullif(action->>'task_due_in_days','')::integer else null end,
        display_order=action_order-1 where id=action_id;
    else
      insert into public.rule_actions(id,organization_id,rule_definition_id,action_type,target_question_id,task_title,task_description,task_priority,task_required,task_blocking,task_due_in_days,display_order,created_by_user_id,updated_by_user_id)
      values(action_id,target_organization_id,item.id,requested_action_type,
        case when requested_action_type in ('SHOW_QUESTION','REQUIRE_QUESTION') then nullif(action->>'target_question_id','')::uuid else null end,
        case when requested_action_type='CREATE_TASK' then nullif(trim(action->>'task_title'),'') else null end,
        case when requested_action_type='CREATE_TASK' then coalesce(trim(action->>'task_description'),'') else null end,
        case when requested_action_type='CREATE_TASK' then nullif(action->>'task_priority','')::public.priority_level else null end,
        case when requested_action_type='CREATE_TASK' then coalesce((action->>'task_required')::boolean,false) else null end,
        case when requested_action_type='CREATE_TASK' then coalesce((action->>'task_blocking')::boolean,false) else null end,
        case when requested_action_type='CREATE_TASK' then nullif(action->>'task_due_in_days','')::integer else null end,
        action_order-1,actor,actor);
    end if;
  end loop;
  perform public.assert_rule_graph_acyclic(target_organization_id);
  select * into item from public.rule_definitions where id=item.id;
  if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then item.created_by_user_id:=null; end if;
  if not public.is_super_admin(actor) and public.is_super_admin(item.updated_by_user_id) then item.updated_by_user_id:=null; end if;
  return item;
end $$;

create or replace function public.synchronize_case_rule_tasks(
  target_organization_id uuid,target_case_id uuid,target_effective_action_ids uuid[],target_actor_user_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare item public.cases; action public.rule_actions; changed public.case_tasks; next_sequence integer;
  effective_action_ids uuid[]:=coalesce(target_effective_action_ids,'{}'::uuid[]);
  actor_role public.application_role; actor_can_create boolean:=false; actor_can_work boolean:=false; actor_can_manage_rules boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  select * into item from public.cases where id=target_case_id and organization_id=target_organization_id for update;
  if not found then raise exception 'case not found' using errcode='P0002'; end if;
  if target_actor_user_id is null or not public.is_valid_organization_actor(target_organization_id,target_actor_user_id)
    then raise exception 'invalid synchronization actor' using errcode='42501'; end if;
  if public.is_super_admin(target_actor_user_id) then actor_can_create:=true;actor_can_work:=true;actor_can_manage_rules:=true;
  else
    select m.role into actor_role from public.organization_members m where m.organization_id=target_organization_id and m.user_id=target_actor_user_id and m.is_active
      and m.role in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER');
    actor_can_create:=coalesce(public.effective_organization_role_permission(target_organization_id,actor_role,'CREATE_CASE'),false);
    actor_can_work:=coalesce(public.effective_organization_role_permission(target_organization_id,actor_role,'WORK_CASES'),false);
    actor_can_manage_rules:=coalesce(public.effective_organization_role_permission(target_organization_id,actor_role,'MANAGE_RULES'),false);
  end if;
  if not (((actor_can_create or actor_can_work) and public.can_access_case(target_case_id,target_organization_id,target_actor_user_id)) or actor_can_manage_rules)
    then raise exception 'not authorized' using errcode='42501'; end if;
  if exists(select 1 from unnest(effective_action_ids) requested(id)
    left join public.rule_actions a on a.id=requested.id and a.organization_id=target_organization_id and a.action_type='CREATE_TASK' and a.retired_at is null
    left join public.rule_definitions r on r.id=a.rule_definition_id and r.organization_id=a.organization_id and r.active where a.id is null or r.id is null)
    then raise exception 'invalid effective Rule action' using errcode='23514'; end if;
  for action in select a.* from public.rule_actions a join public.rule_definitions r on r.organization_id=a.organization_id and r.id=a.rule_definition_id
    where a.organization_id=target_organization_id and a.id=any(effective_action_ids) and a.action_type='CREATE_TASK' and a.retired_at is null and r.active
    order by r.display_order,a.display_order,a.id loop
    select coalesce(max(sequence),0)+1 into next_sequence from public.case_tasks where case_id=target_case_id;
    insert into public.case_tasks(organization_id,case_id,title,description,status,required,due_at,sequence,created_by_user_id,priority,blocking,source_rule_id,source_rule_action_id)
    values(target_organization_id,target_case_id,action.task_title,action.task_description,'NOT_STARTED',action.task_required,
      public.organization_task_due_at(target_organization_id,action.task_due_in_days),next_sequence,target_actor_user_id,action.task_priority,action.task_blocking,action.rule_definition_id,action.id)
    on conflict(organization_id,case_id,source_rule_action_id) where source_rule_action_id is not null do nothing returning * into changed;
    if changed.id is not null then insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
      values(target_organization_id,target_case_id,target_actor_user_id,'RULE_TASK_CREATED',jsonb_build_object('task_id',changed.id,'title',changed.title)); end if;
    changed:=null;
  end loop;
  for changed in update public.case_tasks set status=coalesce(prior_actionable_status,'NOT_STARTED'),prior_actionable_status=null
    where organization_id=target_organization_id and case_id=target_case_id and source_rule_action_id=any(effective_action_ids) and status='NOT_APPLICABLE' returning * loop
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
    values(target_organization_id,target_case_id,target_actor_user_id,'RULE_TASK_REACTIVATED',jsonb_build_object('task_id',changed.id,'title',changed.title,'after_status',changed.status));
  end loop;
  for changed in update public.case_tasks set prior_actionable_status=status,status='NOT_APPLICABLE'
    where organization_id=target_organization_id and case_id=target_case_id and source_rule_action_id is not null and not(source_rule_action_id=any(effective_action_ids))
      and status in ('NOT_STARTED','IN_PROGRESS','BLOCKED') returning * loop
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
    values(target_organization_id,target_case_id,target_actor_user_id,'RULE_TASK_NOT_APPLICABLE',jsonb_build_object('task_id',changed.id,'title',changed.title,'before_status',changed.prior_actionable_status));
  end loop;
end $$;

-- Preserve the proven atomic implementations as private helpers and expose
-- only tax-year-aware public boundaries.
alter function public.create_case_workflow(uuid,uuid,text,text,text,public.priority_level,timestamptz,uuid,uuid[],jsonb)
  set schema private;
alter function public.create_guided_case_intake(uuid,uuid,uuid,uuid,text,uuid,public.priority_level,uuid,uuid[],jsonb)
  set schema private;
revoke all on function private.create_case_workflow(uuid,uuid,text,text,text,public.priority_level,timestamptz,uuid,uuid[],jsonb),private.create_guided_case_intake(uuid,uuid,uuid,uuid,text,uuid,public.priority_level,uuid,uuid[],jsonb)
  from public,anon,authenticated;

create function public.create_case_workflow(
  target_organization_id uuid,target_customer_id uuid,target_title text,target_description text,target_case_type text,
  target_priority public.priority_level,target_tax_year integer,target_due_at timestamptz default null,
  target_manager_user_id uuid default null,target_staff_user_ids uuid[] default '{}'::uuid[],target_initial_tasks jsonb default '[]'::jsonb
) returns public.cases language plpgsql security definer set search_path='' as $$
declare created public.cases;
begin
  if target_tax_year is null or target_tax_year not between 1900 and 2200 then raise exception 'valid Case tax year is required' using errcode='23514'; end if;
  if jsonb_typeof(target_initial_tasks)<>'array' then raise exception 'initial tasks must be an array' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(target_initial_tasks) task where nullif(task->>'due_at','') is null)
    then raise exception 'every initial Task requires a Due Date' using errcode='23514'; end if;
  created:=private.create_case_workflow(target_organization_id,target_customer_id,target_title,target_description,target_case_type,target_priority,
    target_due_at,target_manager_user_id,target_staff_user_ids,target_initial_tasks);
  update public.cases set tax_year=target_tax_year
  where id=created.id and (tax_year is null or tax_year=target_tax_year)
  returning * into created;
  if not found then raise exception 'Case tax year is immutable through creation replay' using errcode='23514'; end if;
  return created;
end $$;

create function public.create_guided_case_intake(
  target_organization_id uuid,target_submission_key uuid,target_customer_id uuid,target_case_title_id uuid,
  target_description text,target_case_type_id uuid,target_priority public.priority_level,target_tax_year integer,
  target_manager_user_id uuid default null,target_staff_user_ids uuid[] default '{}'::uuid[],
  target_answers jsonb default '{}'::jsonb,target_follow_up_tasks jsonb default '[]'::jsonb
) returns public.cases language plpgsql security definer set search_path='' as $$
declare created public.cases; follow_up jsonb; question_row public.question_definitions; task_id uuid; next_sequence integer; completed boolean;
begin
  if target_tax_year is null or target_tax_year not between 1900 and 2200 then raise exception 'valid Case tax year is required' using errcode='23514'; end if;
  if jsonb_typeof(target_follow_up_tasks)<>'array' then raise exception 'follow-up Tasks must be an array' using errcode='22023'; end if;
  if exists(select submitted->>'id' from jsonb_array_elements(target_follow_up_tasks) submitted group by submitted->>'id' having count(*)>1)
    then raise exception 'duplicate follow-up Task' using errcode='23514'; end if;
  for follow_up in select value from jsonb_array_elements(target_follow_up_tasks) loop
    if nullif(follow_up->>'id','')::uuid is null or length(trim(coalesce(follow_up->>'title','')))=0
      or nullif(follow_up->>'assignedUserId','')::uuid is null
      or coalesce(follow_up->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(follow_up->'missingOptionIds')<>'array' or jsonb_array_length(follow_up->'missingOptionIds')=0
      or jsonb_typeof(follow_up->'missingOptionLabels')<>'array'
      then raise exception 'invalid follow-up Task' using errcode='23514'; end if;
    select * into question_row from public.question_definitions q
    where q.id=nullif(follow_up->>'questionId','')::uuid and q.organization_id=target_organization_id
      and q.response_type='MULTI_SELECT' and q.require_all_options;
    if not found then raise exception 'invalid follow-up intake requirement' using errcode='23514'; end if;
    if exists(select 1 from jsonb_array_elements_text(follow_up->'missingOptionIds') missing(id)
      left join public.question_options option_row on option_row.id=missing.id::uuid and option_row.question_id=question_row.id
        and option_row.organization_id=target_organization_id where option_row.id is null)
      then raise exception 'invalid missing requirement option' using errcode='23514'; end if;
    if not exists(select 1 from public.organization_members member join public.profiles profile on profile.id=member.user_id and profile.is_active
      where member.organization_id=target_organization_id and member.user_id=nullif(follow_up->>'assignedUserId','')::uuid
        and member.is_active and member.status='ACTIVE' and not public.is_super_admin(member.user_id))
      then raise exception 'invalid follow-up Task assignee' using errcode='23514'; end if;
    completed:=coalesce((follow_up->>'completed')::boolean,false);
    if completed and not(target_answers ? question_row.id::text and public.guided_intake_response_valid(
      target_organization_id,question_row.id,question_row.response_type,target_answers->question_row.id::text))
      then raise exception 'missing documents prevent follow-up Task completion' using errcode='23514'; end if;
  end loop;
  created:=private.create_guided_case_intake(target_organization_id,target_submission_key,target_customer_id,target_case_title_id,
    target_description,target_case_type_id,target_priority,target_manager_user_id,target_staff_user_ids,target_answers);
  update public.cases set tax_year=target_tax_year
  where id=created.id and (tax_year is null or tax_year=target_tax_year)
  returning * into created;
  if not found then raise exception 'Case tax year is immutable through intake replay' using errcode='23514'; end if;
  for follow_up in select value from jsonb_array_elements(target_follow_up_tasks) loop
    select coalesce(max(sequence),0)+1 into next_sequence from public.case_tasks where case_id=created.id;
    completed:=coalesce((follow_up->>'completed')::boolean,false);
    insert into public.case_tasks(
      organization_id,case_id,title,description,assigned_user_id,status,required,due_at,sequence,created_by_user_id,
      priority,blocking,intake_follow_up_id,intake_question_definition_id,intake_requirement_context
    ) values(
      target_organization_id,created.id,trim(follow_up->>'title'),coalesce(follow_up->>'description',''),
      (follow_up->>'assignedUserId')::uuid,case when completed then 'COMPLETED'::public.case_task_status else 'NOT_STARTED'::public.case_task_status end,
      true,public.organization_end_of_date(target_organization_id,(follow_up->>'dueDate')::date),next_sequence,auth.uid(),
      'NORMAL',true,(follow_up->>'id')::uuid,(follow_up->>'questionId')::uuid,
      jsonb_build_object('missing_option_ids',follow_up->'missingOptionIds','missing_option_labels',follow_up->'missingOptionLabels')
    ) on conflict(organization_id,case_id,intake_follow_up_id) where intake_follow_up_id is not null do nothing
    returning id into task_id;
    if task_id is not null then insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
      values(target_organization_id,created.id,auth.uid(),'TASK_CREATED',jsonb_build_object('task_id',task_id,'title',follow_up->>'title','source','GUIDED_INTAKE'));
    end if;
    task_id:=null;
  end loop;
  return created;
end $$;

revoke all on function public.create_case_workflow(uuid,uuid,text,text,text,public.priority_level,integer,timestamptz,uuid,uuid[],jsonb),public.create_guided_case_intake(uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,uuid,uuid[],jsonb,jsonb)
  from public,anon;
grant execute on function public.create_case_workflow(uuid,uuid,text,text,text,public.priority_level,integer,timestamptz,uuid,uuid[],jsonb),public.create_guided_case_intake(uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,uuid,uuid[],jsonb,jsonb)
  to authenticated;

create or replace view public.organization_cases with (security_barrier=true) as
select c.id,c.organization_id,c.case_number,c.customer_id,c.title,c.description,c.case_type,c.priority,c.status,
  c.due_at,c.opened_at,c.completed_at,c.closed_at,c.manager_user_id,
  public.organization_actor_id(c.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(c.created_by_user_id) as created_by_display_name,
  c.created_at,c.updated_at,c.case_title_id,c.case_type_id,c.tax_year
from public.cases c
where public.can_access_case(c.id,c.organization_id,auth.uid());

create or replace view public.organization_case_tasks with (security_barrier=true) as
select t.id,t.organization_id,t.case_id,t.title,t.description,t.assigned_user_id,t.status,t.required,t.due_at,t.completed_at,
  public.organization_actor_id(t.completed_by_user_id) as completed_by_user_id,
  public.organization_actor_label(t.completed_by_user_id) as completed_by_display_name,
  t.sequence,public.organization_actor_id(t.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(t.created_by_user_id) as created_by_display_name,t.created_at,t.updated_at,t.priority,t.blocking,
  (t.source_rule_action_id is not null) as generated_by_rule,
  (t.intake_follow_up_id is not null) as generated_by_intake,
  t.intake_question_definition_id,t.intake_requirement_context
from public.case_tasks t
where public.can_access_case(t.case_id,t.organization_id,auth.uid());

create or replace view public.organization_rule_actions with (security_barrier=true) as
select a.id,a.organization_id,a.rule_definition_id,a.action_type,a.target_question_id,a.task_title,a.task_description,a.task_priority,
  a.task_required,a.task_blocking,a.display_order,public.organization_actor_id(a.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(a.created_by_user_id) as created_by_display_name,
  public.organization_actor_id(a.updated_by_user_id) as updated_by_user_id,
  public.organization_actor_label(a.updated_by_user_id) as updated_by_display_name,a.created_at,a.updated_at,a.task_due_in_days
from public.rule_actions a
where a.retired_at is null and public.has_effective_organization_permission(a.organization_id,'VIEW_RULES');
