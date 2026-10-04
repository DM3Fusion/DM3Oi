begin;

set local lock_timeout='5s';
set local statement_timeout='60s';

-- A fixed-key counter records successful public Overview serves without
-- collecting request, identity, organization, customer, network, or device
-- data. The single-row upsert bounds both storage growth and write work.
create table public.analytics_event_counters (
  event_name text primary key
    check (event_name='OVERVIEW_DOWNLOAD_SERVED'),
  event_count bigint not null default 0
    check (event_count>=0),
  first_recorded_at timestamptz not null default now(),
  last_recorded_at timestamptz not null default now()
);

alter table public.analytics_event_counters
  enable row level security;

revoke all on table public.analytics_event_counters
  from public,anon,authenticated,service_role;

-- The public route calls this through its server-only service-role client.
-- No argument is accepted, so callers cannot select an event name or attach
-- arbitrary metadata. Concurrent successful responses increment atomically.
create function public.record_overview_download_served()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.analytics_event_counters(
    event_name,
    event_count,
    first_recorded_at,
    last_recorded_at
  )
  values(
    'OVERVIEW_DOWNLOAD_SERVED',
    1,
    now(),
    now()
  )
  on conflict(event_name)
  do update
  set event_count=public.analytics_event_counters.event_count+1,
      last_recorded_at=excluded.last_recorded_at;
end
$$;

alter function public.record_overview_download_served()
  owner to postgres;
revoke all on function public.record_overview_download_served()
  from public,anon,authenticated,service_role;
grant execute on function public.record_overview_download_served()
  to service_role;

-- Platform Console reads remain independently protected at the database
-- boundary. A missing counter row represents zero successful serves.
create function public.get_overview_download_count()
returns bigint
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor_id uuid:=auth.uid();
  result bigint;
begin
  if actor_id is null
    or not public.is_super_admin(actor_id)
  then
    raise exception 'SUPER_ADMIN access required'
      using errcode='42501';
  end if;

  select counter.event_count
  into result
  from public.analytics_event_counters counter
  where counter.event_name='OVERVIEW_DOWNLOAD_SERVED';

  return coalesce(result,0);
end
$$;

alter function public.get_overview_download_count()
  owner to postgres;
revoke all on function public.get_overview_download_count()
  from public,anon,authenticated,service_role;
grant execute on function public.get_overview_download_count()
  to authenticated;

comment on table public.analytics_event_counters is
  'Fixed first-party cumulative event counters with no visitor, tenant, or request metadata.';
comment on function public.record_overview_download_served() is
  'Service-role-only atomic increment for a successfully constructed public DM3Oi Overview response.';
comment on function public.get_overview_download_count() is
  'Returns the all-time DM3Oi Overview served count to active SUPER_ADMIN callers only.';

commit;
