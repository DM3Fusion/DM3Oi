begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Historical Platform Analytics rows intentionally survive identity deletion.
-- When the retained analytics UUID no longer resolves to a live profile,
-- describe that state explicitly as a deleted account. The analytics identity
-- key, activity history, aggregate geography, and Account <UUID prefix>
-- identifier remain unchanged.

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
      count(distinct normalized_path) as unique_pages,
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
      count(*) as page_views,
      count(distinct session_id) as visits,
      max(created_at) as last_activity
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
      count(*) as page_views,
      count(distinct session_id) as visits,
      max(created_at) as last_activity
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
      page_views,
      visits,
      last_activity
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
      'internalVisits',
        count(distinct session_id)
          filter (where access_type = 'INTERNAL'),
      'internalUniquePages',
        count(distinct normalized_path)
          filter (where access_type = 'INTERNAL'),
      'internalPageViews',
        count(*) filter (where access_type = 'INTERNAL'),

      'customerPortalVisits',
        count(distinct session_id)
          filter (where access_type = 'CUSTOMER_PORTAL'),
      'customerPortalUniquePages',
        count(distinct normalized_path)
          filter (where access_type = 'CUSTOMER_PORTAL'),
      'customerPortalPageViews',
        count(*) filter (where access_type = 'CUSTOMER_PORTAL'),

      'unclassifiedAuthenticatedVisits',
        count(distinct session_id) filter (
          where access_type in (
            'AUTHENTICATED_UNCLASSIFIED',
            'AUTHENTICATED_HISTORICAL'
          )
        ),
      'unclassifiedAuthenticatedUniquePages',
        count(distinct normalized_path) filter (
          where access_type in (
            'AUTHENTICATED_UNCLASSIFIED',
            'AUTHENTICATED_HISTORICAL'
          )
        ),
      'unclassifiedAuthenticatedPageViews',
        count(*) filter (
          where access_type in (
            'AUTHENTICATED_UNCLASSIFIED',
            'AUTHENTICATED_HISTORICAL'
          )
        ),

      'publicVisits',
        count(distinct session_id)
          filter (where access_type = 'PUBLIC'),
      'publicUniquePages',
        count(distinct normalized_path)
          filter (where access_type = 'PUBLIC'),
      'publicPageViews',
        count(*) filter (where access_type = 'PUBLIC')
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
              'Deleted Account'
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
            'uniquePages', rollup.unique_pages,
            'lastActivity', rollup.last_activity,
            'topRoute', ranked_route.normalized_path,
            'geography', ranked_location.geography,
            'locations', (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'location', location.geography,
                    'visits', location.visits,
                    'pageViews', location.page_views,
                    'lastActivity', location.last_activity
                  )
                  order by
                    location.visits desc,
                    location.page_views desc,
                    location.last_activity desc,
                    location.geography
                ),
                '[]'::jsonb
              )
              from geography_counts location
              where location.analytics_user_key =
                    rollup.analytics_user_key
                and location.analytics_organization_key
                    is not distinct from
                    rollup.analytics_organization_key
                and location.access_type =
                    rollup.access_type
                and location.access_role
                    is not distinct from
                    rollup.access_role
            ),
            'activity', (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'path', route.normalized_path,
                    'visits', route.visits,
                    'pageViews', route.page_views,
                    'lastActivity', route.last_activity
                  )
                  order by
                    route.page_views desc,
                    route.last_activity desc,
                    route.normalized_path
                ),
                '[]'::jsonb
              )
              from route_counts route
              where route.analytics_user_key =
                    rollup.analytics_user_key
                and route.analytics_organization_key
                    is not distinct from
                    rollup.analytics_organization_key
                and route.access_type =
                    rollup.access_type
                and route.access_role
                    is not distinct from
                    rollup.access_role
            )
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

alter function public.get_platform_authenticated_access_analytics(
  timestamptz,
  timestamptz
)
owner to postgres;

revoke all
on function public.get_platform_authenticated_access_analytics(
  timestamptz,
  timestamptz
)
from public, anon, authenticated;

grant execute
on function public.get_platform_authenticated_access_analytics(
  timestamptz,
  timestamptz
)
to authenticated;

comment on function public.get_platform_authenticated_access_analytics(
  timestamptz,
  timestamptz
) is
  'SUPER_ADMIN-only aggregate authenticated-access analytics. Deleted identities retain historical aggregate activity and are labeled Deleted Account without restoring or fabricating identity data.';

notify pgrst, 'reload schema';

commit;
