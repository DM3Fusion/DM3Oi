begin;

create function public.upsert_guided_intake_follow_up_task(
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
  question_id uuid;
  assigned_user_id uuid;
  due_date date;
  next_sequence integer;
  updated_follow_ups jsonb;
  canonical_follow_up jsonb;
  canonical_missing_ids jsonb;
  canonical_missing_labels jsonb;
begin
  if actor is null
    or target_submission_key is null
    or not public.has_effective_organization_permission(
      target_organization_id,'CREATE_CASE'
    )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select * into draft_row
  from public.guided_case_intake_drafts draft
  where draft.organization_id=target_organization_id
    and draft.created_by_user_id=actor
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
    or item.created_by_user_id<>actor
    or item.intake_submission_key is distinct from target_submission_key
    or item.status<>'IN_PROGRESS'
  then
    raise exception 'Guided Intake Case is not available for follow-up Tasks'
      using errcode='23514';
  end if;

  if jsonb_typeof(target_follow_up)<>'object' then
    raise exception 'invalid follow-up Task' using errcode='22023';
  end if;

  begin
    follow_up_id:=nullif(target_follow_up->>'id','')::uuid;
    question_id:=nullif(target_follow_up->>'questionId','')::uuid;
    assigned_user_id:=nullif(target_follow_up->>'assignedUserId','')::uuid;
    due_date:=nullif(target_follow_up->>'dueDate','')::date;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception 'invalid follow-up Task' using errcode='23514';
  end;

  if follow_up_id is null
    or question_id is null
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
    and question.id=question_id
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
      and option_row.question_id=question_id
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
    and option_row.question_id=question_id
    and option_row.organization_id=target_organization_id;

  canonical_follow_up:=jsonb_build_object(
    'id',follow_up_id::text,
    'questionId',question_id::text,
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
    'completed',false
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
    update public.case_tasks
    set title=canonical_follow_up->>'title',
        description=canonical_follow_up->>'description',
        assigned_user_id=assigned_user_id,
        required=true,
        due_at=public.organization_end_of_date(
          target_organization_id,due_date
        ),
        priority='NORMAL',
        blocking=true,
        intake_question_definition_id=question_id,
        intake_requirement_context=jsonb_build_object(
          'missing_option_ids',canonical_follow_up->'missingOptionIds',
          'missing_option_labels',canonical_follow_up->'missingOptionLabels'
        )
    where id=existing_task.id
    returning * into changed;
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
      intake_requirement_context
    ) values(
      target_organization_id,
      item.id,
      canonical_follow_up->>'title',
      canonical_follow_up->>'description',
      assigned_user_id,
      'NOT_STARTED',
      true,
      public.organization_end_of_date(
        target_organization_id,due_date
      ),
      next_sequence,
      actor,
      'NORMAL',
      true,
      follow_up_id,
      question_id,
      jsonb_build_object(
        'missing_option_ids',target_follow_up->'missingOptionIds',
        'missing_option_labels',target_follow_up->'missingOptionLabels'
      )
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
       or entry->>'questionId'=question_id::text
  ) then
    select coalesce(
      jsonb_agg(
        case
          when entry.value->>'id'=follow_up_id::text
            or entry.value->>'questionId'=question_id::text
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


create function public.reconcile_finalized_guided_intake_follow_up_tasks()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  follow_up jsonb;
  target_task public.case_tasks;
begin
  if old.finalized_at is not null
    or new.finalized_at is null
    or new.case_id is null
  then
    return new;
  end if;

  if jsonb_typeof(new.follow_up_tasks)<>'array' then
    return new;
  end if;

  for follow_up in
    select value
    from jsonb_array_elements(new.follow_up_tasks)
  loop
    select * into target_task
    from public.case_tasks task
    where task.organization_id=new.organization_id
      and task.case_id=new.case_id
      and task.intake_follow_up_id=
        nullif(follow_up->>'id','')::uuid
    for update;

    if not found then
      continue;
    end if;

    update public.case_tasks
    set title=trim(follow_up->>'title'),
        description=coalesce(follow_up->>'description',''),
        assigned_user_id=
          nullif(follow_up->>'assignedUserId','')::uuid,
        due_at=public.organization_end_of_date(
          new.organization_id,
          (follow_up->>'dueDate')::date
        ),
        required=true,
        priority='NORMAL',
        blocking=true,
        intake_question_definition_id=
          nullif(follow_up->>'questionId','')::uuid,
        intake_requirement_context=jsonb_build_object(
          'missing_option_ids',
          follow_up->'missingOptionIds',
          'missing_option_labels',
          follow_up->'missingOptionLabels'
        ),
        status=case
          when coalesce(
            (follow_up->>'completed')::boolean,
            false
          )
          then 'COMPLETED'::public.case_task_status
          else target_task.status
        end
    where id=target_task.id;
  end loop;

  return new;
end
$$;

create trigger guided_case_intake_finalize_follow_up_tasks
after update of finalized_at
on public.guided_case_intake_drafts
for each row
when (
  old.finalized_at is null
  and new.finalized_at is not null
)
execute function public.reconcile_finalized_guided_intake_follow_up_tasks();

revoke all on function public.reconcile_finalized_guided_intake_follow_up_tasks()
  from public,anon,authenticated;

revoke all on function public.upsert_guided_intake_follow_up_task(
  uuid,uuid,jsonb
) from public,anon;

grant execute on function public.upsert_guided_intake_follow_up_task(
  uuid,uuid,jsonb
) to authenticated;

comment on function public.upsert_guided_intake_follow_up_task(
  uuid,uuid,jsonb
) is
  'Creates or updates a real blocking Case Task during an already-materialized Guided Intake and atomically persists the matching intake follow-up definition.';

commit;
