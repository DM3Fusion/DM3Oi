begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Capture the database-authoritative reset boundary before waiting for any
-- in-flight ingestion. The temporary marker is transaction-local and is
-- removed automatically at commit.
create temporary table platform_analytics_reset_marker (
  reset_started_at timestamptz not null
) on commit drop;

insert into platform_analytics_reset_marker (reset_started_at)
values (pg_catalog.clock_timestamp());

-- Use the same transaction lock as guarded page-view ingestion. Existing
-- writers finish before the truncation; newer writers wait until commit and
-- retain a created_at at or after the captured reset boundary.
select pg_catalog.pg_advisory_xact_lock(143690001);

-- This is a one-time reset of platform-owned telemetry. TRUNCATE takes
-- ACCESS EXCLUSIVE locks, so ingestion that starts after the reset waits for
-- this transaction to commit and becomes part of the new trusted period.
-- All three telemetry tables use UUID or text primary keys, so there are no
-- analytics identity sequences to restart.
truncate table
  public.analytics_page_views,
  public.analytics_live_sessions,
  public.analytics_event_counters;

-- The singleton is permanently immutable to application roles. Temporarily
-- remove only its trigger inside this transaction, reset its database-owned
-- timestamp, and restore the same protection before commit. Any failure rolls
-- back both the timestamp change and the trigger DDL.
lock table public.platform_analytics_trusted_baseline
  in access exclusive mode;

drop trigger platform_analytics_trusted_baseline_immutable
  on public.platform_analytics_trusted_baseline;

do $reset_platform_analytics$
begin
  update public.platform_analytics_trusted_baseline baseline
  set trusted_data_started_at = marker.reset_started_at
  from platform_analytics_reset_marker marker
  where singleton = true;

  if not found then
    raise exception 'platform analytics trusted baseline is unavailable'
      using errcode = '55000';
  end if;
end;
$reset_platform_analytics$;

create trigger platform_analytics_trusted_baseline_immutable
before update or delete
on public.platform_analytics_trusted_baseline
for each row
execute function public.guard_platform_analytics_trusted_baseline();

commit;
