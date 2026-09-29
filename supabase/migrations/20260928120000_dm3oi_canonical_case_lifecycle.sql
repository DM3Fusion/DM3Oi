begin;

-- Milestone 1 preserves the full enum and every historical row. New Case
-- creation is normalized at the table boundary so all existing creation RPC
-- overloads can remain deployment-compatible while assignment-derived legacy
-- statuses stop being persisted.
alter table public.cases
  alter column status set default 'IN_PROGRESS'::public.case_status;

create function public.enforce_canonical_case_creation_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('NEW', 'UNASSIGNED', 'ASSIGNED', 'REVIEW') then
    new.status := 'IN_PROGRESS'::public.case_status;
  elsif new.status not in ('IN_PROGRESS', 'WAITING') then
    raise exception 'new Cases must start in a canonical active status'
      using errcode = '23514';
  end if;

  return new;
end
$$;

revoke all on function public.enforce_canonical_case_creation_status()
  from public, anon, authenticated;

create trigger cases_canonical_creation_status
before insert on public.cases
for each row execute function public.enforce_canonical_case_creation_status();

-- Generic operational status changes may move work only between the two
-- canonical active states. COMPLETED is reserved for the later authoritative
-- completion RPC. Existing completed and historical rows remain readable but
-- cannot be reactivated through this generic path.
create or replace function public.transition_case_status(
  target_case_id uuid,
  target_status public.case_status
)
returns public.cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  item public.cases;
  previous public.case_status;
begin
  select * into item
  from public.cases
  where id = target_case_id
  for update;

  if not found then
    raise exception 'case not found' using errcode = 'P0002';
  end if;

  if not public.has_effective_organization_permission(
    item.organization_id,
    'WORK_CASES'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_status not in ('IN_PROGRESS', 'WAITING') then
    raise exception 'generic Case status transitions support only canonical active statuses'
      using errcode = '22023';
  end if;

  if not public.can_manage_case(item.organization_id, actor)
    and not public.can_access_case(item.id, item.organization_id, actor)
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if item.status not in (
    'NEW',
    'UNASSIGNED',
    'ASSIGNED',
    'REVIEW',
    'IN_PROGRESS',
    'WAITING'
  ) then
    raise exception 'terminal and historical Cases require a dedicated transition workflow'
      using errcode = '23514';
  end if;

  previous := item.status;
  if previous <> target_status then
    update public.cases
    set status = target_status
    where id = item.id
    returning * into item;

    insert into public.case_activity(
      organization_id,
      case_id,
      actor_user_id,
      event_type,
      event_data
    ) values (
      item.organization_id,
      item.id,
      actor,
      'STATUS_CHANGED',
      jsonb_build_object('before', previous, 'after', target_status)
    );

  end if;

  if not public.is_super_admin(actor)
    and public.is_super_admin(item.created_by_user_id)
  then
    item.created_by_user_id := null;
  end if;

  return item;
end
$$;

revoke all on function public.transition_case_status(uuid, public.case_status)
  from public, anon;
grant execute on function public.transition_case_status(uuid, public.case_status)
  to authenticated;

comment on function public.enforce_canonical_case_creation_status() is
  'Normalizes new Cases to the canonical active lifecycle without rewriting historical rows.';
comment on function public.transition_case_status(uuid, public.case_status) is
  'Generic Case status transition restricted to incomplete compatibility sources and IN_PROGRESS or WAITING targets. Terminal transitions require dedicated workflows.';

-- guard_case_completion remains installed for historical/direct compatibility.
-- Its temporary required-Task/required-Question checks will be replaced by the
-- later authoritative completion gate; no generic path can reach it now.

commit;
