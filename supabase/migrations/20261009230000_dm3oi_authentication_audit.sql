-- DM3Oi Authentication Audit
--
-- Durable forensic evidence of successful authentication.
-- Authentication events are independent of page-view analytics:
-- a successful sign-in is retained even when the user performs no
-- subsequently tracked navigation.
--
-- Events are written only through a service-role RPC invoked by the
-- trusted DM3Oi server immediately after successful Supabase OTP
-- verification. Identity/access snapshots are derived by the database,
-- never supplied by the browser.

create table public.authentication_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  authenticated_at timestamptz not null default clock_timestamp(),
  authentication_method text not null default 'EMAIL_OTP'
    check (authentication_method in ('EMAIL_OTP')),
  email_snapshot text,
  display_name_snapshot text,
  access_type_snapshot text not null
    check (
      access_type_snapshot in (
        'INTERNAL',
        'CUSTOMER_PORTAL',
        'AUTHENTICATED_UNCLASSIFIED'
      )
    ),
  role_snapshot text,
  organization_id_snapshot uuid,
  organization_name_snapshot text
);

create index authentication_events_user_time_idx
  on public.authentication_events(user_id, authenticated_at desc);

create index authentication_events_time_idx
  on public.authentication_events(authenticated_at desc);

create index authentication_events_access_time_idx
  on public.authentication_events(
    access_type_snapshot,
    authenticated_at desc
  );

alter table public.authentication_events enable row level security;

revoke all on table public.authentication_events
from anon, authenticated;

revoke insert, update, delete
on table public.authentication_events
from service_role;

create or replace function public.guard_authentication_event_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'authentication audit events are immutable'
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_authentication_event_immutability()
from public, anon, authenticated;

create trigger authentication_events_immutable
before update or delete
on public.authentication_events
for each row
execute function public.guard_authentication_event_immutability();

create or replace function public.record_authentication_event(
  target_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
  target_email text;
  target_display_name text;
  target_access_type text := 'AUTHENTICATED_UNCLASSIFIED';
  target_role text;
  target_organization_id uuid;
  target_organization_name text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_user_id is null then
    raise exception 'target user is required'
      using errcode = '22023';
  end if;

  select
    nullif(lower(trim(auth_user.email)), '')
  into target_email
  from auth.users auth_user
  where auth_user.id = target_user_id;

  if not found then
    raise exception 'authenticated user not found'
      using errcode = 'P0002';
  end if;

  select coalesce(
    nullif(trim(profile.display_name), ''),
    nullif(
      trim(
        concat_ws(
          ' ',
          profile.first_name,
          profile.last_name
        )
      ),
      ''
    ),
    case
      when target_email is not null
      then split_part(target_email, '@', 1)
      else null
    end
  )
  into target_display_name
  from public.profiles profile
  where profile.id = target_user_id;

  if public.is_super_admin(target_user_id) then
    target_access_type := 'INTERNAL';
    target_role := 'SUPER_ADMIN';
  else
    select
      'INTERNAL',
      member.role::text,
      organization.id,
      organization.name
    into
      target_access_type,
      target_role,
      target_organization_id,
      target_organization_name
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.user_id = target_user_id
      and member.is_active = true
      and member.status = 'ACTIVE'
      and organization.status = 'ACTIVE'
    order by member.created_at
    limit 1;

    if not found then
      select
        'CUSTOMER_PORTAL',
        'CUSTOMER_PORTAL',
        portal.organization_id,
        organization.name
      into
        target_access_type,
        target_role,
        target_organization_id,
        target_organization_name
      from public.customer_portal_users portal
      join public.organizations organization
        on organization.id = portal.organization_id
      where portal.user_id = target_user_id
        and portal.is_active = true
        and organization.status = 'ACTIVE'
      order by portal.created_at
      limit 1;
    end if;
  end if;

  insert into public.authentication_events (
    user_id,
    authentication_method,
    email_snapshot,
    display_name_snapshot,
    access_type_snapshot,
    role_snapshot,
    organization_id_snapshot,
    organization_name_snapshot
  )
  values (
    target_user_id,
    'EMAIL_OTP',
    target_email,
    target_display_name,
    target_access_type,
    target_role,
    target_organization_id,
    target_organization_name
  )
  returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.record_authentication_event(uuid)
from public, anon, authenticated;

grant execute on function public.record_authentication_event(uuid)
to service_role;

create or replace function public.get_platform_authentication_audit(
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
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_start is not null
     and target_end_exclusive is not null
     and target_end_exclusive <= target_start then
    raise exception 'authentication audit range end must be after start'
      using errcode = '22023';
  end if;

  with filtered as (
    select *
    from public.authentication_events event
    where (target_start is null or event.authenticated_at >= target_start)
      and (
        target_end_exclusive is null
        or event.authenticated_at < target_end_exclusive
      )
  ),
  rollups as (
    select
      user_id,
      access_type_snapshot,
      role_snapshot,
      organization_id_snapshot,
      organization_name_snapshot,
      count(*) as sign_ins,
      max(authenticated_at) as last_sign_in
    from filtered
    group by
      user_id,
      access_type_snapshot,
      role_snapshot,
      organization_id_snapshot,
      organization_name_snapshot
  )
  select jsonb_build_object(
    'summary',
    jsonb_build_object(
      'internalSignIns',
        count(*) filter (
          where access_type_snapshot = 'INTERNAL'
        ),
      'customerPortalSignIns',
        count(*) filter (
          where access_type_snapshot = 'CUSTOMER_PORTAL'
        ),
      'unclassifiedSignIns',
        count(*) filter (
          where access_type_snapshot = 'AUTHENTICATED_UNCLASSIFIED'
        )
    ),
    'rows',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'identityKey', rollup.user_id,
            'user', coalesce(
              latest.display_name_snapshot,
              latest.email_snapshot,
              'Unavailable account'
            ),
            'email', latest.email_snapshot,
            'accountIdentifier', coalesce(
              latest.email_snapshot,
              'Account ' || left(rollup.user_id::text, 8)
            ),
            'accessType', rollup.access_type_snapshot,
            'role', rollup.role_snapshot,
            'organization', coalesce(
              rollup.organization_name_snapshot,
              case
                when rollup.role_snapshot = 'SUPER_ADMIN'
                then 'Platform Operations'
                else 'Not captured'
              end
            ),
            'signIns', rollup.sign_ins,
            'lastSignIn', rollup.last_sign_in
          )
          order by rollup.last_sign_in desc
        )
        from rollups rollup
        left join lateral (
          select
            event.email_snapshot,
            event.display_name_snapshot
          from filtered event
          where event.user_id = rollup.user_id
            and event.access_type_snapshot = rollup.access_type_snapshot
            and event.role_snapshot
                is not distinct from rollup.role_snapshot
            and event.organization_id_snapshot
                is not distinct from rollup.organization_id_snapshot
          order by event.authenticated_at desc
          limit 1
        ) latest on true
      ),
      '[]'::jsonb
    )
  )
  into result
  from filtered;

  return result;
end;
$$;

revoke all on function public.get_platform_authentication_audit(
  timestamptz,
  timestamptz
)
from public, anon;

grant execute on function public.get_platform_authentication_audit(
  timestamptz,
  timestamptz
)
to authenticated;

comment on table public.authentication_events is
  'Immutable forensic audit of successful DM3Oi authentications. Events are recorded independently of page-view analytics.';

comment on function public.record_authentication_event(uuid) is
  'Service-role-only writer for a successful authenticated DM3Oi identity. Database derives all identity and access snapshots.';

comment on function public.get_platform_authentication_audit(
  timestamptz,
  timestamptz
) is
  'SUPER_ADMIN-only authentication audit rollup for Platform Analytics.';
