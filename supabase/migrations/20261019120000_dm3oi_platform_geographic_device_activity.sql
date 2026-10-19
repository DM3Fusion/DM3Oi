begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.get_platform_geographic_device_activity(
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
      normalized_path,
      created_at
    from public.analytics_page_views
    where created_at >= effective_start
      and (
        target_end_exclusive is null
        or created_at < target_end_exclusive
      )
  ),
  grouped as (
    select
      coalesce(max(city), 'Unknown') as city,
      coalesce(max(region), 'Unknown') as region,
      coalesce(max(country), 'Unknown') as country,
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
    from filtered
    where latitude is not null
      and longitude is not null
      and not (
        latitude = 0
        and longitude = 0
      )
    group by
      latitude,
      longitude
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
    'trustedDataStartedAt',
      trusted_start,
    'totalPageViews',
      totals.total_page_views,
    'geolocatedPageViews',
      totals.geolocated_page_views,
    'unknownCoordinatePageViews',
      totals.total_page_views
        - totals.geolocated_page_views,
    'points',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'city', grouped.city,
              'region', grouped.region,
              'country', grouped.country,
              'latitude', grouped.latitude,
              'longitude', grouped.longitude,
              'pageViews', grouped.page_views,
              'desktop', grouped.desktop,
              'mobile', grouped.mobile,
              'tablet', grouped.tablet,
              'other', grouped.other,
              'unknown', grouped.unknown,
              'lastAccessedAt',
                grouped.last_accessed_at
            )
            order by
              grouped.page_views desc,
              grouped.city,
              grouped.region
          )
          from grouped
        ),
        '[]'::jsonb
      )
  )
  into result
  from totals;

  return result;
end;
$$;

revoke all on function
  public.get_platform_geographic_device_activity(
    timestamptz,
    timestamptz
  )
from public, anon, authenticated;

grant execute on function
  public.get_platform_geographic_device_activity(
    timestamptz,
    timestamptz
  )
to authenticated;

comment on function
  public.get_platform_geographic_device_activity(
    timestamptz,
    timestamptz
  )
is
  'SUPER_ADMIN-only geographic device activity aggregated from trusted platform page views. Coordinates represent approximate network locations, not GPS.';


create function public.get_platform_geographic_location_history(
  target_start timestamptz,
  target_end_exclusive timestamptz,
  target_latitude numeric,
  target_longitude numeric,
  target_limit integer default 50,
  target_offset integer default 0
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
  effective_limit integer;
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

  if target_latitude is null
     or target_longitude is null
     or target_latitude not between -90 and 90
     or target_longitude not between -180 and 180
     or (
       target_latitude = 0
       and target_longitude = 0
     ) then
    raise exception 'invalid geographic coordinates'
      using errcode = '22023';
  end if;

  if target_limit is null
     or target_limit < 1
     or target_limit > 100
     or target_offset is null
     or target_offset < 0
     or target_offset > 100000 then
    raise exception 'invalid pagination parameters'
      using errcode = '22023';
  end if;

  effective_limit := target_limit;

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

  with matching as materialized (
    select
      id,
      created_at,
      normalized_path,
      device_type,
      city,
      region_code,
      country_code
    from public.analytics_page_views
    where created_at >= effective_start
      and (
        target_end_exclusive is null
        or created_at < target_end_exclusive
      )
      and network_latitude = target_latitude
      and network_longitude = target_longitude
  ),
  totals as (
    select count(*)::integer as total
    from matching
  ),
  paginated as (
    select *
    from matching
    order by created_at desc, id desc
    limit effective_limit
    offset target_offset
  )
  select jsonb_build_object(
    'total',
      totals.total,
    'limit',
      effective_limit,
    'offset',
      target_offset,
    'rows',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'timestamp', paginated.created_at,
              'path', paginated.normalized_path,
              'deviceType', paginated.device_type,
              'city', paginated.city,
              'region', paginated.region_code,
              'country', paginated.country_code
            )
            order by
              paginated.created_at desc,
              paginated.id desc
          )
          from paginated
        ),
        '[]'::jsonb
      )
  )
  into result
  from totals;

  return result;
end;
$$;

revoke all on function
  public.get_platform_geographic_location_history(
    timestamptz,
    timestamptz,
    numeric,
    numeric,
    integer,
    integer
  )
from public, anon, authenticated;

grant execute on function
  public.get_platform_geographic_location_history(
    timestamptz,
    timestamptz,
    numeric,
    numeric,
    integer,
    integer
  )
to authenticated;

comment on function
  public.get_platform_geographic_location_history(
    timestamptz,
    timestamptz,
    numeric,
    numeric,
    integer,
    integer
  )
is
  'SUPER_ADMIN-only paginated page-view history for an approximate network coordinate. No user identities returned.';

commit;
