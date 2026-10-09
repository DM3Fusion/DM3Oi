begin;

-- Fix PostgreSQL 42702 in the existing Guided Intake follow-up Task RPC.
-- The PL/pgSQL variable previously shared the case_tasks.assigned_user_id
-- column name, making UPDATE assignment resolution ambiguous.
--
-- No authorization, validation, lifecycle, or Task semantics change here.

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
  follow_up_assignee_id uuid;
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
    follow_up_assignee_id:=nullif(target_follow_up->>'assignedUserId','')::uuid;
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
    or follow_up_assignee_id is null
    or due_date is null
    or jsonb_typeof(target_follow_up->'missingOptionIds')<>'array'
    or jsonb_typeof(target_follow_up->'missingOptionLabels')<>'array'
  then
    raise exception 'invalid follow-up Task' using errcode='23514';
  end if;

  select * into question_row
  from public.question_definitions question
  where question.organization_id=target_organization_id
    and question.id=follow_up_question_id
    and question.active;

  if not found then
    raise exception 'invalid follow-up intake requirement'
      using errcode='23514';
  end if;

  /*
   * Non-empty missingOptionIds identifies the existing document/item
   * requirement workflow. Empty arrays identify a generic YES/NO
   * follow-up created when the current answer is No.
   */
  if jsonb_array_length(target_follow_up->'missingOptionIds')>0 then
    if question_row.response_type<>'MULTI_SELECT'
      or not (
        question_row.require_all_options
        or question_row.track_required_options
      )
    then
      raise exception 'invalid document follow-up intake requirement'
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
        and option_row.is_active
      where option_row.id is null
    ) then
      raise exception 'invalid missing requirement option'
        using errcode='23514';
    end if;

    select
      coalesce(
        jsonb_agg(
          to_jsonb(option_row.id::text)
          order by submitted.ordinality
        ),
        '[]'::jsonb
      ),
      coalesce(
        jsonb_agg(
          to_jsonb(option_row.option_label)
          order by submitted.ordinality
        ),
        '[]'::jsonb
      )
    into canonical_missing_ids,canonical_missing_labels
    from jsonb_array_elements_text(
      target_follow_up->'missingOptionIds'
    ) with ordinality submitted(id,ordinality)
    join public.question_options option_row
      on option_row.id=submitted.id::uuid
      and option_row.question_id=follow_up_question_id
      and option_row.organization_id=target_organization_id
      and option_row.is_active;
  else
    canonical_missing_ids:='[]'::jsonb;
    canonical_missing_labels:='[]'::jsonb;

    if question_row.response_type<>'YES_NO'
      or question_row.completion_condition<>'YES_REQUIRED'
      or not (
        coalesce(
          draft_row.answers->follow_up_question_id::text,
          'null'::jsonb
        ) is not distinct from 'false'::jsonb
        or (
          requested_status='COMPLETED'
          and coalesce(
            draft_row.answers->follow_up_question_id::text,
            'null'::jsonb
          ) is not distinct from 'true'::jsonb
        )
      )
    then
      raise exception 'Question does not require a generic follow-up Task'
        using errcode='23514';
    end if;
  end if;

  canonical_follow_up:=jsonb_build_object(
    'id',follow_up_id::text,
    'questionId',follow_up_question_id::text,
    'title',
      case
        when jsonb_array_length(canonical_missing_ids)>0
          then 'Obtain missing required documents'
        else 'Resolve intake question'
      end,
    'description',
      case
        when jsonb_array_length(canonical_missing_ids)>0 then
          'Outstanding requirements: '
          || (
            select string_agg(value,', ' order by ordinality)
            from jsonb_array_elements_text(canonical_missing_labels)
              with ordinality labels(value,ordinality)
          )
        else
          'Intake question: ' || question_row.question_text
      end,
    'missingOptionIds',canonical_missing_ids,
    'missingOptionLabels',canonical_missing_labels,
    'assignedUserId',follow_up_assignee_id::text,
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
      and member.user_id=follow_up_assignee_id
      and member.is_active
      and member.status='ACTIVE'
      and not public.is_super_admin(member.user_id)
  ) then
    raise exception 'invalid follow-up Task assignee'
      using errcode='23514';
  end if;

  if exists(
    select 1
    from public.case_tasks task
    where task.organization_id=target_organization_id
      and task.case_id=item.id
      and task.intake_question_definition_id=follow_up_question_id
      and task.intake_follow_up_id is not null
      and task.intake_follow_up_id<>follow_up_id
  ) then
    raise exception 'A Guided Intake follow-up Task already exists for this Question'
      using errcode='23514';
  end if;

  select * into existing_task
  from public.case_tasks task
  where task.organization_id=target_organization_id
    and task.case_id=item.id
    and task.intake_follow_up_id=follow_up_id
  for update;

  if found then
    if existing_task.assigned_user_id is distinct from follow_up_assignee_id
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
        assigned_user_id=follow_up_assignee_id,
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
          'kind',
            case
              when jsonb_array_length(
                canonical_follow_up->'missingOptionIds'
              )>0
                then 'DOCUMENT_REQUIREMENT'
              else 'QUESTION_FOLLOW_UP'
            end,
          'question_text',question_row.question_text,
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
      follow_up_assignee_id,
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
        'kind',
          case
            when jsonb_array_length(
              canonical_follow_up->'missingOptionIds'
            )>0
              then 'DOCUMENT_REQUIREMENT'
            else 'QUESTION_FOLLOW_UP'
          end,
        'question_text',question_row.question_text,
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

commit;
