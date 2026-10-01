begin;

-- Restrict generic Guided Intake follow-up Tasks to required unresolved
-- YES_REQUIRED Questions. ANY_ANSWER responses are complete when answered,
-- and optional Questions do not create workflow Tasks.

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

create or replace function public.finalize_guided_case_intake(
  target_organization_id uuid,
  target_submission_key uuid,
  target_customer_id uuid,
  target_customer_mode text,
  target_description text,
  target_case_type_id uuid,
  target_priority public.priority_level,
  target_tax_year integer,
  target_manager_user_id uuid,
  target_staff_user_ids uuid[],
  target_answers jsonb,
  target_follow_up_tasks jsonb,
  target_portal_onboarding jsonb
)
returns public.cases
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  draft_row public.guided_case_intake_drafts;
  item public.cases;
  semantic_type public.organization_case_types;
  question_row public.question_definitions;
  action_row public.rule_actions;
  follow_up jsonb;
  case_question_snapshot_id uuid;
  task_id uuid;
  next_sequence integer:=0;
  completed boolean;
  applicable_question_ids uuid[]:='{}'::uuid[];
  expanded_question_ids uuid[]:='{}'::uuid[];
  effective_rule_ids uuid[]:='{}'::uuid[];
  previous_count integer:=-1;
  current_tax_year integer;
  staff_id uuid;
  onboarding_mode text;
  customer_email text;
  submitted_resolution text;
  submitted_customer_id uuid;
  submitted_invitation_id uuid;
  portal_resolved boolean:=false;
begin
  if actor is null
    or target_submission_key is null
    or not public.has_effective_organization_permission(
      target_organization_id,'WORK_CASES'
    )
    or not public.has_effective_organization_permission(
      target_organization_id,'VIEW_CUSTOMERS'
    )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.organizations organization
    join public.customers customer
      on customer.organization_id=organization.id
      and customer.id=target_customer_id
      and customer.status='ACTIVE'
    where organization.id=target_organization_id
      and organization.status='ACTIVE'
  ) then
    raise exception 'invalid customer' using errcode='23514';
  end if;

  select * into draft_row
  from public.guided_case_intake_drafts draft
  where draft.organization_id=target_organization_id
    and draft.submission_key=target_submission_key
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
    or item.customer_id<>target_customer_id
    or item.tax_year is distinct from target_tax_year
    or item.case_type_id is distinct from target_case_type_id
    or draft_row.customer_id is distinct from target_customer_id
    or draft_row.tax_year is distinct from target_tax_year
    or draft_row.case_type_id is distinct from target_case_type_id
  then
    raise exception 'Guided Intake Case identity does not match'
      using errcode='23514';
  end if;

  if draft_row.finalized_at is not null then
    return item;
  end if;

  if item.status not in ('IN_PROGRESS','WAITING') then
    raise exception 'Guided Intake Case is no longer active'
      using errcode='23514';
  end if;

  if target_customer_mode<>draft_row.customer_mode then
    raise exception 'Guided Intake Customer mode does not match'
      using errcode='23514';
  end if;

  select * into semantic_type
  from public.organization_case_types type_option
  where type_option.organization_id=target_organization_id
    and type_option.id=target_case_type_id
    and type_option.is_active
  for share;
  if not found then
    raise exception 'invalid Case Type' using errcode='23514';
  end if;
  if semantic_type.customer_mode<>'ANY'
    and semantic_type.customer_mode<>(
      case when target_customer_mode='new' then 'NEW' else 'EXISTING' end
    ) then
    raise exception 'Case Type is not valid for the selected Customer mode'
      using errcode='23514';
  end if;

  select extract(
    year from now() at time zone coalesce(settings.timezone,'UTC')
  )::integer
  into current_tax_year
  from public.organization_settings settings
  where settings.organization_id=target_organization_id;
  current_tax_year:=coalesce(
    current_tax_year,
    extract(year from now() at time zone 'UTC')::integer
  );
  if target_tax_year is null or target_tax_year not between 1900 and 2200 then
    raise exception 'valid Case tax year is required' using errcode='23514';
  end if;
  if semantic_type.tax_year_rule='CURRENT_YEAR'
    and target_tax_year<>current_tax_year then
    raise exception 'Case Type requires the current Tax Year'
      using errcode='23514';
  end if;
  if semantic_type.tax_year_rule='PRIOR_YEAR_REQUIRED'
    and target_tax_year>=current_tax_year then
    raise exception 'Case Type requires a prior Tax Year'
      using errcode='23514';
  end if;

  target_staff_user_ids:=coalesce(target_staff_user_ids,'{}'::uuid[]);
  if cardinality(target_staff_user_ids)=0 then
    raise exception 'at least one assigned staff member is required'
      using errcode='23514';
  end if;
  if cardinality(target_staff_user_ids)<>(
    select count(distinct candidate)
    from unnest(target_staff_user_ids) candidate
  ) then
    raise exception 'duplicate staff assignment' using errcode='23514';
  end if;
  if target_manager_user_id is not null and not exists(
    select 1
    from public.organization_members member
    join public.profiles profile
      on profile.id=member.user_id and profile.is_active
    where member.organization_id=target_organization_id
      and member.user_id=target_manager_user_id
      and member.is_active
      and member.status='ACTIVE'
      and not public.is_super_admin(member.user_id)
      and public.effective_organization_role_permission(
        target_organization_id,member.role,'ASSIGN_CASES'
      )
  ) then
    raise exception 'invalid manager' using errcode='23514';
  end if;
  foreach staff_id in array target_staff_user_ids loop
    if not exists(
      select 1
      from public.organization_members member
      join public.profiles profile
        on profile.id=member.user_id and profile.is_active
      where member.organization_id=target_organization_id
        and member.user_id=staff_id
        and member.is_active
        and member.status='ACTIVE'
        and not public.is_super_admin(member.user_id)
    ) then
      raise exception 'invalid staff assignment' using errcode='23514';
    end if;
  end loop;
  if target_manager_user_id is distinct from item.manager_user_id
    or (
      target_manager_user_id is not null and not exists(
        select 1 from public.case_assignments assignment
        where assignment.organization_id=target_organization_id
          and assignment.case_id=item.id
          and assignment.user_id=target_manager_user_id
          and assignment.assignment_role='MANAGER'
          and assignment.is_active
      )
    )
    or (
      target_manager_user_id is null and exists(
        select 1 from public.case_assignments assignment
        where assignment.organization_id=target_organization_id
          and assignment.case_id=item.id
          and assignment.assignment_role='MANAGER'
          and assignment.is_active
      )
    )
    or exists(
      select 1 from unnest(target_staff_user_ids) requested(user_id)
      where not exists(
        select 1 from public.case_assignments assignment
        where assignment.organization_id=target_organization_id
          and assignment.case_id=item.id
          and assignment.user_id=requested.user_id
          and assignment.assignment_role='STAFF'
          and assignment.is_active
      )
    )
    or exists(
      select 1 from public.case_assignments assignment
      where assignment.organization_id=target_organization_id
        and assignment.case_id=item.id
        and assignment.assignment_role='STAFF'
        and assignment.is_active
        and not assignment.user_id=any(target_staff_user_ids)
    )
  then
    raise exception 'Case assignment changed after intake materialization'
      using errcode='23514';
  end if;

  if jsonb_typeof(target_answers)<>'object' then
    raise exception 'answers must be an object' using errcode='22023';
  end if;
  if exists(
    select 1
    from jsonb_object_keys(target_answers) answer_key
    left join public.question_definitions question
      on question.id::text=answer_key
      and question.organization_id=target_organization_id
      and question.active
    where question.id is null
  ) then
    raise exception 'invalid intake question' using errcode='23514';
  end if;

  perform public.assert_rule_graph_acyclic(target_organization_id);

  select coalesce(
    array_agg(question.id order by question.display_order,question.id),
    '{}'::uuid[]
  ) into applicable_question_ids
  from public.question_definitions question
  where question.organization_id=target_organization_id
    and question.active
    and (question.required or not exists(
      select 1
      from public.rule_actions action
      join public.rule_definitions rule
        on rule.id=action.rule_definition_id
        and rule.organization_id=action.organization_id
      join public.question_definitions source_question
        on source_question.id=rule.source_question_id
        and source_question.organization_id=rule.organization_id
        and source_question.active
      where action.organization_id=target_organization_id
        and rule.active
        and action.retired_at is null
        and action.action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
        and action.target_question_id=question.id
    ));

  loop
    previous_count:=cardinality(applicable_question_ids);
    select coalesce(
      array_agg(distinct candidate.id),'{}'::uuid[]
    ) into expanded_question_ids
    from (
      select unnest(applicable_question_ids) id
      union
      select action.target_question_id
      from public.rule_actions action
      join public.rule_definitions rule
        on rule.id=action.rule_definition_id
        and rule.organization_id=action.organization_id
      join public.question_definitions target_question
        on target_question.id=action.target_question_id
        and target_question.organization_id=action.organization_id
        and target_question.active
      where rule.organization_id=target_organization_id
        and rule.active
        and rule.source_question_id=any(applicable_question_ids)
        and action.retired_at is null
        and action.action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
        and action.target_question_id is not null
        and public.guided_intake_rule_matches(
          target_organization_id,rule.source_question_id,
          rule.condition_operator,rule.condition_option_id,target_answers
        )
    ) candidate;
    applicable_question_ids:=expanded_question_ids;
    exit when cardinality(applicable_question_ids)=previous_count;
  end loop;

  select coalesce(
    array_agg(rule.id order by rule.display_order,rule.id),'{}'::uuid[]
  ) into effective_rule_ids
  from public.rule_definitions rule
  where rule.organization_id=target_organization_id
    and rule.active
    and rule.source_question_id=any(applicable_question_ids)
    and public.guided_intake_rule_matches(
      target_organization_id,rule.source_question_id,
      rule.condition_operator,rule.condition_option_id,target_answers
    );

  for question_row in
    select question.*
    from public.question_definitions question
    where question.organization_id=target_organization_id
      and question.id=any(applicable_question_ids)
      and question.active
    order by question.display_order,question.id
  loop
    if target_answers ? question_row.id::text
      and not public.guided_intake_response_valid(
        target_organization_id,question_row.id,question_row.response_type,
        target_answers->question_row.id::text
      ) then
      raise exception 'invalid intake response' using errcode='22023';
    end if;
    if (
      question_row.required or exists(
        select 1 from public.rule_actions action
        where action.organization_id=target_organization_id
          and action.rule_definition_id=any(effective_rule_ids)
          and action.retired_at is null
          and action.action_type='REQUIRE_QUESTION'
          and action.target_question_id=question_row.id
      )
    ) and not (
      target_answers ? question_row.id::text
      and public.guided_intake_response_complete(
        target_organization_id,question_row.id,question_row.response_type,
        target_answers->question_row.id::text
      )
    ) and not exists(
      select 1
      from jsonb_array_elements(target_follow_up_tasks) staged
      where nullif(staged->>'questionId','')::uuid=question_row.id
    ) then
      raise exception
        'required intake response is unresolved and has no follow-up Task'
        using errcode='23514';
    end if;
  end loop;

  if jsonb_typeof(target_follow_up_tasks)<>'array' then
    raise exception 'follow-up Tasks must be an array' using errcode='22023';
  end if;
  if exists(
    select submitted->>'id'
    from jsonb_array_elements(target_follow_up_tasks) submitted
    group by submitted->>'id'
    having count(*)>1
  ) then
    raise exception 'duplicate follow-up Task' using errcode='23514';
  end if;

  if exists(
    select submitted->>'questionId'
    from jsonb_array_elements(target_follow_up_tasks) submitted
    group by submitted->>'questionId'
    having count(*)>1
  ) then
    raise exception 'duplicate follow-up Task Question'
      using errcode='23514';
  end if;

  for follow_up in select value from jsonb_array_elements(target_follow_up_tasks) loop
    if nullif(follow_up->>'id','')::uuid is null
      or nullif(follow_up->>'questionId','')::uuid is null
      or length(trim(coalesce(follow_up->>'title','')))=0
      or nullif(follow_up->>'assignedUserId','')::uuid is null
      or coalesce(follow_up->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(follow_up->'missingOptionIds')<>'array'
      or jsonb_typeof(follow_up->'missingOptionLabels')<>'array'
      or coalesce(follow_up->>'status','') not in (
        'NOT_STARTED',
        'IN_PROGRESS',
        'WAITING_ON_CUSTOMER',
        'REQUIRED_UNAVAILABLE',
        'COMPLETED'
      )
    then
      raise exception 'invalid follow-up Task' using errcode='23514';
    end if;

    select * into question_row
    from public.question_definitions question
    where question.organization_id=target_organization_id
      and question.id=nullif(follow_up->>'questionId','')::uuid
      and question.active;

    if not found then
      raise exception 'invalid follow-up intake requirement'
        using errcode='23514';
    end if;

    if jsonb_array_length(follow_up->'missingOptionIds')>0 then
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
          follow_up->'missingOptionIds'
        ) missing(id)
        left join public.question_options option_row
          on option_row.id=missing.id::uuid
          and option_row.question_id=question_row.id
          and option_row.organization_id=target_organization_id
          and option_row.is_active
        where option_row.id is null
      ) then
        raise exception 'invalid missing requirement option'
          using errcode='23514';
      end if;
    else
      if (
        question_row.response_type='MULTI_SELECT'
        and (
          question_row.require_all_options
          or question_row.track_required_options
        )
      ) then
        -- Completed missing-document Tasks remain historical workflow
        -- evidence after all required items have been received.
        if follow_up->>'status'<>'COMPLETED'
          or not (
            target_answers ? question_row.id::text
            and public.guided_intake_response_complete(
              target_organization_id,
              question_row.id,
              question_row.response_type,
              target_answers->question_row.id::text
            )
          )
        then
          raise exception 'invalid completed document follow-up Task'
            using errcode='23514';
        end if;

      elsif question_row.response_type='YES_NO'
        and question_row.completion_condition='YES_REQUIRED'
      then
        -- No creates/keeps the follow-up open. Once changed to Yes, the
        -- same Task is retained as completed historical workflow evidence.
        if not (
          coalesce(
            target_answers->question_row.id::text,
            'null'::jsonb
          ) is not distinct from 'false'::jsonb
          or (
            follow_up->>'status'='COMPLETED'
            and coalesce(
              target_answers->question_row.id::text,
              'null'::jsonb
            ) is not distinct from 'true'::jsonb
          )
        )
        then
          raise exception 'Question does not require a generic follow-up Task'
            using errcode='23514';
        end if;

      else
        raise exception 'invalid generic follow-up intake requirement'
          using errcode='23514';
      end if;
    end if;

    if not exists(
      select 1
      from public.organization_members member
      join public.profiles profile
        on profile.id=member.user_id and profile.is_active
      where member.organization_id=target_organization_id
        and member.user_id=nullif(follow_up->>'assignedUserId','')::uuid
        and member.is_active
        and member.status='ACTIVE'
        and not public.is_super_admin(member.user_id)
    ) then
      raise exception 'invalid follow-up Task assignee'
        using errcode='23514';
    end if;

    completed:=coalesce((follow_up->>'completed')::boolean,false);

    -- COMPLETED requires the linked Question itself to be satisfied.
    -- REQUIRED_UNAVAILABLE is the explicit resolved-exception state and may
    -- therefore resolve an otherwise unsatisfied required Question.
    if completed
      and follow_up->>'status'<>'REQUIRED_UNAVAILABLE'
      and not(
        target_answers ? question_row.id::text
        and public.guided_intake_response_complete(
          target_organization_id,question_row.id,question_row.response_type,
          target_answers->question_row.id::text
        )
      )
    then
      raise exception
        'Required Question is unresolved and cannot be marked completed'
        using errcode='23514';
    end if;
  end loop;

  if jsonb_typeof(target_portal_onboarding)<>'object' then
    raise exception 'Customer Portal onboarding state must be an object'
      using errcode='22023';
  end if;

  select coalesce(settings.portal_onboarding_mode,'MANUAL_ONLY')
    into onboarding_mode
  from public.organizations organization
  left join public.organization_settings settings
    on settings.organization_id=organization.id
  where organization.id=target_organization_id
    and organization.status='ACTIVE';

  if not found then
    raise exception 'organization is inactive' using errcode='42501';
  end if;

  if onboarding_mode='PROMPT_DURING_CASE_INTAKE' then
    select lower(trim(customer.email)) into customer_email
    from public.customers customer
    where customer.organization_id=target_organization_id
      and customer.id=target_customer_id
      and customer.status='ACTIVE';

    submitted_resolution:=coalesce(target_portal_onboarding->>'resolution','');
    begin
      submitted_customer_id:=nullif(target_portal_onboarding->>'customerId','')::uuid;
      submitted_invitation_id:=nullif(target_portal_onboarding->>'invitationId','')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid Customer portal onboarding'
        using errcode='23514';
    end;

    select exists(
      select 1
      from public.customer_portal_users link
      join public.profiles profile
        on profile.id=link.user_id and profile.is_active
      join auth.users auth_user on auth_user.id=link.user_id
      join public.organizations organization
        on organization.id=link.organization_id
        and organization.status='ACTIVE'
      join public.organization_settings settings
        on settings.organization_id=link.organization_id
        and settings.portal_enabled
      where link.organization_id=target_organization_id
        and link.customer_id=target_customer_id
        and link.is_active
        and (
          auth_user.email_confirmed_at is not null
          or auth_user.last_sign_in_at is not null
        )
    ) into portal_resolved;

    if not portal_resolved
      and submitted_resolution='INVITATION_SENT'
      and submitted_customer_id=target_customer_id
      and submitted_invitation_id is not null
      and customer_email is not null
    then
      select exists(
        select 1
        from public.customer_portal_invitations invitation
        join public.customer_portal_users link
          on link.organization_id=invitation.organization_id
          and link.customer_id=invitation.customer_id
          and link.user_id=invitation.user_id
          and link.is_active
        join public.profiles profile
          on profile.id=link.user_id and profile.is_active
        join auth.users auth_user on auth_user.id=link.user_id
        join public.organizations organization
          on organization.id=invitation.organization_id
          and organization.status='ACTIVE'
        join public.organization_settings settings
          on settings.organization_id=invitation.organization_id
          and settings.portal_enabled
        where invitation.id=submitted_invitation_id
          and invitation.organization_id=target_organization_id
          and invitation.customer_id=target_customer_id
          and invitation.status in ('SENT','ACTIVATED')
          and invitation.send_count>0
          and invitation.last_sent_at is not null
          and invitation.recipient_email=customer_email
          and lower(coalesce(auth_user.email,''))=customer_email
      ) into portal_resolved;
    end if;

    if not portal_resolved
      and submitted_resolution='NOT_REQUIRED'
      and submitted_customer_id=target_customer_id
      and submitted_invitation_id is null
    then
      portal_resolved:=true;
    end if;

    if not portal_resolved then
      raise exception 'Customer Portal onboarding is unresolved'
        using errcode='23514';
    end if;
  end if;

  update public.cases
  set description=coalesce(trim(target_description),''),
      priority=target_priority
  where id=item.id
  returning * into item;

  for question_row in
    select question.*
    from public.question_definitions question
    where question.organization_id=target_organization_id
      and question.id=any(applicable_question_ids)
      and question.active
    order by question.display_order,question.id
  loop
    insert into public.case_questions(
      organization_id,case_id,question_definition_id,question_text,
      description,response_type,required,display_order,options_snapshot
    ) values(
      target_organization_id,item.id,question_row.id,
      question_row.question_text,question_row.description,
      question_row.response_type,
      question_row.required or exists(
        select 1 from public.rule_actions action
        where action.organization_id=target_organization_id
          and action.rule_definition_id=any(effective_rule_ids)
          and action.retired_at is null
          and action.action_type='REQUIRE_QUESTION'
          and action.target_question_id=question_row.id
      ),
      question_row.display_order,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',option_row.id,
          'label',option_row.option_label,
          'value',option_row.option_value,
          'display_order',option_row.display_order
        ) order by option_row.display_order,option_row.id)
        from public.question_options option_row
        where option_row.question_id=question_row.id
          and option_row.is_active
      ),'[]'::jsonb)
    )
    on conflict(case_id,question_definition_id) do nothing;

    select question.id into case_question_snapshot_id
    from public.case_questions question
    where question.case_id=item.id
      and question.question_definition_id=question_row.id;

    if target_answers ? question_row.id::text then
      insert into public.case_question_responses(
        organization_id,case_id,case_question_id,response_value,
        responded_by_user_id
      ) values(
        target_organization_id,item.id,case_question_snapshot_id,
        target_answers->question_row.id::text,actor
      )
      on conflict(case_question_id) do update
      set response_value=excluded.response_value,
          responded_by_user_id=actor;

      insert into public.case_activity(
        organization_id,case_id,actor_user_id,event_type,event_data
      ) values(
        target_organization_id,item.id,actor,'QUESTION_RESPONSE_UPDATED',
        jsonb_build_object('case_question_id',case_question_snapshot_id)
      );
    end if;
  end loop;

  for action_row in
    select action.*
    from public.rule_actions action
    join public.rule_definitions rule
      on rule.id=action.rule_definition_id
      and rule.organization_id=action.organization_id
    where action.organization_id=target_organization_id
      and action.rule_definition_id=any(effective_rule_ids)
      and action.retired_at is null
      and action.action_type='CREATE_TASK'
      and action.task_title is not null
      and action.task_priority is not null
    order by rule.display_order,action.display_order,action.id
  loop
    select coalesce(max(sequence),0)+1 into next_sequence
    from public.case_tasks where case_id=item.id;

    insert into public.case_tasks(
      organization_id,case_id,title,description,status,required,due_at,
      sequence,created_by_user_id,priority,blocking,source_rule_id,
      source_rule_action_id
    ) values(
      target_organization_id,item.id,action_row.task_title,
      coalesce(action_row.task_description,''),'NOT_STARTED',
      coalesce(action_row.task_required,false),
      public.organization_task_due_at(
        target_organization_id,action_row.task_due_in_days
      ),
      next_sequence,actor,action_row.task_priority,
      coalesce(action_row.task_blocking,false),
      action_row.rule_definition_id,action_row.id
    )
    on conflict(organization_id,case_id,source_rule_action_id)
      where source_rule_action_id is not null
      do nothing
    returning id into task_id;

    if task_id is not null then
      insert into public.case_activity(
        organization_id,case_id,actor_user_id,event_type,event_data
      ) values(
        target_organization_id,item.id,actor,'RULE_TASK_CREATED',
        jsonb_build_object('task_id',task_id,'title',action_row.task_title)
      );
    end if;
    task_id:=null;
  end loop;

  for follow_up in select value from jsonb_array_elements(target_follow_up_tasks) loop
    select coalesce(max(sequence),0)+1 into next_sequence
    from public.case_tasks where case_id=item.id;
    completed:=coalesce((follow_up->>'completed')::boolean,false);

    insert into public.case_tasks(
      organization_id,case_id,title,description,assigned_user_id,status,
      required,due_at,sequence,created_by_user_id,priority,blocking,
      intake_follow_up_id,intake_question_definition_id,
      intake_requirement_context
    ) values(
      target_organization_id,item.id,trim(follow_up->>'title'),
      coalesce(follow_up->>'description',''),
      (follow_up->>'assignedUserId')::uuid,
      (follow_up->>'status')::public.case_task_status,
      true,
      public.organization_end_of_date(
        target_organization_id,(follow_up->>'dueDate')::date
      ),
      next_sequence,actor,'NORMAL',true,(follow_up->>'id')::uuid,
      (follow_up->>'questionId')::uuid,
      jsonb_build_object(
        'kind',
          case
            when jsonb_array_length(follow_up->'missingOptionIds')>0
              then 'DOCUMENT_REQUIREMENT'
            else 'QUESTION_FOLLOW_UP'
          end,
        'question_text',(
          select current_question.question_text
          from public.question_definitions current_question
          where current_question.organization_id=target_organization_id
            and current_question.id=(follow_up->>'questionId')::uuid
        ),
        'missing_option_ids',follow_up->'missingOptionIds',
        'missing_option_labels',follow_up->'missingOptionLabels'
      )
    )
    on conflict(organization_id,case_id,intake_follow_up_id)
      where intake_follow_up_id is not null
      do nothing
    returning id into task_id;

    if task_id is not null then
      insert into public.case_activity(
        organization_id,case_id,actor_user_id,event_type,event_data
      ) values(
        target_organization_id,item.id,actor,'TASK_CREATED',
        jsonb_build_object(
          'task_id',task_id,'title',follow_up->>'title',
          'source','GUIDED_INTAKE'
        )
      );
    end if;
    task_id:=null;
  end loop;

  update public.guided_case_intake_drafts
  set answers=target_answers,
      follow_up_tasks=target_follow_up_tasks,
      portal_onboarding=target_portal_onboarding,
      current_step=5,
      finalized_at=now()
  where id=draft_row.id;

  -- Milestone 2 deliberately leaves the operational lifecycle unchanged.
  if item.status not in ('IN_PROGRESS','WAITING') then
    raise exception 'Guided Intake finalization cannot change Case lifecycle'
      using errcode='23514';
  end if;

  return item;
end
$$;

alter function public.upsert_guided_intake_follow_up_task(
  uuid,uuid,jsonb
) owner to postgres;

revoke all
  on function public.upsert_guided_intake_follow_up_task(uuid,uuid,jsonb)
  from public,anon,authenticated;

grant execute
  on function public.upsert_guided_intake_follow_up_task(uuid,uuid,jsonb)
  to authenticated;

alter function public.finalize_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb
) owner to postgres;

revoke all
  on function public.finalize_guided_case_intake(
    uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,
    uuid,uuid[],jsonb,jsonb,jsonb
  )
  from public,anon,authenticated;

grant execute
  on function public.finalize_guided_case_intake(
    uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,
    uuid,uuid[],jsonb,jsonb,jsonb
  )
  to authenticated;

commit;
