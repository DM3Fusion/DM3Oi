begin;

-- ============================================================
-- TASK STATUS MODEL
--
-- Staff-facing workflow:
-- NOT_STARTED
-- WAITING_ON_CUSTOMER
-- IN_PROGRESS
-- REQUIRED_UNAVAILABLE
-- COMPLETED
--
-- BLOCKED and NOT_APPLICABLE remain system-controlled states.
-- REQUIRED_UNAVAILABLE is a resolved exception and does not
-- prevent Case completion.
-- ============================================================

-- Rule-generated Task provenance must be able to remember all
-- actionable states when a Rule temporarily makes a Task N/A.
alter table public.case_tasks
  drop constraint case_tasks_rule_provenance_shape;

alter table public.case_tasks
  add constraint case_tasks_rule_provenance_shape
  check (
    (
      source_rule_id is null
      and source_rule_action_id is null
      and prior_actionable_status is null
    )
    or
    (
      source_rule_id is not null
      and source_rule_action_id is not null
      and (
        prior_actionable_status is null
        or (
          status='NOT_APPLICABLE'
          and prior_actionable_status in (
            'NOT_STARTED',
            'IN_PROGRESS',
            'WAITING_ON_CUSTOMER',
            'BLOCKED'
          )
        )
      )
    )
  );

-- Guided Intake draft JSON follows the authoritative Task state.
create or replace function public.sync_guided_intake_follow_up_task_draft()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.intake_follow_up_id is null then
    return new;
  end if;

  update public.guided_case_intake_drafts draft
  set follow_up_tasks=coalesce(
    (
      select jsonb_agg(
        case
          when entry.value->>'id'=new.intake_follow_up_id::text then
            entry.value
            || jsonb_build_object(
              'assignedUserId',coalesce(new.assigned_user_id::text,''),
              'dueDate',
                case
                  when new.due_at is null then ''
                  else to_char(
                    new.due_at at time zone
                    coalesce(
                      (
                        select settings.timezone
                        from public.organization_settings settings
                        where settings.organization_id=new.organization_id
                      ),
                      'UTC'
                    ),
                    'YYYY-MM-DD'
                  )
                end,
              'status',new.status::text,
              'completed',new.status in ('COMPLETED','REQUIRED_UNAVAILABLE')
            )
          else entry.value
        end
        order by entry.ordinality
      )
      from jsonb_array_elements(
        coalesce(draft.follow_up_tasks,'[]'::jsonb)
      ) with ordinality as entry(value,ordinality)
    ),
    '[]'::jsonb
  )
  where draft.organization_id=new.organization_id
    and draft.case_id=new.case_id
    and draft.finalized_at is null
    and exists(
      select 1
      from jsonb_array_elements(
        coalesce(draft.follow_up_tasks,'[]'::jsonb)
      ) entry
      where entry->>'id'=new.intake_follow_up_id::text
    );

  return new;
end
$$;

-- Guided Intake follow-up Task saves support the new workflow.
create or replace function public.upsert_guided_intake_follow_up_task(
  target_organization_id uuid,
  target_submission_key uuid,
  target_follow_up jsonb
)
returns public.case_tasks
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  draft_row public.guided_case_intake_drafts;
  item public.cases;
  question_row public.question_definitions;
  existing_task public.case_tasks;
  changed public.case_tasks;
  follow_up_id uuid;
  follow_up_question_id uuid;
  assigned_user_id uuid;
  due_date date;
  requested_status public.case_task_status;
  next_sequence integer;
  updated_follow_ups jsonb;
  canonical_follow_up jsonb;
  canonical_missing_ids jsonb;
  canonical_missing_labels jsonb;
begin
  if actor is null
    or target_submission_key is null
    or not public.has_effective_organization_permission(
      target_organization_id,'WORK_CASES'
    )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select * into draft_row
  from public.guided_case_intake_drafts draft
  where draft.organization_id=target_organization_id
    and draft.submission_key=target_submission_key
    and draft.finalized_at is null
  for update;

  if not found or draft_row.case_id is null then
    raise exception 'Guided Intake Case has not been materialized'
      using errcode='23514';
  end if;

  select * into item
  from public.cases existing
  where existing.organization_id=target_organization_id
    and existing.id=draft_row.case_id
  for update;

  if not found
    or not public.can_access_case(
      item.id,
      target_organization_id,
      actor
    )
    or item.intake_submission_key is distinct from target_submission_key
    or item.status not in ('IN_PROGRESS','WAITING')
  then
    raise exception 'Guided Intake Case is not available for follow-up Tasks'
      using errcode='23514';
  end if;

  if jsonb_typeof(target_follow_up)<>'object' then
    raise exception 'invalid follow-up Task' using errcode='22023';
  end if;

  begin
    follow_up_id:=nullif(target_follow_up->>'id','')::uuid;
    follow_up_question_id:=nullif(target_follow_up->>'questionId','')::uuid;
    assigned_user_id:=nullif(target_follow_up->>'assignedUserId','')::uuid;
    due_date:=nullif(target_follow_up->>'dueDate','')::date;
    requested_status:=coalesce(
      nullif(target_follow_up->>'status','')::public.case_task_status,
      'NOT_STARTED'::public.case_task_status
    );
  exception
    when invalid_text_representation or datetime_field_overflow then
      raise exception 'invalid follow-up Task' using errcode='23514';
  end;

  if requested_status not in (
    'NOT_STARTED',
    'IN_PROGRESS',
    'WAITING_ON_CUSTOMER',
    'REQUIRED_UNAVAILABLE',
    'COMPLETED'
  ) then
    raise exception 'Task status is controlled by the system.'
      using errcode='23514';
  end if;

  if follow_up_id is null
    or follow_up_question_id is null
    or assigned_user_id is null
    or due_date is null
    or jsonb_typeof(target_follow_up->'missingOptionIds')<>'array'
    or jsonb_array_length(target_follow_up->'missingOptionIds')=0
  then
    raise exception 'invalid follow-up Task' using errcode='23514';
  end if;

  select * into question_row
  from public.question_definitions question
  where question.organization_id=target_organization_id
    and question.id=follow_up_question_id
    and question.response_type='MULTI_SELECT'
    and question.require_all_options;

  if not found then
    raise exception 'invalid follow-up intake requirement'
      using errcode='23514';
  end if;

  if exists(
    select 1
    from jsonb_array_elements_text(
      target_follow_up->'missingOptionIds'
    ) missing(id)
    left join public.question_options option_row
      on option_row.id=missing.id::uuid
      and option_row.question_id=follow_up_question_id
      and option_row.organization_id=target_organization_id
    where option_row.id is null
  ) then
    raise exception 'invalid missing requirement option'
      using errcode='23514';
  end if;

  select
    jsonb_agg(to_jsonb(option_row.id::text) order by submitted.ordinality),
    jsonb_agg(to_jsonb(option_row.option_label) order by submitted.ordinality)
  into canonical_missing_ids,canonical_missing_labels
  from jsonb_array_elements_text(
    target_follow_up->'missingOptionIds'
  ) with ordinality submitted(id,ordinality)
  join public.question_options option_row
    on option_row.id=submitted.id::uuid
    and option_row.question_id=follow_up_question_id
    and option_row.organization_id=target_organization_id;

  canonical_follow_up:=jsonb_build_object(
    'id',follow_up_id::text,
    'questionId',follow_up_question_id::text,
    'title','Obtain missing required documents',
    'description',
      'Outstanding requirements: '
      || (
        select string_agg(value,', ' order by ordinality)
        from jsonb_array_elements_text(canonical_missing_labels)
          with ordinality labels(value,ordinality)
      ),
    'missingOptionIds',canonical_missing_ids,
    'missingOptionLabels',canonical_missing_labels,
    'assignedUserId',assigned_user_id::text,
    'dueDate',to_char(due_date,'YYYY-MM-DD'),
    'status',requested_status::text,
    'completed',requested_status in ('COMPLETED','REQUIRED_UNAVAILABLE')
  );

  if not exists(
    select 1
    from public.organization_members member
    join public.profiles profile
      on profile.id=member.user_id
      and profile.is_active
    where member.organization_id=target_organization_id
      and member.user_id=assigned_user_id
      and member.is_active
      and member.status='ACTIVE'
      and not public.is_super_admin(member.user_id)
  ) then
    raise exception 'invalid follow-up Task assignee'
      using errcode='23514';
  end if;

  select * into existing_task
  from public.case_tasks task
  where task.organization_id=target_organization_id
    and task.case_id=item.id
    and task.intake_follow_up_id=follow_up_id
  for update;

  if found then
    if existing_task.assigned_user_id is distinct from assigned_user_id
      and not (
        not public.is_super_admin(actor)
        and public.has_effective_organization_permission(
          target_organization_id,
          'ASSIGN_TASKS'
        )
        and public.has_organization_role(
          target_organization_id,
          array[
            'BUSINESS_OWNER',
            'STAFF_MANAGER'
          ]::public.application_role[],
          actor
        )
      )
    then
      raise exception 'Task reassignment is not authorized'
        using errcode='42501';
    end if;

    update public.case_tasks
    set title=canonical_follow_up->>'title',
        description=canonical_follow_up->>'description',
        assigned_user_id=assigned_user_id,
        status=requested_status,
        required=true,
        due_at=public.organization_end_of_date(
          target_organization_id,due_date
        ),
        completed_at=case
          when requested_status='COMPLETED'
            then coalesce(existing_task.completed_at,now())
          else null
        end,
        completed_by_user_id=case
          when requested_status='COMPLETED' then actor
          else null
        end,
        priority='NORMAL',
        blocking=true,
        intake_question_definition_id=follow_up_question_id,
        intake_requirement_context=jsonb_build_object(
          'missing_option_ids',canonical_follow_up->'missingOptionIds',
          'missing_option_labels',canonical_follow_up->'missingOptionLabels'
        )
    where id=existing_task.id
    returning * into changed;

    if existing_task.status is distinct from requested_status then
      insert into public.case_activity(
        organization_id,
        case_id,
        actor_user_id,
        event_type,
        event_data
      )
      values(
        target_organization_id,
        item.id,
        actor,
        case
          when requested_status='COMPLETED' then 'TASK_COMPLETED'
          when requested_status='IN_PROGRESS' then 'TASK_STARTED'
          else 'TASK_UPDATED'
        end,
        jsonb_build_object(
          'task_id',changed.id,
          'before_status',existing_task.status,
          'after_status',changed.status,
          'source','GUIDED_INTAKE'
        )
      );
    end if;
  else
    select coalesce(max(sequence),0)+1 into next_sequence
    from public.case_tasks
    where case_id=item.id;

    insert into public.case_tasks(
      organization_id,
      case_id,
      title,
      description,
      assigned_user_id,
      status,
      required,
      due_at,
      sequence,
      created_by_user_id,
      priority,
      blocking,
      intake_follow_up_id,
      intake_question_definition_id,
      intake_requirement_context,
      completed_at,
      completed_by_user_id
    ) values(
      target_organization_id,
      item.id,
      canonical_follow_up->>'title',
      canonical_follow_up->>'description',
      assigned_user_id,
      requested_status,
      true,
      public.organization_end_of_date(
        target_organization_id,due_date
      ),
      next_sequence,
      actor,
      'NORMAL',
      true,
      follow_up_id,
      follow_up_question_id,
      jsonb_build_object(
        'missing_option_ids',canonical_follow_up->'missingOptionIds',
        'missing_option_labels',canonical_follow_up->'missingOptionLabels'
      ),
      case when requested_status='COMPLETED' then now() else null end,
      case when requested_status='COMPLETED' then actor else null end
    )
    returning * into changed;

    insert into public.case_activity(
      organization_id,
      case_id,
      actor_user_id,
      event_type,
      event_data
    ) values(
      target_organization_id,
      item.id,
      actor,
      'TASK_CREATED',
      jsonb_build_object(
        'task_id',changed.id,
        'title',changed.title,
        'source','GUIDED_INTAKE'
      )
    );
  end if;

  if exists(
    select 1
    from jsonb_array_elements(
      coalesce(draft_row.follow_up_tasks,'[]'::jsonb)
    ) entry
    where entry->>'id'=follow_up_id::text
       or entry->>'questionId'=follow_up_question_id::text
  ) then
    select coalesce(
      jsonb_agg(
        case
          when entry.value->>'id'=follow_up_id::text
            or entry.value->>'questionId'=follow_up_question_id::text
          then canonical_follow_up
          else entry.value
        end
        order by entry.ordinality
      ),
      '[]'::jsonb
    )
    into updated_follow_ups
    from jsonb_array_elements(
      coalesce(draft_row.follow_up_tasks,'[]'::jsonb)
    ) with ordinality as entry(value,ordinality);
  else
    updated_follow_ups:=
      coalesce(draft_row.follow_up_tasks,'[]'::jsonb)
      || jsonb_build_array(canonical_follow_up);
  end if;

  update public.guided_case_intake_drafts
  set follow_up_tasks=updated_follow_ups
  where id=draft_row.id;

  return changed;
end
$$;

-- A successfully delivered missing-document notice means the
-- organization is waiting on the Customer, not that staff work
-- has already begun.
create or replace function public.mark_intake_requirement_notice_sent(
  target_task_id uuid
)
returns public.case_tasks
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  existing public.case_tasks;
  changed public.case_tasks;
begin
  if actor is null then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select *
  into existing
  from public.case_tasks
  where id=target_task_id
  for update;

  if not found then
    raise exception 'task not found' using errcode='P0002';
  end if;

  if existing.intake_follow_up_id is null
     or existing.intake_question_definition_id is null
     or jsonb_typeof(
          coalesce(
            existing.intake_requirement_context->'missing_option_labels',
            '[]'::jsonb
          )
        ) <> 'array'
     or jsonb_array_length(
          coalesce(
            existing.intake_requirement_context->'missing_option_labels',
            '[]'::jsonb
          )
        ) = 0
  then
    raise exception 'task is not a Guided Intake document requirement'
      using errcode='23514';
  end if;

  if not public.has_effective_organization_permission(
       existing.organization_id,
       'WORK_TASKS'
     )
     or not public.can_access_case(
       existing.case_id,
       existing.organization_id,
       actor
     )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if not public.can_manage_case(existing.organization_id,actor)
     and existing.assigned_user_id is distinct from actor
     and not public.has_effective_organization_permission(
       existing.organization_id,
       'MANAGE_TASKS'
     )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  -- Idempotent when the notice was already recorded successfully.
  if existing.status='WAITING_ON_CUSTOMER' then
    return existing;
  end if;

  if existing.status<>'NOT_STARTED' then
    raise exception 'task is not awaiting a customer notice'
      using errcode='23514';
  end if;

  update public.case_tasks
  set status='WAITING_ON_CUSTOMER'
  where id=existing.id
  returning * into changed;

  insert into public.case_activity(
    organization_id,
    case_id,
    actor_user_id,
    event_type,
    event_data
  )
  values(
    changed.organization_id,
    changed.case_id,
    actor,
    'TASK_UPDATED',
    jsonb_build_object(
      'task_id',changed.id,
      'before_status',existing.status,
      'after_status',changed.status,
      'source','GUIDED_INTAKE',
      'customer_notice_sent',true
    )
  );

  return changed;
end
$$;

comment on function public.mark_intake_requirement_notice_sent(uuid) is
  'Marks an authorized Guided Intake document-requirement Task WAITING_ON_CUSTOMER only after its customer notice has been successfully sent.';

-- Customer Portal Action Required is shown only while the
-- requirement is actively waiting on the Customer.
create or replace function public.get_customer_portal_case_requirements(
  target_portal_access_id uuid
)
returns table(
  task_id uuid,
  case_number text,
  missing_documents jsonb,
  reported_sent_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  with authorized_portal_access as (
    select access.organization_id, access.customer_id
    from public.customer_portal_users access
    join public.profiles profile
      on profile.id=access.user_id
      and profile.is_active
    join public.organizations organization
      on organization.id=access.organization_id
      and organization.status='ACTIVE'
    join public.customers customer
      on customer.id=access.customer_id
      and customer.organization_id=access.organization_id
      and customer.status='ACTIVE'
    left join public.organization_settings settings
      on settings.organization_id=access.organization_id
    where access.id=target_portal_access_id
      and access.user_id=auth.uid()
      and access.is_active
      and coalesce(settings.portal_enabled,true)
  )
  select
    task.id,
    item.case_number,
    task.intake_requirement_context->'missing_option_labels',
    confirmation.reported_sent_at
  from authorized_portal_access access
  join public.cases item
    on item.organization_id=access.organization_id
    and item.customer_id=access.customer_id
  join public.case_tasks task
    on task.organization_id=item.organization_id
    and task.case_id=item.id
  left join public.case_document_confirmations confirmation
    on confirmation.task_id=task.id
  where item.status not in ('COMPLETED','CLOSED','CANCELLED')
    and task.status='WAITING_ON_CUSTOMER'
    and task.intake_follow_up_id is not null
    and task.intake_question_definition_id is not null
    and jsonb_typeof(
      task.intake_requirement_context->'missing_option_labels'
    )='array'
    and jsonb_array_length(
      task.intake_requirement_context->'missing_option_labels'
    )>0
  order by item.opened_at desc,item.case_number desc,task.sequence
$$;

alter function public.get_customer_portal_case_requirements(uuid)
  owner to postgres;

revoke all
  on function public.get_customer_portal_case_requirements(uuid)
  from public,anon,authenticated;

grant execute
  on function public.get_customer_portal_case_requirements(uuid)
  to authenticated;

comment on function public.get_customer_portal_case_requirements(uuid) is
  'Customer-safe document requirements currently waiting on the authenticated Customer Portal relationship, including reported-submission state. No document content is exposed or stored.';

-- Preserve current Rule-generated Task status when Rules turn
-- off and later become effective again.
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
      and status in ('NOT_STARTED','IN_PROGRESS','WAITING_ON_CUSTOMER','BLOCKED') returning * loop
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
    values(target_organization_id,target_case_id,target_actor_user_id,'RULE_TASK_NOT_APPLICABLE',jsonb_build_object('task_id',changed.id,'title',changed.title,'before_status',changed.prior_actionable_status));
  end loop;
end $$;

-- Staff cannot manually transition into or out of the
-- system-controlled BLOCKED / NOT_APPLICABLE states.
create or replace function public.update_case_task(
  target_task_id uuid,
  target_task_purpose_id uuid,
  target_title text,
  target_description text,
  target_assigned_user_id uuid,
  target_status public.case_task_status,
  target_required boolean,
  target_due_date date
)
returns public.case_tasks
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  existing public.case_tasks;
  changed public.case_tasks;
  event_name text:='TASK_UPDATED';
  can_manage boolean;
begin
  select * into existing
  from public.case_tasks
  where id=target_task_id
  for update;

  if not found then
    raise exception 'task not found' using errcode='P0002';
  end if;
  if (
    (
      existing.status in ('BLOCKED','NOT_APPLICABLE')
      or target_status in ('BLOCKED','NOT_APPLICABLE')
    )
    and target_status is distinct from existing.status
  ) then
    raise exception 'Task status is controlled by the system.'
      using errcode='23514';
  end if;

  if not public.has_effective_organization_permission(existing.organization_id,'WORK_TASKS')
     or not public.can_access_case(existing.case_id,existing.organization_id,actor) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  can_manage:=
    public.has_effective_organization_permission(existing.organization_id,'MANAGE_TASKS');

  if not public.can_manage_case(existing.organization_id,actor)
     and existing.assigned_user_id<>actor
     and not can_manage then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if (
    target_title<>existing.title
    or target_description<>existing.description
    or target_required<>existing.required
    or target_due_date is not null
    or target_task_purpose_id is distinct from existing.task_purpose_id
  ) and not can_manage then
    raise exception 'task management permission required' using errcode='42501';
  end if;

  if can_manage and target_due_date is null then
    raise exception 'Task Due Date is required when updating a Task' using errcode='23514';
  end if;

  if can_manage
     and existing.source_rule_action_id is null
     and existing.intake_follow_up_id is null
     and target_task_purpose_id is null then
    raise exception 'Task Purpose is required' using errcode='23514';
  end if;

  if target_task_purpose_id is not null
     and not exists(
       select 1
       from public.organization_task_purposes purpose
       where purpose.id=target_task_purpose_id
         and purpose.organization_id=existing.organization_id
         and purpose.is_active
     ) then
    raise exception 'invalid Task Purpose' using errcode='23514';
  end if;

  if target_assigned_user_id is distinct from existing.assigned_user_id
     and not public.has_effective_organization_permission(
       existing.organization_id,'ASSIGN_TASKS'
     ) then
    raise exception 'task assignment permission required' using errcode='42501';
  end if;

  if target_assigned_user_id is not null
     and not public.is_internal_member(
       existing.organization_id,target_assigned_user_id
     ) then
    raise exception 'invalid task assignee' using errcode='23514';
  end if;

  update public.case_tasks
  set
    task_purpose_id=case
      when can_manage then target_task_purpose_id
      else existing.task_purpose_id
    end,
    title=case when can_manage then trim(target_title) else existing.title end,
    description=case
      when can_manage then coalesce(target_description,'')
      else existing.description
    end,
    assigned_user_id=target_assigned_user_id,
    status=target_status,
    required=case when can_manage then target_required else existing.required end,
    due_at=case
      when target_due_date is null then existing.due_at
      else public.organization_end_of_date(
        existing.organization_id,target_due_date
      )
    end,
    prior_actionable_status=case
      when target_status='NOT_APPLICABLE' then prior_actionable_status
      else null
    end
  where id=existing.id
  returning * into changed;

  if target_status='COMPLETED' and existing.status<>'COMPLETED' then
    event_name:='TASK_COMPLETED';
  elsif target_status='IN_PROGRESS' and existing.status<>'IN_PROGRESS' then
    event_name:='TASK_STARTED';
  elsif target_assigned_user_id is distinct from existing.assigned_user_id then
    event_name:='TASK_ASSIGNED';
  end if;

  insert into public.case_activity(
    organization_id,case_id,actor_user_id,event_type,event_data
  )
  values(
    changed.organization_id,
    changed.case_id,
    actor,
    event_name,
    jsonb_build_object(
      'task_id',changed.id,
      'before_status',existing.status,
      'after_status',changed.status,
      'before_assigned_user_id',existing.assigned_user_id,
      'after_assigned_user_id',changed.assigned_user_id,
      'before_task_purpose_id',existing.task_purpose_id,
      'after_task_purpose_id',changed.task_purpose_id
    )
  );

  return changed;
end
$$;

-- REQUIRED_UNAVAILABLE resolves required work for completion.
create or replace function public.guard_case_completion() returns trigger language plpgsql security definer set search_path='' as $$ begin if new.status='COMPLETED' and old.status<>'COMPLETED' and exists(select 1 from public.case_tasks t where t.case_id=new.id and t.required and t.status not in ('COMPLETED','NOT_APPLICABLE','REQUIRED_UNAVAILABLE')) then raise exception 'All required applicable tasks must be completed before completing the case.' using errcode='23514';end if;if new.status='COMPLETED' and old.status<>'COMPLETED' and exists(select 1 from public.case_questions q where q.case_id=new.id and q.required and not exists(select 1 from public.case_question_responses r where r.case_question_id=q.id)) then raise exception 'All required applicable questions must be answered before completing the case.' using errcode='23514';end if;if new.status='COMPLETED' and old.status<>'COMPLETED' then new.completed_at=coalesce(new.completed_at,now());end if;if old.status='COMPLETED' and new.status in ('NEW','UNASSIGNED','ASSIGNED','IN_PROGRESS','WAITING','REVIEW') then new.completed_at=null;end if;if new.status='CLOSED' and old.status<>'CLOSED' then new.closed_at=coalesce(new.closed_at,now());end if;if old.status='CLOSED' and new.status<>'CLOSED' then new.closed_at=null;end if;return new;end $$;

-- Keep the explicit Complete Case boundary aligned with the
-- same resolved-status semantics.
create or replace function public.complete_case(
  target_case_id uuid,
  target_tax_outcome text
)
returns public.cases
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  item public.cases;
  changed public.cases;
begin
  if actor is null then
    raise exception 'not authorized'
      using errcode='42501';
  end if;

  if target_tax_outcome not in (
    'REFUND',
    'BALANCE_DUE',
    'ZERO_BALANCE'
  ) then
    raise exception 'invalid tax preparation outcome'
      using errcode='22023';
  end if;

  select *
  into item
  from public.cases
  where id=target_case_id
  for update;

  if not found then
    raise exception 'case not found'
      using errcode='P0002';
  end if;

  if not public.has_effective_organization_permission(
    item.organization_id,
    'WORK_CASES'
  )
  or not public.can_access_case(
    item.id,
    item.organization_id,
    actor
  )
  then
    raise exception 'not authorized'
      using errcode='42501';
  end if;

  if item.status not in ('IN_PROGRESS','WAITING') then
    raise exception 'Case is not eligible for completion'
      using errcode='23514';
  end if;

  if not exists(
    select 1
    from public.guided_case_intake_drafts draft
    where draft.organization_id=item.organization_id
      and draft.case_id=item.id
      and draft.finalized_at is not null
  ) then
    raise exception
      'Guided Intake must be finalized before completing the Case'
      using errcode='23514';
  end if;

  if exists(
    select 1
    from public.case_tasks task
    where task.case_id=item.id
      and task.status not in (
        'COMPLETED',
        'NOT_APPLICABLE',
        'REQUIRED_UNAVAILABLE'
      )
      and task.blocking
  ) then
    raise exception
      'All blocking Tasks must be completed before completing the Case.'
      using errcode='23514';
  end if;

  /*
   * Existing completion triggers remain authoritative for required
   * Tasks and Questions. The explicit blocking-Task check above keeps
   * database completion eligibility aligned with Case Readiness.
   * This update also causes completed_at to be stamped by the existing
   * Case completion lifecycle trigger.
   */
  update public.cases
  set
    tax_outcome=target_tax_outcome,
    status='COMPLETED'
  where id=item.id
  returning * into changed;

  insert into public.case_activity(
    organization_id,
    case_id,
    actor_user_id,
    event_type,
    event_data
  )
  values(
    changed.organization_id,
    changed.id,
    actor,
    'STATUS_CHANGED',
    jsonb_build_object(
      'before',item.status,
      'after','COMPLETED',
      'tax_outcome',target_tax_outcome
    )
  );

  insert into public.case_activity(
    organization_id,
    case_id,
    actor_user_id,
    event_type,
    event_data
  )
  values(
    changed.organization_id,
    changed.id,
    actor,
    'CASE_COMPLETED',
    jsonb_build_object(
      'before',item.status,
      'after','COMPLETED',
      'tax_outcome',target_tax_outcome,
      'source','TAX_PREP_OUTCOME'
    )
  );

  return changed;
end
$$;

-- Existing Guided Intake document Tasks that were moved to
-- IN_PROGRESS specifically because a customer notice was sent
-- now carry the explicit WAITING_ON_CUSTOMER state.
update public.case_tasks task
set status='WAITING_ON_CUSTOMER'
where task.status='IN_PROGRESS'
  and task.intake_follow_up_id is not null
  and task.intake_question_definition_id is not null
  and exists (
    select 1
    from public.cases item
    where item.id=task.case_id
      and item.organization_id=task.organization_id
      and item.status<>'COMPLETED'
  )
  and exists (
    select 1
    from public.case_activity activity
    where activity.organization_id=task.organization_id
      and activity.case_id=task.case_id
      and activity.event_data->>'task_id'=task.id::text
      and activity.event_data->>'customer_notice_sent'='true'
  );

commit;
