begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- This singleton is stamped once, by the database, when the attribution
-- upgrade is applied. Aggregate RPCs clamp every requested range to it while
-- older page views remain preserved as durable history.
create table public.platform_analytics_trusted_baseline (
  singleton boolean primary key default true
    check (singleton = true),
  trusted_data_started_at timestamptz not null
    default pg_catalog.clock_timestamp()
);

alter table public.platform_analytics_trusted_baseline
  enable row level security;

revoke all on table public.platform_analytics_trusted_baseline
  from public, anon, authenticated, service_role;

insert into public.platform_analytics_trusted_baseline (singleton)
values (true);

create function public.guard_platform_analytics_trusted_baseline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'platform analytics trusted baseline is immutable'
    using errcode = '23514';
end;
$$;

create trigger platform_analytics_trusted_baseline_immutable
before update or delete
on public.platform_analytics_trusted_baseline
for each row
execute function public.guard_platform_analytics_trusted_baseline();

revoke all on function public.guard_platform_analytics_trusted_baseline()
  from public, anon, authenticated;

-- These nullable snapshots describe the authenticated access context at write
-- time. Historical rows remain null because their former role/category cannot
-- be reconstructed safely after the fact.
alter table public.analytics_page_views
  add column analytics_access_type text,
  add column analytics_access_role text,
  add constraint analytics_page_views_access_type_check
    check (
      analytics_access_type is null
      or analytics_access_type in (
        'PUBLIC',
        'INTERNAL',
        'CUSTOMER_PORTAL',
        'AUTHENTICATED_UNCLASSIFIED'
      )
    ),
  add constraint analytics_page_views_access_context_check
    check (
      analytics_access_type is null
      or (
        analytics_access_type = 'PUBLIC'
        and analytics_user_key is null
        and analytics_access_role is null
      )
      or (
        analytics_access_type = 'INTERNAL'
        and analytics_user_key is not null
      )
      or (
        analytics_access_type = 'CUSTOMER_PORTAL'
        and analytics_user_key is not null
        and analytics_access_role = 'CUSTOMER_PORTAL'
      )
      or (
        analytics_access_type = 'AUTHENTICATED_UNCLASSIFIED'
        and analytics_user_key is not null
        and analytics_access_role is null
      )
    );

drop trigger analytics_page_views_attribution_keys_immutable
  on public.analytics_page_views;

create or replace function public.guard_analytics_page_view_attribution_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.analytics_user_key is distinct from old.analytics_user_key
     or new.analytics_organization_key is distinct from old.analytics_organization_key
     or new.analytics_access_type is distinct from old.analytics_access_type
     or new.analytics_access_role is distinct from old.analytics_access_role then
    raise exception 'analytics attribution snapshots are immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger analytics_page_views_attribution_keys_immutable
before update of
  analytics_user_key,
  analytics_organization_key,
  analytics_access_type,
  analytics_access_role
on public.analytics_page_views
for each row
execute function public.guard_analytics_page_view_attribution_keys();

revoke all on function public.guard_analytics_page_view_attribution_keys()
  from public, anon, authenticated;

-- Resolve only the caller's current, effective identity. Cookie selections are
-- hints, never authority: each selected UUID must still belong to auth.uid().
create function public.get_my_analytics_identity_context(
  target_organization_id uuid,
  target_portal_access_id uuid
)
returns table (
  access_type text,
  access_role text,
  organization_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  internal_count integer := 0;
  internal_organization_id uuid;
  internal_role text;
  portal_count integer := 0;
  portal_organization_id uuid;
begin
  if actor_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select
    count(*)::integer,
    (
      array_agg(
        member.organization_id
        order by
          (member.organization_id = target_organization_id) desc,
          member.updated_at desc,
          member.id
      )
    )[1],
    (
      array_agg(
        member.role::text
        order by
          (member.organization_id = target_organization_id) desc,
          member.updated_at desc,
          member.id
      )
    )[1]
  into internal_count, internal_organization_id, internal_role
  from public.organization_members member
  join public.organizations organization
    on organization.id = member.organization_id
  where member.user_id = actor_id
    and member.is_active = true
    and member.status = 'ACTIVE'
    and organization.status = 'ACTIVE';

  if internal_count > 0 then
    if target_organization_id is null and internal_count > 1 then
      internal_organization_id := null;
      internal_role := null;
    elsif target_organization_id is not null and not exists (
      select 1
      from public.organization_members selected_member
      join public.organizations selected_organization
        on selected_organization.id = selected_member.organization_id
      where selected_member.user_id = actor_id
        and selected_member.organization_id = target_organization_id
        and selected_member.is_active = true
        and selected_member.status = 'ACTIVE'
        and selected_organization.status = 'ACTIVE'
    ) then
      internal_organization_id := null;
      internal_role := null;
    end if;

    return query
    select 'INTERNAL'::text, internal_role, internal_organization_id;
    return;
  end if;

  select
    count(*)::integer,
    (
      array_agg(
        portal_user.organization_id
        order by
          (portal_user.id = target_portal_access_id) desc,
          portal_user.updated_at desc,
          portal_user.id
      )
    )[1]
  into portal_count, portal_organization_id
  from public.customer_portal_users portal_user
  where portal_user.user_id = actor_id
    and public.is_customer_portal_user(
      portal_user.organization_id,
      portal_user.customer_id,
      actor_id
    );

  if portal_count > 0 then
    if target_portal_access_id is null and portal_count > 1 then
      portal_organization_id := null;
    elsif target_portal_access_id is not null and not exists (
      select 1
      from public.customer_portal_users selected_portal_user
      where selected_portal_user.id = target_portal_access_id
        and selected_portal_user.user_id = actor_id
        and public.is_customer_portal_user(
          selected_portal_user.organization_id,
          selected_portal_user.customer_id,
          actor_id
        )
    ) then
      portal_organization_id := null;
    end if;

    return query
    select
      'CUSTOMER_PORTAL'::text,
      'CUSTOMER_PORTAL'::text,
      portal_organization_id;
    return;
  end if;

  return query
  select
    'AUTHENTICATED_UNCLASSIFIED'::text,
    null::text,
    null::uuid;
end;
$$;

revoke all on function public.get_my_analytics_identity_context(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_analytics_identity_context(uuid, uuid)
  to authenticated;

-- Keep the previous 15-argument guarded ingestion function intact so applying
-- this migration before the application deployment does not interrupt writes.
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
    text,
    text,
    text
  )
  from public, anon, authenticated;
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
    text,
    text,
    text
  )
  to service_role;

-- Preserve the existing aggregation implementation behind a non-callable
-- internal name, then keep its public signature as a baseline-clamping
-- wrapper. This avoids duplicating or changing the established KPI, Top Pages,
-- Geography, session, user, and organization aggregation semantics.
alter function public.get_platform_analytics(timestamptz, timestamptz)
  rename to get_platform_analytics_before_trusted_baseline;

revoke all on function public.get_platform_analytics_before_trusted_baseline(
  timestamptz,
  timestamptz
) from public, anon, authenticated;

create function public.get_platform_analytics(
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

  -- A valid requested range can end before the trusted baseline. Return the
  -- same empty aggregate shape instead of treating that as an invalid range.
  if target_end_exclusive is not null
     and target_end_exclusive <= effective_start then
    return jsonb_build_object(
      'trustedDataStartedAt', trusted_start,
      'pageViews', 0,
      'sessions', 0,
      'users', 0,
      'organizations', 0,
      'trafficDays', '[]'::jsonb,
      'deviceBreakdown', '[]'::jsonb,
      'browserBreakdown', '[]'::jsonb,
      'operatingSystemBreakdown', '[]'::jsonb,
      'trafficTypeBreakdown', '[]'::jsonb,
      'topPages', '[]'::jsonb,
      'geography', '[]'::jsonb
    );
  end if;

  result := public.get_platform_analytics_before_trusted_baseline(
    effective_start,
    target_end_exclusive
  );

  return result || jsonb_build_object(
    'trustedDataStartedAt', trusted_start
  );
end;
$$;

revoke all on function public.get_platform_analytics(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_platform_analytics(timestamptz, timestamptz)
  to authenticated;

create function public.get_platform_authenticated_access_analytics(
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
            nullif(trim(city), ''),
            nullif(trim(region_code), ''),
            nullif(trim(country_code), '')
          ),
          ''
        ),
        'Unknown'
      ) as geography,
      count(*) as page_views
    from authenticated
    group by
      analytics_user_key,
      analytics_organization_key,
      access_type,
      access_role,
      geography
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

comment on function public.get_my_analytics_identity_context(uuid, uuid) is
  'Returns only the authenticated caller own effective analytics access category, role, and selected organization.';
comment on function public.get_platform_analytics_before_trusted_baseline(timestamptz, timestamptz) is
  'Internal preserved Platform Analytics implementation. Direct application execution is revoked; the public wrapper enforces the trusted-data baseline.';
comment on function public.get_platform_analytics(timestamptz, timestamptz) is
  'SUPER_ADMIN-only Platform Analytics aggregation clamped to the immutable trusted-data baseline.';
comment on function public.get_platform_authenticated_access_analytics(timestamptz, timestamptz) is
  'SUPER_ADMIN-only aggregate authenticated-access analytics clamped to the immutable trusted-data baseline. Returns no raw IP addresses or session identifiers.';

notify pgrst, 'reload schema';

commit;
