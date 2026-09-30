begin;

-- ============================================================
-- GUIDED INTAKE FOLLOW-UP TASK REASSIGNMENT GUARD
--
-- Workflow-owned Guided Intake Tasks may be reassigned only by
-- an active BUSINESS_OWNER or STAFF_MANAGER who also retains
-- the effective ASSIGN_TASKS permission.
--
-- This is an UPDATE-only guard:
-- - initial Task assignment remains unchanged
-- - non-Guided-Intake Tasks remain unchanged
-- - changing any field other than assigned_user_id is unchanged
-- ============================================================

create or replace function public.guard_guided_intake_task_reassignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.application_role;
begin
  if new.assigned_user_id is not distinct from old.assigned_user_id then
    return new;
  end if;

  if old.intake_follow_up_id is null then
    return new;
  end if;

  if actor is null then
    raise exception 'not authorized'
      using errcode='42501';
  end if;

  select member.role
  into actor_role
  from public.organization_members member
  join public.profiles profile
    on profile.id=member.user_id
   and profile.is_active
  where member.organization_id=old.organization_id
    and member.user_id=actor
    and member.is_active
    and member.status='ACTIVE';

  if actor_role is null
     or actor_role not in (
       'BUSINESS_OWNER'::public.application_role,
       'STAFF_MANAGER'::public.application_role
     )
     or not public.has_effective_organization_permission(
       old.organization_id,
       'ASSIGN_TASKS'
     )
  then
    raise exception
      'only a Business Owner or Staff Manager may reassign this Guided Intake Task'
      using errcode='42501';
  end if;

  return new;
end
$$;

alter function public.guard_guided_intake_task_reassignment()
  owner to postgres;

revoke all on function public.guard_guided_intake_task_reassignment()
  from public,anon,authenticated;

drop trigger if exists
  guard_guided_intake_task_reassignment
  on public.case_tasks;

create trigger guard_guided_intake_task_reassignment
before update of assigned_user_id
on public.case_tasks
for each row
execute function public.guard_guided_intake_task_reassignment();

comment on function public.guard_guided_intake_task_reassignment() is
  'Database backstop: an existing Guided Intake follow-up Task can be reassigned only by an active Business Owner or Staff Manager with effective ASSIGN_TASKS permission.';

commit;
