begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.analytics_page_views
  add column postal_code text,
  add column network_latitude numeric(4, 2),
  add column network_longitude numeric(5, 2),
  add constraint analytics_page_views_postal_code_check
    check (
      postal_code is null
      or (
        char_length(postal_code) between 1 and 32
        and postal_code = trim(postal_code)
      )
    ),
  add constraint analytics_page_views_network_latitude_check
    check (
      network_latitude is null
      or network_latitude between -90.00 and 90.00
    ),
  add constraint analytics_page_views_network_longitude_check
    check (
      network_longitude is null
      or network_longitude between -180.00 and 180.00
    );

comment on column public.analytics_page_views.postal_code is
  'Approximate network postal code supplied by Vercel request metadata; not a Customer address or verified physical location.';
comment on column public.analytics_page_views.network_latitude is
  'Approximate network latitude supplied by Vercel and rounded server-side to two decimal places before persistence; not GPS or device location.';
comment on column public.analytics_page_views.network_longitude is
  'Approximate network longitude supplied by Vercel and rounded server-side to two decimal places before persistence; not GPS or device location.';

-- Keep the deployed 15- and 17-argument overloads intact so migration-first
-- rollout remains compatible with the currently deployed ingestion source.
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
  text
) to service_role;

-- Preserve the established KPI calculations and change only the Geography
-- tuple and payload. The trusted-baseline wrapper continues to pass its
-- database-clamped effective range to this internal aggregate.
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
            'pageViews', page_views
          )
          order by
            page_views desc,
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
          page_views
        from (
          select
            nullif(trim(city), '') as city,
            nullif(trim(region_code), '') as region_code,
            nullif(trim(country_code), '') as country_code,
            nullif(trim(postal_code), '') as postal_code,
            network_latitude,
            network_longitude,
            count(*) as page_views
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

create or replace function public.get_platform_authenticated_access_analytics(
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
    raise exception 'not authorized' using errcode = '42501';
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

  effective_start := case
    when target_start is null then trusted_start
    when target_start < trusted_start then trusted_start
    else target_start
  end;

  with filtered as materialized (
    select
      session_id,
      analytics_user_key,
      analytics_organization_key,
      case
        when analytics_user_key is null then 'PUBLIC'
        when analytics_access_type is not null then analytics_access_type
        when analytics_organization_key is not null then 'INTERNAL'
        else 'AUTHENTICATED_HISTORICAL'
      end as access_type,
      analytics_access_role as access_role,
      normalized_path,
      country_code,
      region_code,
      city,
      postal_code,
      network_latitude,
      network_longitude,
      created_at
    from public.analytics_page_views
    where created_at >= effective_start
      and (target_end_exclusive is null or created_at < target_end_exclusive)
  ),
  authenticated as materialized (
    select *
    from filtered
    where analytics_user_key is not null
  ),
  rollups as (
    select
      analytics_user_key,
      analytics_organization_key,
      access_type,
      access_role,
      count(*) as page_views,
      count(distinct session_id) as sessions,
      max(created_at) as last_activity
    from authenticated
    group by
      analytics_user_key,
      analytics_organization_key,
      access_type,
      access_role
  ),
  route_counts as (
    select
      analytics_user_key,
      analytics_organization_key,
      access_type,
      access_role,
      normalized_path,
      count(*) as page_views
    from authenticated
    group by
      analytics_user_key,
      analytics_organization_key,
      access_type,
      access_role,
      normalized_path
  ),
  ranked_routes as (
    select
      route_counts.*,
      row_number() over (
        partition by
          analytics_user_key,
          analytics_organization_key,
          access_type,
          access_role
        order by page_views desc, normalized_path
      ) as route_rank
    from route_counts
  ),
  geography_grouped as (
    select
      analytics_user_key,
      analytics_organization_key,
      access_type,
      access_role,
      nullif(trim(city), '') as city,
      nullif(trim(region_code), '') as region_code,
      nullif(trim(country_code), '') as country_code,
      nullif(trim(postal_code), '') as postal_code,
      network_latitude,
      network_longitude,
      count(*) as page_views
    from authenticated
    group by
      analytics_user_key,
      analytics_organization_key,
      access_type,
      access_role,
      nullif(trim(city), ''),
      nullif(trim(region_code), ''),
      nullif(trim(country_code), ''),
      nullif(trim(postal_code), ''),
      network_latitude,
      network_longitude
  ),
  geography_counts as (
    select
      analytics_user_key,
      analytics_organization_key,
      access_type,
      access_role,
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
      ) || case
        when network_latitude is not null
          and network_longitude is not null
        then ' · Approx. network: '
          || network_latitude::text
          || ', '
          || network_longitude::text
        else ''
      end as geography,
      page_views
    from geography_grouped
  ),
  ranked_geography as (
    select
      geography_counts.*,
      row_number() over (
        partition by
          analytics_user_key,
          analytics_organization_key,
          access_type,
          access_role
        order by page_views desc, geography
      ) as geography_rank
    from geography_counts
  )
  select jsonb_build_object(
    'trustedDataStartedAt', trusted_start,
    'summary', jsonb_build_object(
      'internalPageViews', count(*) filter (where access_type = 'INTERNAL'),
      'customerPortalPageViews', count(*) filter (where access_type = 'CUSTOMER_PORTAL'),
      'unclassifiedAuthenticatedPageViews', count(*) filter (
        where access_type in (
          'AUTHENTICATED_UNCLASSIFIED',
          'AUTHENTICATED_HISTORICAL'
        )
      ),
      'publicPageViews', count(*) filter (where access_type = 'PUBLIC')
    ),
    'rows', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'identityKey', rollup.analytics_user_key,
            'user', coalesce(
              nullif(trim(profile.display_name), ''),
              nullif(
                trim(concat_ws(' ', profile.first_name, profile.last_name)),
                ''
              ),
              nullif(split_part(profile.email, '@', 1), ''),
              'Unavailable account'
            ),
            'email', nullif(trim(profile.email), ''),
            'accountIdentifier', coalesce(
              nullif(trim(profile.email), ''),
              'Account ' || left(rollup.analytics_user_key::text, 8)
            ),
            'accessType', rollup.access_type,
            'role', rollup.access_role,
            'organization', case
              when rollup.analytics_organization_key is null then 'Not captured'
              else coalesce(organization.name, 'Organization unavailable')
            end,
            'pageViews', rollup.page_views,
            'sessions', rollup.sessions,
            'lastActivity', rollup.last_activity,
            'topRoute', ranked_route.normalized_path,
            'geography', ranked_location.geography
          )
          order by rollup.last_activity desc, rollup.analytics_user_key
        ),
        '[]'::jsonb
      )
      from rollups rollup
      left join public.profiles profile
        on profile.id = rollup.analytics_user_key
      left join public.organizations organization
        on organization.id = rollup.analytics_organization_key
      left join ranked_routes ranked_route
        on ranked_route.analytics_user_key = rollup.analytics_user_key
       and ranked_route.analytics_organization_key is not distinct from rollup.analytics_organization_key
       and ranked_route.access_type = rollup.access_type
       and ranked_route.access_role is not distinct from rollup.access_role
       and ranked_route.route_rank = 1
      left join ranked_geography ranked_location
        on ranked_location.analytics_user_key = rollup.analytics_user_key
       and ranked_location.analytics_organization_key is not distinct from rollup.analytics_organization_key
       and ranked_location.access_type = rollup.access_type
       and ranked_location.access_role is not distinct from rollup.access_role
       and ranked_location.geography_rank = 1
    )
  )
  into result
  from filtered;

  return result;
end;
$$;

revoke all on function public.get_platform_authenticated_access_analytics(
  timestamptz,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.get_platform_authenticated_access_analytics(
  timestamptz,
  timestamptz
) to authenticated;

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
  text
) is
  'Service-role-only bounded page-view ingestion with server-rounded approximate Vercel network geography. Stores no raw IP address.';
comment on function public.get_platform_analytics_before_trusted_baseline(
  timestamptz,
  timestamptz
) is
  'Internal Platform Analytics aggregate with postal and coarse network-coordinate Geography grouping. Direct application execution is revoked; the public wrapper enforces the trusted-data baseline.';
comment on function public.get_platform_authenticated_access_analytics(
  timestamptz,
  timestamptz
) is
  'SUPER_ADMIN-only aggregate authenticated-access analytics clamped to the immutable trusted-data baseline, with approximate network geography and no raw IP or session identifiers.';

notify pgrst, 'reload schema';

commit;
