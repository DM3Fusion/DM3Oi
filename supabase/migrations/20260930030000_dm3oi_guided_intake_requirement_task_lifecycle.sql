begin;

-- ============================================================
-- GUIDED INTAKE REQUIREMENT TASK LIFECYCLE
--
-- A Guided Intake requirement Task is workflow-owned.
-- Requirements changes may synchronize only its lifecycle status.
--
-- This boundary deliberately does NOT edit:
-- - title / description
-- - assignment
-- - due date
-- - Task Purpose
-- - required / blocking
-- - requirement provenance
-- ============================================================

create function public.sync_guided_intake_requirement_task_status(
  target_task_id uuid,
  target_completed boolean
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
  follow_up jsonb;
  draft_completed boolean;
  target_status public.case_task_status;
  event_name text;
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

  if existing.intake_follow_up_id is null
     or existing.intake_question_definition_id is null then
    raise exception 'task is not a Guided Intake requirement'
      using errcode='23514';
  end if;

  if not public.has_effective_organization_permission(
       existing.organization_id,
       'CREATE_CASE'
     )
     or not public.can_access_case(
       existing.case_id,
       existing.organization_id,
       actor
     ) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select draft.*
  into draft_row
  from public.guided_case_intake_drafts draft
  where draft.organization_id=existing.organization_id
    and draft.case_id=existing.case_id
    and draft.created_by_user_id=actor
    and draft.finalized_at is null
  for update;

  if not found then
    raise exception 'Guided Intake session is not available'
      using errcode='42501';
  end if;

  select submitted.value
  into follow_up
  from jsonb_array_elements(
    coalesce(draft_row.follow_up_tasks,'[]'::jsonb)
  ) submitted(value)
  where submitted.value->>'id'=existing.intake_follow_up_id::text
  limit 1;

  if follow_up is null then
    raise exception 'Guided Intake follow-up Task is not available'
      using errcode='23514';
  end if;

  draft_completed:=coalesce((follow_up->>'completed')::boolean,false);

  if draft_completed is distinct from target_completed then
    raise exception 'Guided Intake Task state does not match saved Requirements'
      using errcode='23514';
  end if;

  target_status:=case
    when target_completed then
      'COMPLETED'::public.case_task_status
    when existing.status='COMPLETED' then
      'IN_PROGRESS'::public.case_task_status
    else
      existing.status
  end;

  if target_status=existing.status then
    return existing;
  end if;

  update public.case_tasks
  set
    status=target_status,
    completed_at=case
      when target_status='COMPLETED'
        then coalesce(existing.completed_at,now())
      else null
    end,
    completed_by_user_id=case
      when target_status='COMPLETED'
        then coalesce(existing.completed_by_user_id,actor)
      else null
    end
  where id=existing.id
  returning * into changed;

  event_name:=case
    when target_status='COMPLETED' then 'TASK_COMPLETED'
    else 'TASK_STARTED'
  end;

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
    event_name,
    jsonb_build_object(
      'task_id',changed.id,
      'before_status',existing.status,
      'after_status',changed.status,
      'source','GUIDED_INTAKE',
      'requirements_lifecycle_sync',true
    )
  );

  return changed;
end
$$;

alter function public.sync_guided_intake_requirement_task_status(uuid,boolean)
  owner to postgres;

revoke all
  on function public.sync_guided_intake_requirement_task_status(uuid,boolean)
  from public,anon,authenticated;

grant execute
  on function public.sync_guided_intake_requirement_task_status(uuid,boolean)
  to authenticated;

comment on function
  public.sync_guided_intake_requirement_task_status(uuid,boolean) is
  'Synchronizes only the lifecycle status and completion audit fields of an existing workflow-owned Guided Intake requirement Task from its already-saved Guided Intake Requirements state.';

commit;
