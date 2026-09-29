create or replace function public.delete_case_task(
  target_task_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  existing public.case_tasks;
begin
  select *
  into existing
  from public.case_tasks
  where id = target_task_id
  for update;

  if not found then
    raise exception 'task not found'
      using errcode='P0002';
  end if;

  if not public.has_effective_organization_permission(
      existing.organization_id,
      'MANAGE_TASKS'
    )
    or not public.can_access_case(
      existing.case_id,
      existing.organization_id,
      actor
    )
  then
    raise exception 'not authorized'
      using errcode='42501';
  end if;

  if existing.source_rule_action_id is not null
     or existing.intake_follow_up_id is not null
  then
    raise exception 'workflow-generated tasks cannot be deleted; update task status instead'
      using errcode='23514';
  end if;

  delete from public.case_tasks
  where id = existing.id;

  insert into public.case_activity(
    organization_id,
    case_id,
    actor_user_id,
    event_type,
    event_data
  )
  values(
    existing.organization_id,
    existing.case_id,
    actor,
    'TASK_DELETED',
    jsonb_build_object(
      'task_id', existing.id,
      'title', existing.title
    )
  );
end
$$;

comment on function public.delete_case_task(uuid) is
  'Deletes only manually managed Case Tasks. Rule-generated and Guided Intake/Requirements-generated Tasks retain workflow history and must be resolved through Task status or workflow reconciliation.';
