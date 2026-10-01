begin;

-- The previous Guided Intake shape required every non-completed follow-up
-- Task to retain at least one missing item. Document Requirement Tasks now
-- have a deliberate zero-missing / IN_PROGRESS state before Staff completes
-- the Task, so preserve the old rule for generic follow-ups while allowing
-- the explicit DOCUMENT_REQUIREMENT checklist shape.
alter table public.case_tasks
  drop constraint if exists case_tasks_intake_follow_up_shape;

alter table public.case_tasks
  add constraint case_tasks_intake_follow_up_shape check (
    (
      intake_follow_up_id is null
      and intake_question_definition_id is null
      and intake_requirement_context is null
    )
    or
    (
      intake_follow_up_id is not null
      and intake_question_definition_id is not null
      and jsonb_typeof(intake_requirement_context)='object'
      and jsonb_typeof(
        intake_requirement_context->'missing_option_ids'
      )='array'
      and jsonb_typeof(
        intake_requirement_context->'missing_option_labels'
      )='array'
      and (
        (
          intake_requirement_context->>'kind'='DOCUMENT_REQUIREMENT'
          and jsonb_typeof(
            intake_requirement_context->'required_option_ids'
          )='array'
          and jsonb_typeof(
            intake_requirement_context->'required_option_labels'
          )='array'
          and jsonb_array_length(
            intake_requirement_context->'required_option_ids'
          )>0
        )
        or status='COMPLETED'
        or jsonb_array_length(
          intake_requirement_context->'missing_option_ids'
        )>0
      )
    )
  );

comment on constraint case_tasks_intake_follow_up_shape
on public.case_tasks is
  'Guided Intake follow-up Tasks retain workflow provenance. Generic open follow-ups require outstanding items; completed history may have none. Explicit Document Requirement Tasks retain their full required-document checklist and may have zero outstanding items while awaiting Staff completion.';

create or replace function public.normalize_document_requirement_task()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  question_row public.question_definitions;
  required_ids jsonb:='[]'::jsonb;
  received_ids jsonb:='[]'::jsonb;
  canonical_required_ids jsonb:='[]'::jsonb;
  canonical_required_labels jsonb:='[]'::jsonb;
  canonical_received_ids jsonb:='[]'::jsonb;
  canonical_received_labels jsonb:='[]'::jsonb;
  canonical_missing_ids jsonb:='[]'::jsonb;
  canonical_missing_labels jsonb:='[]'::jsonb;
  draft_answer jsonb;
  case_answer jsonb;
begin
  if new.intake_follow_up_id is null
     or new.intake_question_definition_id is null
     or new.intake_requirement_context is null
     or jsonb_typeof(new.intake_requirement_context)<>'object'
  then
    return new;
  end if;

  select question.*
  into question_row
  from public.question_definitions question
  where question.organization_id=new.organization_id
    and question.id=new.intake_question_definition_id;

  if not found or question_row.response_type<>'MULTI_SELECT' then
    return new;
  end if;

  if coalesce(new.intake_requirement_context->>'kind','')<>'DOCUMENT_REQUIREMENT'
     and not (
       jsonb_typeof(new.intake_requirement_context->'missing_option_ids')='array'
       and jsonb_array_length(
         new.intake_requirement_context->'missing_option_ids'
       )>0
     )
     and not (
       jsonb_typeof(new.intake_requirement_context->'required_option_ids')='array'
       and jsonb_array_length(
         new.intake_requirement_context->'required_option_ids'
       )>0
     )
  then
    return new;
  end if;

  select draft.required_option_ids->new.intake_question_definition_id::text
  into required_ids
  from public.guided_case_intake_drafts draft
  where draft.organization_id=new.organization_id
    and draft.case_id=new.case_id
  order by draft.updated_at desc
  limit 1;

  if coalesce(jsonb_typeof(required_ids),'null')<>'array'
     or coalesce(jsonb_array_length(required_ids),0)=0
  then
    required_ids:=new.intake_requirement_context->'required_option_ids';
  end if;

  select draft.answers->new.intake_question_definition_id::text
  into draft_answer
  from public.guided_case_intake_drafts draft
  where draft.organization_id=new.organization_id
    and draft.case_id=new.case_id
    and draft.finalized_at is null
  order by draft.updated_at desc
  limit 1;

  if jsonb_typeof(draft_answer)='array' then
    received_ids:=draft_answer;
  else
    select response.response_value
    into case_answer
    from public.case_questions question
    join public.case_question_responses response
      on response.organization_id=question.organization_id
     and response.case_id=question.case_id
     and response.case_question_id=question.id
    where question.organization_id=new.organization_id
      and question.case_id=new.case_id
      and question.question_definition_id=
        new.intake_question_definition_id
    order by response.updated_at desc nulls last
    limit 1;

    if jsonb_typeof(case_answer)='array' then
      received_ids:=case_answer;
    elsif jsonb_typeof(
      new.intake_requirement_context->'received_option_ids'
    )='array' then
      received_ids:=new.intake_requirement_context->'received_option_ids';
    else
      received_ids:='[]'::jsonb;
    end if;
  end if;

  if coalesce(jsonb_typeof(required_ids),'null')<>'array'
     or coalesce(jsonb_array_length(required_ids),0)=0
  then
    required_ids:=
      coalesce(received_ids,'[]'::jsonb)
      ||
      coalesce(
        new.intake_requirement_context->'missing_option_ids',
        '[]'::jsonb
      );
  end if;

  select
    coalesce(
      jsonb_agg(to_jsonb(option_row.id::text) order by option_row.display_order),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(to_jsonb(option_row.option_label) order by option_row.display_order),
      '[]'::jsonb
    )
  into canonical_required_ids,canonical_required_labels
  from public.question_options option_row
  where option_row.organization_id=new.organization_id
    and option_row.question_id=new.intake_question_definition_id
    and required_ids ? option_row.id::text;

  select
    coalesce(
      jsonb_agg(to_jsonb(option_row.id::text) order by option_row.display_order),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(to_jsonb(option_row.option_label) order by option_row.display_order),
      '[]'::jsonb
    )
  into canonical_received_ids,canonical_received_labels
  from public.question_options option_row
  where option_row.organization_id=new.organization_id
    and option_row.question_id=new.intake_question_definition_id
    and canonical_required_ids ? option_row.id::text
    and received_ids ? option_row.id::text;

  select
    coalesce(
      jsonb_agg(to_jsonb(option_row.id::text) order by option_row.display_order),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(to_jsonb(option_row.option_label) order by option_row.display_order),
      '[]'::jsonb
    )
  into canonical_missing_ids,canonical_missing_labels
  from public.question_options option_row
  where option_row.organization_id=new.organization_id
    and option_row.question_id=new.intake_question_definition_id
    and canonical_required_ids ? option_row.id::text
    and not (canonical_received_ids ? option_row.id::text);

  new.intake_requirement_context:=
    new.intake_requirement_context
    ||
    jsonb_build_object(
      'kind','DOCUMENT_REQUIREMENT',
      'required_option_ids',canonical_required_ids,
      'required_option_labels',canonical_required_labels,
      'received_option_ids',canonical_received_ids,
      'received_option_labels',canonical_received_labels,
      'missing_option_ids',canonical_missing_ids,
      'missing_option_labels',canonical_missing_labels
    );

  if jsonb_array_length(canonical_missing_ids)>0 then
    if tg_op='UPDATE'
       and old.status='WAITING_ON_CUSTOMER'
       and new.status is distinct from old.status
       and new.status<>'WAITING_ON_CUSTOMER'
    then
      raise exception
        'Document Requirements Task remains Waiting on Customer while required documents are outstanding'
        using errcode='23514';
    end if;

    new.status:='WAITING_ON_CUSTOMER';
  elsif new.status='WAITING_ON_CUSTOMER' then
    new.status:='IN_PROGRESS';
  end if;

  return new;
end
$$;

alter function public.normalize_document_requirement_task()
  owner to postgres;

revoke all
  on function public.normalize_document_requirement_task()
  from public,anon,authenticated;

drop trigger if exists a_normalize_document_requirement_task
  on public.case_tasks;

create trigger a_normalize_document_requirement_task
before insert or update of
  intake_requirement_context,
  intake_follow_up_id,
  intake_question_definition_id,
  status
on public.case_tasks
for each row
execute function public.normalize_document_requirement_task();

create or replace function public.set_case_document_requirement_received(
  target_task_id uuid,
  target_option_id uuid,
  target_received boolean
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
  draft_row public.guided_case_intake_drafts;
  case_question public.case_questions;
  current_answer jsonb:='[]'::jsonb;
  next_answer jsonb:='[]'::jsonb;
begin
  if actor is null then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select task.*
  into existing
  from public.case_tasks task
  where task.id=target_task_id
  for update;

  if not found then
    raise exception 'task not found' using errcode='P0002';
  end if;

  if not public.has_effective_organization_permission(
       existing.organization_id,'WORK_TASKS'
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
       existing.organization_id,'MANAGE_TASKS'
     )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if existing.intake_follow_up_id is null
     or existing.intake_question_definition_id is null
     or coalesce(existing.intake_requirement_context->>'kind','')
        <>'DOCUMENT_REQUIREMENT'
  then
    raise exception 'task is not a document Requirements Task'
      using errcode='23514';
  end if;

  if not (
    existing.intake_requirement_context->'required_option_ids'
    ? target_option_id::text
  ) then
    raise exception 'document is not required by this Task'
      using errcode='23514';
  end if;

  select draft.*
  into draft_row
  from public.guided_case_intake_drafts draft
  where draft.organization_id=existing.organization_id
    and draft.case_id=existing.case_id
    and draft.finalized_at is null
  order by draft.updated_at desc
  limit 1
  for update;

  if found then
    current_answer:=
      coalesce(
        draft_row.answers->existing.intake_question_definition_id::text,
        '[]'::jsonb
      );

    if jsonb_typeof(current_answer)<>'array' then
      current_answer:='[]'::jsonb;
    end if;

    select coalesce(
      jsonb_agg(to_jsonb(required.id) order by required.ordinality),
      '[]'::jsonb
    )
    into next_answer
    from jsonb_array_elements_text(
      existing.intake_requirement_context->'required_option_ids'
    ) with ordinality required(id,ordinality)
    where
      case
        when required.id=target_option_id::text then target_received
        else current_answer ? required.id
      end;

    update public.guided_case_intake_drafts
    set answers=jsonb_set(
      coalesce(answers,'{}'::jsonb),
      array[existing.intake_question_definition_id::text],
      next_answer,
      true
    )
    where id=draft_row.id;
  else
    select question.*
    into case_question
    from public.case_questions question
    where question.organization_id=existing.organization_id
      and question.case_id=existing.case_id
      and question.question_definition_id=
        existing.intake_question_definition_id
    order by question.created_at desc
    limit 1;

    if not found then
      raise exception 'Case document requirement response is unavailable'
        using errcode='23514';
    end if;

    select response.response_value
    into current_answer
    from public.case_question_responses response
    where response.organization_id=existing.organization_id
      and response.case_id=existing.case_id
      and response.case_question_id=case_question.id;

    current_answer:=coalesce(current_answer,'[]'::jsonb);

    if jsonb_typeof(current_answer)<>'array' then
      current_answer:='[]'::jsonb;
    end if;

    select coalesce(
      jsonb_agg(to_jsonb(required.id) order by required.ordinality),
      '[]'::jsonb
    )
    into next_answer
    from jsonb_array_elements_text(
      existing.intake_requirement_context->'required_option_ids'
    ) with ordinality required(id,ordinality)
    where
      case
        when required.id=target_option_id::text then target_received
        else current_answer ? required.id
      end;

    insert into public.case_question_responses(
      organization_id,
      case_id,
      case_question_id,
      response_value,
      responded_by_user_id
    )
    values(
      existing.organization_id,
      existing.case_id,
      case_question.id,
      next_answer,
      actor
    )
    on conflict(case_question_id) do update
    set response_value=excluded.response_value,
        responded_by_user_id=actor;
  end if;

  update public.case_tasks
  set intake_requirement_context=
    coalesce(intake_requirement_context,'{}'::jsonb)
    ||
    jsonb_build_object('received_option_ids',next_answer)
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
      'source','DOCUMENT_REQUIREMENT_CHECKLIST',
      'document_option_id',target_option_id,
      'received',target_received,
      'before_status',existing.status,
      'after_status',changed.status
    )
  );

  return changed;
end
$$;

alter function public.set_case_document_requirement_received(uuid,uuid,boolean)
  owner to postgres;

revoke all
  on function public.set_case_document_requirement_received(uuid,uuid,boolean)
  from public,anon,authenticated;

grant execute
  on function public.set_case_document_requirement_received(uuid,uuid,boolean)
  to authenticated;

create or replace function public.mark_intake_requirement_notice_sent(
  target_task_id uuid
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
begin
  if actor is null then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select task.*
  into existing
  from public.case_tasks task
  where task.id=target_task_id
  for update;

  if not found then
    raise exception 'task not found' using errcode='P0002';
  end if;

  if not public.has_effective_organization_permission(
       existing.organization_id,'WORK_TASKS'
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
       existing.organization_id,'MANAGE_TASKS'
     )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if coalesce(existing.intake_requirement_context->>'kind','')
       <>'DOCUMENT_REQUIREMENT'
     or jsonb_array_length(
       coalesce(
         existing.intake_requirement_context->'missing_option_ids',
         '[]'::jsonb
       )
     )=0
  then
    raise exception 'task has no outstanding document requirements'
      using errcode='23514';
  end if;

  update public.case_tasks
  set intake_requirement_context=
    intake_requirement_context
    ||
    jsonb_build_object(
      'notice_sent_at',to_jsonb(now()),
      'notice_sent_by_user_id',to_jsonb(actor::text)
    )
  where id=existing.id
  returning * into changed;

  return changed;
end
$$;

alter function public.mark_intake_requirement_notice_sent(uuid)
  owner to postgres;

revoke all
  on function public.mark_intake_requirement_notice_sent(uuid)
  from public,anon,authenticated;

grant execute
  on function public.mark_intake_requirement_notice_sent(uuid)
  to authenticated;

-- Customer Portal action-required projection follows the document lifecycle.
-- Only workflow-owned document requirements that are currently waiting on
-- the Customer are exposed.
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
    select access.organization_id,access.customer_id
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
    and coalesce(
      task.intake_requirement_context->>'kind',''
    )='DOCUMENT_REQUIREMENT'
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

update public.case_tasks task
set intake_requirement_context=
  coalesce(task.intake_requirement_context,'{}'::jsonb)
where task.intake_follow_up_id is not null
  and task.intake_question_definition_id is not null
  and (
    coalesce(task.intake_requirement_context->>'kind','')
      ='DOCUMENT_REQUIREMENT'
    or (
      jsonb_typeof(task.intake_requirement_context->'missing_option_ids')
        ='array'
      and jsonb_array_length(
        task.intake_requirement_context->'missing_option_ids'
      )>0
    )
  );

commit;
