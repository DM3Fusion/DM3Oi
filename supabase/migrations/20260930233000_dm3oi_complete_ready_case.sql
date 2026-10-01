begin;

create or replace function public.complete_case(
  target_case_id uuid
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
    raise exception 'Guided Intake must be finalized before completing the Case'
      using errcode='23514';
  end if;

  /*
   * The existing cases_completion_guard remains authoritative for
   * required Questions and required/blocking Tasks.
   */
  update public.cases
  set status='COMPLETED'
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
      'after','COMPLETED'
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
      'source','CASE_READINESS'
    )
  );

  return changed;
end
$$;

alter function public.complete_case(uuid)
  owner to postgres;

revoke all
  on function public.complete_case(uuid)
  from public,anon,authenticated;

grant execute
  on function public.complete_case(uuid)
  to authenticated;

comment on function public.complete_case(uuid) is
  'Completes an authorized active Case after Guided Intake finalization. The existing Case completion trigger remains authoritative for required work.';

commit;
