begin;

do $$
begin
  if exists(
    select 1
    from public.case_tasks task
    where task.intake_follow_up_id is not null
      and not exists(
        select 1
        from public.organization_task_purposes purpose
        where purpose.organization_id=task.organization_id
          and purpose.is_active
          and lower(trim(purpose.label))='missing documents'
      )
  ) then
    raise exception
      'Every organization with Guided Intake requirement Tasks must have an active Missing Documents Task Purpose'
      using errcode='23514';
  end if;
end
$$;

create or replace function public.enforce_guided_intake_task_purpose()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  missing_documents_purpose_id uuid;
begin
  if new.intake_follow_up_id is null then
    return new;
  end if;

  select purpose.id
  into missing_documents_purpose_id
  from public.organization_task_purposes purpose
  where purpose.organization_id=new.organization_id
    and purpose.is_active
    and lower(trim(purpose.label))='missing documents'
  limit 1;

  if missing_documents_purpose_id is null then
    raise exception
      'Missing Documents Task Purpose is required for Guided Intake requirement Tasks'
      using errcode='23514';
  end if;

  new.task_purpose_id:=missing_documents_purpose_id;

  return new;
end
$$;

drop trigger if exists enforce_guided_intake_task_purpose
  on public.case_tasks;

create trigger enforce_guided_intake_task_purpose
before insert or update of intake_follow_up_id,task_purpose_id
on public.case_tasks
for each row
execute function public.enforce_guided_intake_task_purpose();

update public.case_tasks task
set task_purpose_id=purpose.id
from public.organization_task_purposes purpose
where task.intake_follow_up_id is not null
  and purpose.organization_id=task.organization_id
  and purpose.is_active
  and lower(trim(purpose.label))='missing documents'
  and task.task_purpose_id is distinct from purpose.id;

comment on function public.enforce_guided_intake_task_purpose() is
  'Guided Intake requirement Tasks are system-owned missing-document work. Their Task Purpose is automatically the organization active Missing Documents Purpose and cannot be reclassified by users.';

commit;
