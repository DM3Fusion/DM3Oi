begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.analytics_page_views
  add column network_timezone text,
  add constraint analytics_page_views_network_timezone_check
    check (
      network_timezone is null
      or (
        char_length(network_timezone) between 1 and 120
        and network_timezone = trim(network_timezone)
        and network_timezone !~ '[[:cntrl:]]'
      )
    );

comment on column public.analytics_page_views.network_timezone is
  'Visitor network timezone supplied by supported request geographic metadata or provider headers. It is not inferred from coordinates.';

-- Preserve every deployed ingestion overload. The application uses this
-- additive overload only when persisting newly collected timezone metadata.
create function public.record_analytics_page_view_guarded(
  target_session_id uuid,
  target_user_id uuid,
  target_organization_id uuid,
  target_access_type text,
  target_access_role text,
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
  target_postal_code text,
  target_network_latitude numeric,
  target_network_longitude numeric,
  target_network_timezone text,
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
    analytics_access_type,
    analytics_access_role,
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
    postal_code,
    network_latitude,
    network_longitude,
    network_timezone,
    traffic_type,
    traffic_signal
  )
  values (
    target_session_id,
    target_user_id,
    target_organization_id,
    target_user_id,
    target_organization_id,
    target_access_type,
    target_access_role,
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
    target_postal_code,
    target_network_latitude,
    target_network_longitude,
    target_network_timezone,
    target_traffic_type,
    target_traffic_signal
  );

  return true;
end;
$$;

revoke all on function public.record_analytics_page_view_guarded(
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
  text,
  text,
  numeric,
  numeric,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.record_analytics_page_view_guarded(
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
  text,
  text,
  numeric,
  numeric,
  text,
  text,
  text
) to service_role;

comment on function public.record_analytics_page_view_guarded(
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
  text,
  text,
  numeric,
  numeric,
  text,
  text,
  text
) is
  'Service-role-only guarded page-view ingestion with provider-supplied coarse network geography and timezone. Existing overloads remain available for migration-safe rollout.';

-- Match 3DCM aggregation behavior by selecting the most frequently captured
-- provider label for each coarse coordinate, with deterministic lexical ties.
create or replace function public.get_platform_geographic_device_activity(
  target_start timestamptz,
  target_end_exclusive timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trusted_start timestamptz;
  effective_start timestamptz;
  result jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_start is not null
     and target_end_exclusive is not null
     and target_end_exclusive <= target_start then
    raise exception 'analytics range end must be after start'
      using errcode = '22023';
  end if;

  select baseline.trusted_data_started_at
  into trusted_start
  from public.platform_analytics_trusted_baseline baseline
  where baseline.singleton = true;

  if trusted_start is null then
    raise exception 'platform analytics trusted baseline is unavailable'
      using errcode = '55000';
  end if;

  effective_start := greatest(
    coalesce(target_start, trusted_start),
    trusted_start
  );

  with filtered as materialized (
    select
      nullif(trim(city), '') as city,
      nullif(trim(region_code), '') as region,
      nullif(trim(country_code), '') as country,
      network_latitude as latitude,
      network_longitude as longitude,
      device_type,
      created_at
    from public.analytics_page_views
    where created_at >= effective_start
      and (
        target_end_exclusive is null
        or created_at < target_end_exclusive
      )
  ),
  valid_coordinates as materialized (
    select *
    from filtered
    where latitude is not null
      and longitude is not null
      and not (
        latitude = 0
        and longitude = 0
      )
  ),
  grouped as (
    select
      latitude,
      longitude,
      count(*)::integer as page_views,
      count(*) filter (
        where device_type = 'DESKTOP'
      )::integer as desktop,
      count(*) filter (
        where device_type = 'MOBILE'
      )::integer as mobile,
      count(*) filter (
        where device_type = 'TABLET'
      )::integer as tablet,
      count(*) filter (
        where device_type = 'OTHER'
      )::integer as other,
      count(*) filter (
        where device_type is null
          or device_type not in (
            'DESKTOP', 'MOBILE', 'TABLET', 'OTHER'
          )
      )::integer as unknown,
      max(created_at) as last_accessed_at
    from valid_coordinates
    group by latitude, longitude
  ),
  label_counts as (
    select
      latitude,
      longitude,
      'city'::text as label_type,
      city as label,
      count(*)::integer as occurrences
    from valid_coordinates
    where city is not null
    group by latitude, longitude, city

    union all

    select
      latitude,
      longitude,
      'region'::text,
      region,
      count(*)::integer
    from valid_coordinates
    where region is not null
    group by latitude, longitude, region

    union all

    select
      latitude,
      longitude,
      'country'::text,
      country,
      count(*)::integer
    from valid_coordinates
    where country is not null
    group by latitude, longitude, country
  ),
  ranked_labels as (
    select
      label_counts.*,
      row_number() over (
        partition by latitude, longitude, label_type
        order by occurrences desc, label
      ) as label_rank
    from label_counts
  ),
  preferred_labels as (
    select
      latitude,
      longitude,
      max(label) filter (
        where label_type = 'city' and label_rank = 1
      ) as city,
      max(label) filter (
        where label_type = 'region' and label_rank = 1
      ) as region,
      max(label) filter (
        where label_type = 'country' and label_rank = 1
      ) as country
    from ranked_labels
    group by latitude, longitude
  ),
  totals as (
    select
      count(*)::integer as total_page_views,
      count(*) filter (
        where latitude is not null
          and longitude is not null
          and not (
            latitude = 0
            and longitude = 0
          )
      )::integer as geolocated_page_views
    from filtered
  )
  select jsonb_build_object(
    'trustedDataStartedAt', trusted_start,
    'totalPageViews', totals.total_page_views,
    'geolocatedPageViews', totals.geolocated_page_views,
    'unknownCoordinatePageViews',
      totals.total_page_views - totals.geolocated_page_views,
    'points', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'city', coalesce(preferred_labels.city, 'Unknown'),
            'region', coalesce(preferred_labels.region, 'Unknown'),
            'country', coalesce(preferred_labels.country, 'Unknown'),
            'latitude', grouped.latitude,
            'longitude', grouped.longitude,
            'pageViews', grouped.page_views,
            'desktop', grouped.desktop,
            'mobile', grouped.mobile,
            'tablet', grouped.tablet,
            'other', grouped.other,
            'unknown', grouped.unknown,
            'lastAccessedAt', grouped.last_accessed_at
          )
          order by
            grouped.page_views desc,
            preferred_labels.city,
            preferred_labels.region,
            grouped.latitude,
            grouped.longitude
        )
        from grouped
        left join preferred_labels
          on preferred_labels.latitude = grouped.latitude
         and preferred_labels.longitude = grouped.longitude
      ),
      '[]'::jsonb
    )
  )
  into result
  from totals;

  return result;
end;
$$;

revoke all on function public.get_platform_geographic_device_activity(
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.get_platform_geographic_device_activity(
  timestamptz,
  timestamptz
) to authenticated;

comment on function public.get_platform_geographic_device_activity(
  timestamptz,
  timestamptz
) is
  'SUPER_ADMIN-only geographic device activity using captured provider labels and deterministic most-frequent labels per coarse coordinate. No city is inferred from coordinates.';

create or replace function public.get_platform_analytics_details(
  target_start timestamptz,
  target_end_exclusive timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trusted_start timestamptz;
  effective_start timestamptz;
  result jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_start is not null
     and target_end_exclusive is not null
     and target_end_exclusive <= target_start then
    raise exception 'analytics range end must be after start'
      using errcode = '22023';
  end if;

  select baseline.trusted_data_started_at
  into trusted_start
  from public.platform_analytics_trusted_baseline baseline
  where baseline.singleton = true;

  if trusted_start is null then
    raise exception 'platform analytics trusted baseline is unavailable'
      using errcode = '55000';
  end if;

  effective_start := greatest(
    coalesce(target_start, trusted_start),
    trusted_start
  );

  if target_end_exclusive is not null
     and target_end_exclusive <= effective_start then
    return jsonb_build_object(
      'trustedDataStartedAt', trusted_start,
      'deviceTypeBreakdown', '[]'::jsonb,
      'timezoneBreakdown', '[]'::jsonb
    );
  end if;

  with filtered as materialized (
    select
      device_type,
      nullif(trim(network_timezone), '') as network_timezone
    from public.analytics_page_views
    where created_at >= effective_start
      and (
        target_end_exclusive is null
        or created_at < target_end_exclusive
      )
  ),
  device_types as (
    select
      case
        when device_type in (
          'DESKTOP', 'MOBILE', 'TABLET', 'OTHER'
        ) then device_type
        else 'UNKNOWN'
      end as label,
      count(*)::integer as page_views
    from filtered
    group by 1
  ),
  timezones as (
    select
      network_timezone as label,
      count(*)::integer as page_views
    from filtered
    where network_timezone is not null
    group by network_timezone
    order by page_views desc, network_timezone
    limit 8
  )
  select jsonb_build_object(
    'trustedDataStartedAt', trusted_start,
    'deviceTypeBreakdown', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'label', initcap(lower(device_types.label)),
            'value', device_types.page_views
          )
          order by device_types.page_views desc, device_types.label
        )
        from device_types
      ),
      '[]'::jsonb
    ),
    'timezoneBreakdown', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'label', timezones.label,
            'value', timezones.page_views
          )
          order by timezones.page_views desc, timezones.label
        )
        from timezones
      ),
      '[]'::jsonb
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_platform_analytics_details(
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.get_platform_analytics_details(
  timestamptz,
  timestamptz
) to authenticated;

comment on function public.get_platform_analytics_details(
  timestamptz,
  timestamptz
) is
  'SUPER_ADMIN-only device-type and captured network-timezone detail derived from the trusted analytics period.';

notify pgrst, 'reload schema';

commit;
