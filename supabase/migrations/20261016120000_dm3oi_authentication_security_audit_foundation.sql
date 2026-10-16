begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Phase 02A creates an additive authentication-security foundation. Existing
-- authentication_events, session-policy, analytics data, and analytics
-- function definitions remain unchanged. Application integration is
-- intentionally deferred.

-- The deployed guarded analytics-ingestion overloads are postgres-owned
-- SECURITY DEFINER functions, so service_role callers retain RPC ingestion
-- while no longer holding direct table-insert authority. Table owners and
-- superusers remain privileged PostgreSQL bypass paths and must not write
-- outside the guarded ingestion contract.
revoke insert
on table public.analytics_page_views
from service_role;

create table public.authentication_security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (
      event_type in (
        'AUTHENTICATION_SUCCESS',
        'AUTHENTICATION_FAILURE',
        'EXPLICIT_SIGN_OUT',
        'INACTIVITY_EXPIRATION',
        'ABSOLUTE_SESSION_EXPIRATION',
        'ADMINISTRATIVE_REVOCATION'
      )
    ),
  occurred_at timestamptz not null,
  user_id uuid,
  authentication_method text not null
    check (
      authentication_method in (
        'EMAIL_OTP',
        'MAGIC_LINK',
        'INVITATION',
        'SESSION',
        'ADMINISTRATIVE'
      )
    ),
  authentication_outcome text not null
    check (
      authentication_outcome in (
        'SUCCEEDED',
        'FAILED',
        'TERMINATED',
        'REVOKED'
      )
    ),
  authentication_session_id uuid,
  access_category text
    check (
      access_category is null
      or access_category in (
        'INTERNAL',
        'CUSTOMER_PORTAL',
        'AUTHENTICATED_UNCLASSIFIED'
      )
    ),
  organization_id uuid,
  application_role text
    check (
      application_role is null
      or application_role in (
        'SUPER_ADMIN',
        'BUSINESS_OWNER',
        'BUSINESS_ADMIN',
        'STAFF_MANAGER',
        'STAFF_USER',
        'CUSTOMER_PORTAL'
      )
    ),
  event_source text not null
    check (
      char_length(event_source) between 1 and 64
      and event_source = trim(event_source)
      and event_source ~ '^[A-Z][A-Z0-9_]*$'
    ),
  event_schema_version smallint not null default 1
    check (event_schema_version = 1),
  retention_eligible_at timestamptz not null,

  constraint authentication_security_event_outcome_check
    check (
      (event_type = 'AUTHENTICATION_SUCCESS'
        and authentication_outcome = 'SUCCEEDED')
      or (event_type = 'AUTHENTICATION_FAILURE'
        and authentication_outcome = 'FAILED')
      or (event_type in (
          'EXPLICIT_SIGN_OUT',
          'INACTIVITY_EXPIRATION',
          'ABSOLUTE_SESSION_EXPIRATION'
        ) and authentication_outcome = 'TERMINATED')
      or (event_type = 'ADMINISTRATIVE_REVOCATION'
        and authentication_outcome = 'REVOKED')
    ),
  constraint authentication_security_event_method_check
    check (
      (event_type in ('AUTHENTICATION_SUCCESS', 'AUTHENTICATION_FAILURE')
        and authentication_method in ('EMAIL_OTP', 'MAGIC_LINK', 'INVITATION'))
      or (event_type in (
          'EXPLICIT_SIGN_OUT',
          'INACTIVITY_EXPIRATION',
          'ABSOLUTE_SESSION_EXPIRATION'
        ) and authentication_method = 'SESSION')
      or (event_type = 'ADMINISTRATIVE_REVOCATION'
        and authentication_method = 'ADMINISTRATIVE')
    ),
  constraint authentication_security_event_user_evidence_check
    check (
      event_type = 'AUTHENTICATION_FAILURE'
      or user_id is not null
    ),
  constraint authentication_security_event_session_evidence_check
    check (
      event_type in ('AUTHENTICATION_FAILURE', 'ADMINISTRATIVE_REVOCATION')
      or authentication_session_id is not null
    ),
  constraint authentication_security_failure_anonymous_check
    check (
      event_type <> 'AUTHENTICATION_FAILURE'
      or (
        user_id is null
        and authentication_session_id is null
        and access_category is null
        and organization_id is null
        and application_role is null
      )
    ),
  constraint authentication_security_access_shape_check
    check (
      (access_category is null
        and organization_id is null
        and application_role is null)
      or (access_category = 'AUTHENTICATED_UNCLASSIFIED'
        and organization_id is null
        and application_role is null)
      or (access_category = 'INTERNAL'
        and application_role in (
          'SUPER_ADMIN',
          'BUSINESS_OWNER',
          'BUSINESS_ADMIN',
          'STAFF_MANAGER',
          'STAFF_USER'
        )
        and (
          (application_role = 'SUPER_ADMIN' and organization_id is null)
          or (application_role <> 'SUPER_ADMIN' and organization_id is not null)
        ))
      or (access_category = 'CUSTOMER_PORTAL'
        and organization_id is not null
        and application_role = 'CUSTOMER_PORTAL')
    ),
  constraint authentication_security_event_retention_check
    check (retention_eligible_at = occurred_at + interval '365 days')
);

comment on table public.authentication_security_events is
  'Append-only authentication lifecycle evidence. User, organization, and Supabase session UUIDs intentionally have no cascading foreign keys so identity cleanup cannot erase forensic history.';
comment on column public.authentication_security_events.authentication_session_id is
  'Verified Supabase authentication session UUID captured by trusted server context; never a token, cookie, or authorization header.';
comment on column public.authentication_security_events.retention_eligible_at is
  'Manual retention eligibility boundary. Phase 02A creates no automatic cleanup job.';

create index authentication_security_events_time_idx
on public.authentication_security_events (occurred_at desc, id desc);

create index authentication_security_events_user_time_idx
on public.authentication_security_events (user_id, occurred_at desc, id desc)
where user_id is not null;

create index authentication_security_events_type_time_idx
on public.authentication_security_events (event_type, occurred_at desc, id desc);

create index authentication_security_events_session_time_idx
on public.authentication_security_events (
  authentication_session_id,
  occurred_at desc,
  id desc
)
where authentication_session_id is not null;

create index authentication_security_events_retention_idx
on public.authentication_security_events (retention_eligible_at, id);

create table public.authentication_security_event_details (
  security_event_id uuid primary key
    references public.authentication_security_events(id) on delete restrict,
  network_location_type text not null
    default 'AUTHENTICATION_NETWORK_LOCATION'
    check (network_location_type = 'AUTHENTICATION_NETWORK_LOCATION'),
  country_code text
    check (
      country_code is null
      or (
        char_length(country_code) between 1 and 8
        and country_code = trim(country_code)
      )
    ),
  region_code text
    check (
      region_code is null
      or (
        char_length(region_code) between 1 and 100
        and region_code = trim(region_code)
      )
    ),
  city text
    check (
      city is null
      or (
        char_length(city) between 1 and 200
        and city = trim(city)
      )
    ),
  postal_code text
    check (
      postal_code is null
      or (
        char_length(postal_code) between 1 and 32
        and postal_code = trim(postal_code)
      )
    ),
  network_latitude numeric(4, 2)
    check (
      network_latitude is null
      or network_latitude between -90.00 and 90.00
    ),
  network_longitude numeric(5, 2)
    check (
      network_longitude is null
      or network_longitude between -180.00 and 180.00
    ),
  device_category text
    check (
      device_category is null
      or device_category in ('DESKTOP', 'TABLET', 'MOBILE', 'OTHER')
    ),
  browser text
    check (
      browser is null
      or (
        char_length(browser) between 1 and 100
        and browser = trim(browser)
      )
    ),
  operating_system text
    check (
      operating_system is null
      or (
        char_length(operating_system) between 1 and 100
        and operating_system = trim(operating_system)
      )
    ),
  recorded_at timestamptz not null,
  retention_eligible_at timestamptz not null,

  constraint authentication_security_detail_retention_check
    check (retention_eligible_at = recorded_at + interval '90 days')
);

comment on table public.authentication_security_event_details is
  'Separately retained 90-day authentication network/device context. AUTHENTICATION_NETWORK_LOCATION is approximate Vercel request metadata, not GPS, physical-location proof, or analytics page-view geography.';
comment on column public.authentication_security_event_details.network_latitude is
  'Approximate authentication-request network latitude rounded to two decimals; not GPS or verified physical location.';
comment on column public.authentication_security_event_details.network_longitude is
  'Approximate authentication-request network longitude rounded to two decimals; not GPS or verified physical location.';

create index authentication_security_event_details_retention_idx
on public.authentication_security_event_details (retention_eligible_at, security_event_id);

create table public.authentication_session_correlations (
  id uuid primary key default gen_random_uuid(),
  security_event_id uuid not null
    references public.authentication_security_events(id) on delete restrict,
  user_id uuid not null,
  authentication_session_id uuid not null,
  analytics_session_id uuid not null,
  analytics_identity_first_seen_at timestamptz not null,
  analytics_identity_last_seen_at timestamptz not null,
  analytics_authenticated_page_views bigint not null
    check (analytics_authenticated_page_views > 0),
  created_at timestamptz not null,
  retention_eligible_at timestamptz not null,

  constraint authentication_session_correlation_unique
    unique (security_event_id, analytics_session_id),
  constraint authentication_session_correlation_identity_window_check
    check (
      analytics_identity_last_seen_at >= analytics_identity_first_seen_at
    ),
  constraint authentication_session_correlation_verified_before_created_check
    check (analytics_identity_last_seen_at <= created_at),
  constraint authentication_session_correlation_retention_check
    check (retention_eligible_at = created_at + interval '365 days')
);

comment on table public.authentication_session_correlations is
  'Trusted many-to-many correlation between one immutable security event, its verified Supabase authentication session, and a server-read HttpOnly analytics-session UUID. Correlation requires exactly one matching durable authenticated analytics identity. Public rows remain unattributed, ambiguous sessions fail closed, and no historical links are inferred from timestamps.';
comment on column public.authentication_session_correlations.authentication_session_id is
  'Verified Supabase auth.sessions UUID, deliberately retained without a cascading foreign key.';
comment on column public.authentication_session_correlations.analytics_session_id is
  'Server-read HttpOnly analytics-session UUID; never accepted from browser JSON.';
comment on column public.authentication_session_correlations.analytics_identity_first_seen_at is
  'Earliest durable authenticated page view for the verified identity at correlation time; public page views are not attributed by this boundary.';
comment on column public.authentication_session_correlations.analytics_identity_last_seen_at is
  'Latest durable authenticated page view for the verified identity at correlation time; this is an immutable evidence snapshot, not session ownership.';

create index authentication_session_correlations_auth_session_idx
on public.authentication_session_correlations (
  authentication_session_id,
  created_at desc,
  id desc
);

create index authentication_session_correlations_event_idx
on public.authentication_session_correlations (
  security_event_id,
  created_at desc,
  id desc
);

create index authentication_session_correlations_user_idx
on public.authentication_session_correlations (user_id, created_at desc, id desc);

create index authentication_session_correlations_analytics_idx
on public.authentication_session_correlations (
  analytics_session_id,
  created_at desc,
  id desc
);

create index authentication_session_correlations_retention_idx
on public.authentication_session_correlations (retention_eligible_at, id);

alter table public.authentication_security_events enable row level security;
alter table public.authentication_security_event_details enable row level security;
alter table public.authentication_session_correlations enable row level security;

revoke all on table public.authentication_security_events
from public, anon, authenticated, service_role;
revoke all on table public.authentication_security_event_details
from public, anon, authenticated, service_role;
revoke all on table public.authentication_session_correlations
from public, anon, authenticated, service_role;

create function public.guard_authentication_security_audit_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and auth.role() is not distinct from 'service_role'
     and current_setting(
       'dm3oi.authentication_security_retention_cleanup',
       true
     ) = 'enabled' then
    return old;
  end if;

  raise exception 'authentication security audit records are immutable'
    using errcode = '42501';
end;
$$;

alter function public.guard_authentication_security_audit_immutability()
  owner to postgres;
revoke all on function public.guard_authentication_security_audit_immutability()
from public, anon, authenticated, service_role;

create trigger authentication_security_events_immutable
before update or delete
on public.authentication_security_events
for each row
execute function public.guard_authentication_security_audit_immutability();

create trigger authentication_security_event_details_immutable
before update or delete
on public.authentication_security_event_details
for each row
execute function public.guard_authentication_security_audit_immutability();

create trigger authentication_session_correlations_immutable
before update or delete
on public.authentication_session_correlations
for each row
execute function public.guard_authentication_security_audit_immutability();

create function public.correlate_authentication_analytics_session(
  target_security_event_id uuid,
  target_user_id uuid,
  target_authentication_session_id uuid,
  target_analytics_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  correlation_id uuid;
  correlation_time timestamptz;
  authenticated_identity_count integer;
  matching_identity_page_views bigint;
  identity_first_seen_at timestamptz;
  identity_last_seen_at timestamptz;
  attribution_is_inconsistent boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_security_event_id is null
     or target_user_id is null
     or target_authentication_session_id is null
     or target_analytics_session_id is null then
    raise exception 'security event evidence is invalid' using errcode = '22023';
  end if;

  -- Lock ordering contract shared with source-managed analytics ingestion:
  -- 1. global analytics admission lock; 2. per-analytics-session lock.
  -- Both are transaction scoped, and no participating writer may acquire them
  -- in reverse order. The established guarded ingestion RPC takes only the
  -- global lock. Direct service_role INSERT is revoked by this migration;
  -- table owners and superusers can still bypass ordinary table privileges and
  -- must honor this lock contract operationally.
  perform pg_catalog.pg_advisory_xact_lock(143690001);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dm3oi:authentication-analytics:' || target_analytics_session_id::text,
      0
    )
  );

  perform 1
  from public.authentication_security_events security_event
  where security_event.id = target_security_event_id
    and security_event.user_id = target_user_id
    and security_event.authentication_session_id =
      target_authentication_session_id;

  if not found then
    raise exception 'security event evidence is invalid' using errcode = '22023';
  end if;

  perform 1
  from auth.sessions authentication_session
  where authentication_session.id = target_authentication_session_id
    and authentication_session.user_id = target_user_id;

  if not found then
    raise exception 'security event evidence is invalid' using errcode = '22023';
  end if;

  select
    count(distinct page_view.analytics_user_key)::integer,
    count(*) filter (
      where page_view.analytics_user_key = target_user_id
    ),
    min(page_view.created_at) filter (
      where page_view.analytics_user_key = target_user_id
    ),
    max(page_view.created_at) filter (
      where page_view.analytics_user_key = target_user_id
    ),
    coalesce(
      bool_or(
        page_view.user_id is not null
        and page_view.analytics_user_key is distinct from page_view.user_id
      ),
      false
    )
  into
    authenticated_identity_count,
    matching_identity_page_views,
    identity_first_seen_at,
    identity_last_seen_at,
    attribution_is_inconsistent
  from public.analytics_page_views page_view
  where page_view.session_id = target_analytics_session_id;

  -- Missing and public-only sessions provide no authenticated ownership
  -- evidence. More than one durable identity is ambiguous because the current
  -- analytics cookie survives sign-out. Public rows may coexist with one
  -- authenticated identity, but remain public and are never reattributed.
  if attribution_is_inconsistent
     or authenticated_identity_count <> 1
     or matching_identity_page_views < 1
     or identity_first_seen_at is null
     or identity_last_seen_at is null then
    raise exception 'analytics session identity is ambiguous'
      using errcode = '22023';
  end if;

  perform 1
  from public.authentication_session_correlations correlation
  where correlation.analytics_session_id = target_analytics_session_id
    and correlation.user_id <> target_user_id;

  if found then
    raise exception 'analytics session identity is ambiguous'
      using errcode = '22023';
  end if;

  -- Capture the execution-time verification boundary only after all durable
  -- identity and conflicting-correlation evidence has been checked under both
  -- locks. Future-dated evidence cannot be represented as already verified.
  correlation_time := pg_catalog.clock_timestamp();

  if identity_last_seen_at > correlation_time then
    raise exception 'analytics session identity evidence is invalid'
      using errcode = '22023';
  end if;

  insert into public.authentication_session_correlations (
    security_event_id,
    user_id,
    authentication_session_id,
    analytics_session_id,
    analytics_identity_first_seen_at,
    analytics_identity_last_seen_at,
    analytics_authenticated_page_views,
    created_at,
    retention_eligible_at
  )
  values (
    target_security_event_id,
    target_user_id,
    target_authentication_session_id,
    target_analytics_session_id,
    identity_first_seen_at,
    identity_last_seen_at,
    matching_identity_page_views,
    correlation_time,
    correlation_time + interval '365 days'
  )
  on conflict (security_event_id, analytics_session_id) do nothing
  returning id into correlation_id;

  if correlation_id is null then
    select correlation.id
    into correlation_id
    from public.authentication_session_correlations correlation
    where correlation.security_event_id = target_security_event_id
      and correlation.analytics_session_id = target_analytics_session_id
      and correlation.user_id = target_user_id
      and correlation.authentication_session_id =
        target_authentication_session_id;
  end if;

  if correlation_id is null then
    raise exception 'security event evidence is invalid' using errcode = '22023';
  end if;

  return correlation_id;
end;
$$;

alter function public.correlate_authentication_analytics_session(
  uuid,
  uuid,
  uuid,
  uuid
) owner to postgres;
revoke all on function public.correlate_authentication_analytics_session(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.correlate_authentication_analytics_session(
  uuid,
  uuid,
  uuid,
  uuid
) to service_role;

create function public.record_authentication_security_event(
  target_event_type text,
  target_user_id uuid,
  target_authentication_method text,
  target_authentication_session_id uuid,
  target_access_category text,
  target_organization_id uuid,
  target_application_role text,
  target_country_code text,
  target_region_code text,
  target_city text,
  target_postal_code text,
  target_network_latitude numeric,
  target_network_longitude numeric,
  target_device_category text,
  target_browser text,
  target_operating_system text,
  target_event_source text,
  target_analytics_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
  event_time timestamptz := pg_catalog.clock_timestamp();
  event_outcome text;
  normalized_country_code text := nullif(upper(trim(target_country_code)), '');
  normalized_region_code text := nullif(trim(target_region_code), '');
  normalized_city text := nullif(trim(target_city), '');
  normalized_postal_code text := nullif(trim(target_postal_code), '');
  normalized_browser text := nullif(trim(target_browser), '');
  normalized_operating_system text := nullif(trim(target_operating_system), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  event_outcome := case target_event_type
    when 'AUTHENTICATION_SUCCESS' then 'SUCCEEDED'
    when 'AUTHENTICATION_FAILURE' then 'FAILED'
    when 'EXPLICIT_SIGN_OUT' then 'TERMINATED'
    when 'INACTIVITY_EXPIRATION' then 'TERMINATED'
    when 'ABSOLUTE_SESSION_EXPIRATION' then 'TERMINATED'
    when 'ADMINISTRATIVE_REVOCATION' then 'REVOKED'
    else null
  end;

  if event_outcome is null
     or target_authentication_method is null
     or target_event_source is null then
    raise exception 'security event evidence is invalid' using errcode = '22023';
  end if;

  if target_event_type = 'AUTHENTICATION_FAILURE' then
    if target_user_id is not null
       or target_authentication_session_id is not null
       or target_access_category is not null
       or target_organization_id is not null
       or target_application_role is not null
       or target_analytics_session_id is not null then
      raise exception 'security event evidence is invalid' using errcode = '22023';
    end if;
  elsif target_user_id is null then
    raise exception 'security event evidence is invalid' using errcode = '22023';
  end if;

  if target_event_type in (
       'AUTHENTICATION_SUCCESS',
       'EXPLICIT_SIGN_OUT',
       'INACTIVITY_EXPIRATION',
       'ABSOLUTE_SESSION_EXPIRATION'
     )
     and target_authentication_session_id is null then
    raise exception 'security event evidence is invalid' using errcode = '22023';
  end if;

  if target_authentication_session_id is not null then
    perform 1
    from auth.sessions authentication_session
    where authentication_session.id = target_authentication_session_id
      and authentication_session.user_id = target_user_id;

    if not found then
      raise exception 'security event evidence is invalid' using errcode = '22023';
    end if;
  elsif target_user_id is not null then
    perform 1
    from auth.users authenticated_user
    where authenticated_user.id = target_user_id;

    if not found then
      raise exception 'security event evidence is invalid' using errcode = '22023';
    end if;
  end if;

  if target_analytics_session_id is not null
     and target_authentication_session_id is null then
    raise exception 'security event evidence is invalid' using errcode = '22023';
  end if;

  insert into public.authentication_security_events (
    event_type,
    occurred_at,
    user_id,
    authentication_method,
    authentication_outcome,
    authentication_session_id,
    access_category,
    organization_id,
    application_role,
    event_source,
    event_schema_version,
    retention_eligible_at
  )
  values (
    target_event_type,
    event_time,
    target_user_id,
    target_authentication_method,
    event_outcome,
    target_authentication_session_id,
    target_access_category,
    target_organization_id,
    target_application_role,
    trim(target_event_source),
    1,
    event_time + interval '365 days'
  )
  returning id into event_id;

  if normalized_country_code is not null
     or normalized_region_code is not null
     or normalized_city is not null
     or normalized_postal_code is not null
     or target_network_latitude is not null
     or target_network_longitude is not null
     or target_device_category is not null
     or normalized_browser is not null
     or normalized_operating_system is not null then
    insert into public.authentication_security_event_details (
      security_event_id,
      network_location_type,
      country_code,
      region_code,
      city,
      postal_code,
      network_latitude,
      network_longitude,
      device_category,
      browser,
      operating_system,
      recorded_at,
      retention_eligible_at
    )
    values (
      event_id,
      'AUTHENTICATION_NETWORK_LOCATION',
      normalized_country_code,
      normalized_region_code,
      normalized_city,
      normalized_postal_code,
      case
        when target_network_latitude is null then null
        else round(target_network_latitude, 2)
      end,
      case
        when target_network_longitude is null then null
        else round(target_network_longitude, 2)
      end,
      target_device_category,
      normalized_browser,
      normalized_operating_system,
      event_time,
      event_time + interval '90 days'
    );
  end if;

  if target_analytics_session_id is not null then
    perform public.correlate_authentication_analytics_session(
      event_id,
      target_user_id,
      target_authentication_session_id,
      target_analytics_session_id
    );
  end if;

  return event_id;
end;
$$;

alter function public.record_authentication_security_event(
  text,
  uuid,
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  uuid
) owner to postgres;
revoke all on function public.record_authentication_security_event(
  text,
  uuid,
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.record_authentication_security_event(
  text,
  uuid,
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  uuid
) to service_role;

create function public.get_platform_authentication_security_events(
  target_start timestamptz default null,
  target_end_exclusive timestamptz default null,
  target_user_id uuid default null,
  target_event_type text default null,
  target_limit integer default 100,
  target_before_occurred_at timestamptz default null,
  target_before_event_id uuid default null
)
returns table (
  event_id uuid,
  event_type text,
  event_timestamp timestamptz,
  user_id uuid,
  authentication_method text,
  authentication_outcome text,
  access_category text,
  organization_id uuid,
  application_role text,
  country_code text,
  region_code text,
  city text,
  postal_code text,
  network_latitude numeric,
  network_longitude numeric,
  network_location_type text,
  device_category text,
  browser text,
  operating_system text,
  event_source text,
  event_schema_version smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_limit is null or target_limit < 1 or target_limit > 200
     or (target_start is not null
       and target_end_exclusive is not null
       and target_end_exclusive <= target_start)
     or ((target_before_occurred_at is null)
       <> (target_before_event_id is null))
     or (target_event_type is not null and target_event_type not in (
       'AUTHENTICATION_SUCCESS',
       'AUTHENTICATION_FAILURE',
       'EXPLICIT_SIGN_OUT',
       'INACTIVITY_EXPIRATION',
       'ABSOLUTE_SESSION_EXPIRATION',
       'ADMINISTRATIVE_REVOCATION'
     )) then
    raise exception 'invalid security audit query' using errcode = '22023';
  end if;

  return query
  select
    security_event.id,
    security_event.event_type,
    security_event.occurred_at,
    security_event.user_id,
    security_event.authentication_method,
    security_event.authentication_outcome,
    security_event.access_category,
    security_event.organization_id,
    security_event.application_role,
    detail.country_code,
    detail.region_code,
    detail.city,
    detail.postal_code,
    detail.network_latitude,
    detail.network_longitude,
    detail.network_location_type,
    detail.device_category,
    detail.browser,
    detail.operating_system,
    security_event.event_source,
    security_event.event_schema_version
  from public.authentication_security_events security_event
  left join public.authentication_security_event_details detail
    on detail.security_event_id = security_event.id
  where (target_start is null or security_event.occurred_at >= target_start)
    and (
      target_end_exclusive is null
      or security_event.occurred_at < target_end_exclusive
    )
    and (target_user_id is null or security_event.user_id = target_user_id)
    and (
      target_event_type is null
      or security_event.event_type = target_event_type
    )
    and (
      target_before_occurred_at is null
      or (security_event.occurred_at, security_event.id)
        < (target_before_occurred_at, target_before_event_id)
    )
  order by security_event.occurred_at desc, security_event.id desc
  limit target_limit;
end;
$$;

alter function public.get_platform_authentication_security_events(
  timestamptz,
  timestamptz,
  uuid,
  text,
  integer,
  timestamptz,
  uuid
) owner to postgres;
revoke all on function public.get_platform_authentication_security_events(
  timestamptz,
  timestamptz,
  uuid,
  text,
  integer,
  timestamptz,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.get_platform_authentication_security_events(
  timestamptz,
  timestamptz,
  uuid,
  text,
  integer,
  timestamptz,
  uuid
) to authenticated;

create function public.get_platform_authentication_session_history(
  target_authentication_session_id uuid,
  target_limit integer default 100,
  target_before_occurred_at timestamptz default null,
  target_before_event_id uuid default null
)
returns table (
  event_id uuid,
  event_type text,
  event_timestamp timestamptz,
  user_id uuid,
  authentication_method text,
  authentication_outcome text,
  authentication_session_id uuid,
  access_category text,
  organization_id uuid,
  application_role text,
  country_code text,
  region_code text,
  city text,
  postal_code text,
  network_latitude numeric,
  network_longitude numeric,
  network_location_type text,
  device_category text,
  browser text,
  operating_system text,
  event_source text,
  event_schema_version smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_authentication_session_id is null
     or target_limit is null
     or target_limit < 1
     or target_limit > 200
     or ((target_before_occurred_at is null)
       <> (target_before_event_id is null)) then
    raise exception 'invalid security audit query' using errcode = '22023';
  end if;

  return query
  select
    security_event.id,
    security_event.event_type,
    security_event.occurred_at,
    security_event.user_id,
    security_event.authentication_method,
    security_event.authentication_outcome,
    security_event.authentication_session_id,
    security_event.access_category,
    security_event.organization_id,
    security_event.application_role,
    detail.country_code,
    detail.region_code,
    detail.city,
    detail.postal_code,
    detail.network_latitude,
    detail.network_longitude,
    detail.network_location_type,
    detail.device_category,
    detail.browser,
    detail.operating_system,
    security_event.event_source,
    security_event.event_schema_version
  from public.authentication_security_events security_event
  left join public.authentication_security_event_details detail
    on detail.security_event_id = security_event.id
  where security_event.authentication_session_id =
      target_authentication_session_id
    and (
      target_before_occurred_at is null
      or (security_event.occurred_at, security_event.id)
        < (target_before_occurred_at, target_before_event_id)
    )
  order by security_event.occurred_at desc, security_event.id desc
  limit target_limit;
end;
$$;

alter function public.get_platform_authentication_session_history(
  uuid,
  integer,
  timestamptz,
  uuid
) owner to postgres;
revoke all on function public.get_platform_authentication_session_history(
  uuid,
  integer,
  timestamptz,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.get_platform_authentication_session_history(
  uuid,
  integer,
  timestamptz,
  uuid
) to authenticated;

create function public.get_platform_authentication_event_correlations(
  target_security_event_id uuid,
  target_limit integer default 100,
  target_before_correlated_at timestamptz default null,
  target_before_correlation_id uuid default null
)
returns table (
  correlation_id uuid,
  security_event_id uuid,
  user_id uuid,
  authentication_session_id uuid,
  analytics_session_id uuid,
  analytics_identity_first_seen_at timestamptz,
  analytics_identity_last_seen_at timestamptz,
  analytics_authenticated_page_views bigint,
  correlated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_security_event_id is null
     or target_limit is null
     or target_limit < 1
     or target_limit > 200
     or ((target_before_correlated_at is null)
       <> (target_before_correlation_id is null)) then
    raise exception 'invalid security audit query' using errcode = '22023';
  end if;

  return query
  select
    correlation.id,
    correlation.security_event_id,
    correlation.user_id,
    correlation.authentication_session_id,
    correlation.analytics_session_id,
    correlation.analytics_identity_first_seen_at,
    correlation.analytics_identity_last_seen_at,
    correlation.analytics_authenticated_page_views,
    correlation.created_at
  from public.authentication_session_correlations correlation
  where correlation.security_event_id = target_security_event_id
    and (
      target_before_correlated_at is null
      or (correlation.created_at, correlation.id)
        < (target_before_correlated_at, target_before_correlation_id)
    )
  order by correlation.created_at desc, correlation.id desc
  limit target_limit;
end;
$$;

alter function public.get_platform_authentication_event_correlations(
  uuid,
  integer,
  timestamptz,
  uuid
) owner to postgres;
revoke all on function public.get_platform_authentication_event_correlations(
  uuid,
  integer,
  timestamptz,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.get_platform_authentication_event_correlations(
  uuid,
  integer,
  timestamptz,
  uuid
) to authenticated;

-- Manual service-role-only retention. Nothing schedules or invokes this
-- function in Phase 02A. Detailed metadata expires independently at 90 days;
-- core events and correlations remain eligible only after 365 days.
create function public.purge_authentication_security_audit_retention()
returns table (
  deleted_detail_records bigint,
  deleted_correlations bigint,
  deleted_security_events bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  retention_now timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform pg_catalog.set_config(
    'dm3oi.authentication_security_retention_cleanup',
    'enabled',
    true
  );

  delete from public.authentication_security_event_details detail
  where detail.retention_eligible_at <= retention_now;
  get diagnostics deleted_detail_records = row_count;

  delete from public.authentication_session_correlations correlation
  where correlation.retention_eligible_at <= retention_now;
  get diagnostics deleted_correlations = row_count;

  delete from public.authentication_security_events security_event
  where security_event.retention_eligible_at <= retention_now
    and not exists (
      select 1
      from public.authentication_security_event_details detail
      where detail.security_event_id = security_event.id
    )
    and not exists (
      select 1
      from public.authentication_session_correlations correlation
      where correlation.security_event_id = security_event.id
    );
  get diagnostics deleted_security_events = row_count;

  return next;
end;
$$;

alter function public.purge_authentication_security_audit_retention()
  owner to postgres;
revoke all on function public.purge_authentication_security_audit_retention()
from public, anon, authenticated, service_role;
grant execute on function public.purge_authentication_security_audit_retention()
to service_role;

comment on function public.record_authentication_security_event(
  text,
  uuid,
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  uuid
) is
  'Service-role-only append operation. Session ownership is verified against auth.sessions. Optional analytics correlation also requires one matching durable authenticated analytics identity; missing, public-only, inconsistent, and multi-identity sessions fail closed.';

comment on function public.correlate_authentication_analytics_session(
  uuid,
  uuid,
  uuid,
  uuid
) is
  'Service-role-only idempotent correlation of a verified Supabase session with one matching durable authenticated analytics identity. Public page views remain unattributed; ambiguous sessions fail closed. Supports multiple analytics sessions per authentication event.';

comment on function public.get_platform_authentication_security_events(
  timestamptz,
  timestamptz,
  uuid,
  text,
  integer,
  timestamptz,
  uuid
) is
  'SUPER_ADMIN-only bounded keyset-paginated authentication security audit list with optional user, event-type, and reporting-period filters. Broad rows omit complete authentication and analytics session UUIDs.';

comment on function public.get_platform_authentication_session_history(
  uuid,
  integer,
  timestamptz,
  uuid
) is
  'SUPER_ADMIN-only bounded keyset-paginated detail reader for one exact authentication-session UUID and its retained approximate network context. Analytics correlations are retrieved separately.';

comment on function public.get_platform_authentication_event_correlations(
  uuid,
  integer,
  timestamptz,
  uuid
) is
  'SUPER_ADMIN-only bounded keyset-paginated detail reader for the complete authentication and analytics session UUIDs correlated with one exact security event.';

comment on function public.purge_authentication_security_audit_retention() is
  'Manual service-role-only retention operation. No Phase 02A scheduler invokes it.';

notify pgrst, 'reload schema';

commit;
