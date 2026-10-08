-- Platform Analytics Geography visit semantics
--
-- Geography represents unique dm3oi.com visits by approximate network
-- location rather than raw page-view events.
--
-- Raw analytics_page_views telemetry remains unchanged.
-- A browser analytics session contributes one visit to each geography
-- tuple it reaches, regardless of repeated page navigation.
-- Unique pages are distinct normalized routes observed at that location.
--
-- Trusted baseline, SUPER_ADMIN exclusion, ingestion, attribution,
-- Top Pages, and authenticated-access analytics remain unchanged.

create or replace function public.get_platform_analytics_before_trusted_baseline(
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
  result jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_start is not null
     and target_end_exclusive is not null
     and target_end_exclusive <= target_start then
    raise exception 'analytics range end must be after start'
      using errcode = '22023';
  end if;

  with filtered as materialized (
    select
      session_id,
      analytics_user_key,
      analytics_organization_key,
      normalized_path,
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
      traffic_type,
      created_at
    from public.analytics_page_views
    where (target_start is null or created_at >= target_start)
      and (target_end_exclusive is null or created_at < target_end_exclusive)
  )
  select jsonb_build_object(
    'pageViews', (select count(*) from filtered),
    'sessions', (select count(distinct session_id) from filtered),
    'users', (
      select count(distinct analytics_user_key)
      from filtered
      where analytics_user_key is not null
    ),
    'organizations', (
      select count(distinct analytics_organization_key)
      from filtered
      where analytics_organization_key is not null
    ),
    'trafficDays', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('key', day_key, 'value', page_views)
          order by day_key
        ),
        '[]'::jsonb
      )
      from (
        select
          to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day_key,
          count(*) as page_views
        from filtered
        group by 1
      ) daily
    ),
    'deviceBreakdown', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('label', label, 'value', page_views)
          order by page_views desc, label
        ),
        '[]'::jsonb
      )
      from (
        select
          coalesce(device_model, initcap(replace(device_type, '_', ' '))) as label,
          count(*) as page_views
        from filtered
        group by 1
        order by page_views desc, label
        limit 5
      ) devices
    ),
    'browserBreakdown', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('label', label, 'value', page_views)
          order by page_views desc, label
        ),
        '[]'::jsonb
      )
      from (
        select browser as label, count(*) as page_views
        from filtered
        group by browser
        order by page_views desc, label
        limit 5
      ) browsers
    ),
    'operatingSystemBreakdown', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('label', label, 'value', page_views)
          order by page_views desc, label
        ),
        '[]'::jsonb
      )
      from (
        select operating_system as label, count(*) as page_views
        from filtered
        group by operating_system
        order by page_views desc, label
        limit 5
      ) systems
    ),
    'trafficTypeBreakdown', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('label', label, 'value', page_views)
          order by page_views desc, label
        ),
        '[]'::jsonb
      )
      from (
        select
          case traffic_type
            when 'HUMAN' then 'Human'
            when 'LIKELY_BOT' then 'Likely Bot'
            else 'Unclassified'
          end as label,
          count(*) as page_views
        from filtered
        group by traffic_type
      ) traffic
    ),
    'topPages', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('path', normalized_path, 'pageViews', page_views)
          order by page_views desc, normalized_path
        ),
        '[]'::jsonb
      )
      from (
        select normalized_path, count(*) as page_views
        from filtered
        group by normalized_path
      ) pages
    ),
    'geography', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'label', label,
            'postalCode', postal_code,
            'latitude', network_latitude,
            'longitude', network_longitude,
            'visits', visits,
            'uniquePages', unique_pages
          )
          order by
            visits desc,
            label,
            postal_code nulls last,
            network_latitude nulls last,
            network_longitude nulls last
        ),
        '[]'::jsonb
      )
      from (
        select
          coalesce(
            nullif(
              concat_ws(
                ', ',
                city,
                nullif(concat_ws(' ', region_code, postal_code), ''),
                country_code
              ),
              ''
            ),
            case
              when network_latitude is not null
                or network_longitude is not null
              then 'Approximate network location'
              else 'Unknown'
            end
          ) as label,
          postal_code,
          network_latitude,
          network_longitude,
          visits,
          unique_pages
        from (
          select
            nullif(trim(city), '') as city,
            nullif(trim(region_code), '') as region_code,
            nullif(trim(country_code), '') as country_code,
            nullif(trim(postal_code), '') as postal_code,
            network_latitude,
            network_longitude,
            count(distinct session_id) as visits,
            count(distinct normalized_path) as unique_pages
          from filtered
          group by
            nullif(trim(city), ''),
            nullif(trim(region_code), ''),
            nullif(trim(country_code), ''),
            nullif(trim(postal_code), ''),
            network_latitude,
            network_longitude
        ) grouped
      ) locations
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_platform_analytics_before_trusted_baseline(
  timestamptz,
  timestamptz
) from public, anon, authenticated;
