begin;

set local lock_timeout = '5s';
set local statement_timeout = '15s';

create or replace function public.record_analytics_page_view_guarded(
  target_session_id uuid,
  target_user_id uuid,
  target_organization_id uuid,
  target_path text,
  target_normalized_path text,
  target_referrer_host text,
  target_device_type text,
  target_device_model text,
  target_browser text,
  target_operating_system text,
  target_country_code text,
  target_region_code text,
  target_city text,
  target_traffic_type text,
  target_traffic_signal text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_global_count integer;
  recent_session_count integer;
begin
  /*
   * Serialize analytics-ingestion admission so concurrent callers cannot race
   * past the bounded write limits.
   *
   * Global ceiling:
   *   240 accepted page views per rolling minute.
   *
   * Per-session ceiling:
   *   30 accepted page views per rolling five minutes.
   *
   * These limits bound privileged analytics writes while remaining far above
   * normal human navigation volume.
   */
  perform pg_catalog.pg_advisory_xact_lock(143690001);

  select count(*)
  into recent_global_count
  from (
    select 1
    from public.analytics_page_views
    where created_at >= pg_catalog.clock_timestamp() - interval '1 minute'
    limit 240
  ) recent;

  if recent_global_count >= 240 then
    return false;
  end if;

  select count(*)
  into recent_session_count
  from (
    select 1
    from public.analytics_page_views
    where session_id = target_session_id
      and created_at >= pg_catalog.clock_timestamp() - interval '5 minutes'
    limit 30
  ) recent;

  if recent_session_count >= 30 then
    return false;
  end if;

  insert into public.analytics_page_views (
    session_id,
    user_id,
    organization_id,
    analytics_user_key,
    analytics_organization_key,
    path,
    normalized_path,
    referrer_host,
    device_type,
    device_model,
    browser,
    operating_system,
    country_code,
    region_code,
    city,
    traffic_type,
    traffic_signal
  )
  values (
    target_session_id,
    target_user_id,
    target_organization_id,
    target_user_id,
    target_organization_id,
    target_path,
    target_normalized_path,
    target_referrer_host,
    target_device_type,
    target_device_model,
    target_browser,
    target_operating_system,
    target_country_code,
    target_region_code,
    target_city,
    target_traffic_type,
    target_traffic_signal
  );

  return true;
end;
$$;

revoke all
  on function public.record_analytics_page_view_guarded(
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text
  )
  from public,
       anon,
       authenticated;

grant execute
  on function public.record_analytics_page_view_guarded(
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text
  )
  to service_role;

notify pgrst, 'reload schema';

commit;
