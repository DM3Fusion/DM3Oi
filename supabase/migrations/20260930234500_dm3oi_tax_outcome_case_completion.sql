begin;

alter table public.cases
  add column tax_outcome text;

alter table public.cases
  add constraint cases_tax_outcome_check
  check (
    tax_outcome is null
    or tax_outcome in (
      'REFUND',
      'BALANCE_DUE',
      'ZERO_BALANCE'
    )
  );

create or replace function public.guard_case_tax_outcome_completion()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='COMPLETED'
     and old.status<>'COMPLETED'
     and new.tax_outcome is null
  then
    raise exception
      'A final tax preparation outcome is required before completing the Case.'
      using errcode='23514';
  end if;

  if new.status<>'COMPLETED'
     and new.tax_outcome is not null
  then
    raise exception
      'Tax preparation outcome may only be stored on a completed Case.'
      using errcode='23514';
  end if;

  return new;
end
$$;

create trigger cases_tax_outcome_completion_guard
before update of status,tax_outcome
on public.cases
for each row
execute function public.guard_case_tax_outcome_completion();

create or replace function public.guard_completed_case_immutability()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status='COMPLETED' then
    raise exception
      'Completed Cases are read-only.'
      using errcode='23514';
  end if;

  if tg_op='DELETE' then
    return old;
  end if;

  return new;
end
$$;

create trigger cases_completed_read_only
before update or delete
on public.cases
for each row
execute function public.guard_completed_case_immutability();

create or replace function public.guard_completed_case_child_mutation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  target_case_id uuid;
begin
  target_case_id :=
    case
      when tg_op='DELETE' then old.case_id
      else new.case_id
    end;

  if exists(
    select 1
    from public.cases item
    where item.id=target_case_id
      and item.status='COMPLETED'
  ) then
    raise exception
      'Completed Cases are read-only.'
      using errcode='23514';
  end if;

  if tg_op='DELETE' then
    return old;
  end if;

  return new;
end
$$;

create trigger case_tasks_completed_case_read_only
before insert or update or delete
on public.case_tasks
for each row
execute function public.guard_completed_case_child_mutation();

create trigger case_assignments_completed_case_read_only
before insert or update or delete
on public.case_assignments
for each row
execute function public.guard_completed_case_child_mutation();

create trigger case_question_responses_completed_case_read_only
before insert or update or delete
on public.case_question_responses
for each row
execute function public.guard_completed_case_child_mutation();

drop function if exists public.complete_case(uuid);

create function public.complete_case(
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
      and task.status<>'NOT_APPLICABLE'
      and task.blocking
      and task.status<>'COMPLETED'
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

alter function public.complete_case(uuid,text)
  owner to postgres;

revoke all
  on function public.complete_case(uuid,text)
  from public,anon,authenticated;

grant execute
  on function public.complete_case(uuid,text)
  to authenticated;

comment on function public.complete_case(uuid,text) is
  'Completes an authorized ready Case with an authoritative final tax preparation outcome. Completion records actor/time in Case activity and completed_at on the Case.';

drop function if exists public.get_customer_portal_cases(uuid);

create function public.get_customer_portal_cases(
  target_portal_access_id uuid
)
returns table(
  case_number text,
  service_label text,
  customer_status text,
  progress_percent integer,
  intake_finalized boolean,
  tax_outcome text
)
language sql
stable
security definer
set search_path=''
as $$
  with authorized_portal_access as (
    select
      access.organization_id,
      access.customer_id
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
    item.case_number,
    item.case_type as service_label,
    case item.status
      when 'NEW' then 'Getting Started'
      when 'UNASSIGNED' then 'Getting Started'
      when 'ASSIGNED' then 'Getting Started'
      when 'IN_PROGRESS' then 'In Progress'
      when 'WAITING' then 'Waiting'
      when 'REVIEW' then 'Under Review'
      when 'COMPLETED' then 'Completed'
    end as customer_status,
    case
      when item.status='COMPLETED' then 100
      else greatest(0,least(100,progress.percentage))
    end as progress_percent,
    exists(
      select 1
      from public.guided_case_intake_drafts draft
      where draft.organization_id=item.organization_id
        and draft.case_id=item.id
        and draft.finalized_at is not null
    ) as intake_finalized,
    item.tax_outcome
  from authorized_portal_access access
  join public.cases item
    on item.organization_id=access.organization_id
    and item.customer_id=access.customer_id
  cross join lateral public.get_case_progress(item.id) progress
  where item.status not in ('CLOSED','CANCELLED')
  order by
    case when item.status='COMPLETED' then 1 else 0 end,
    item.opened_at desc,
    item.case_number desc
$$;

alter function public.get_customer_portal_cases(uuid)
  owner to postgres;

revoke all
  on function public.get_customer_portal_cases(uuid)
  from public,anon,authenticated;

grant execute
  on function public.get_customer_portal_cases(uuid)
  to authenticated;

comment on function public.get_customer_portal_cases(uuid) is
  'Returns customer-safe Case summaries including authoritative final tax preparation outcome for completed Cases.';

commit;
