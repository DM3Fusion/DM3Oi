-- ============================================================
-- DM3Oi organization legal authorization + Sandbox designation
--
-- Legal authorization is separate from commercial licensing.
-- The license ID captured on an event is an audit snapshot only;
-- a later license-row revision does not invalidate legal acceptance.
--
-- A TRIAL or COMP organization is displayed as Sandbox until
-- the current published Terms + Privacy pair has been accepted
-- by an active BUSINESS_OWNER, unless SUPER_ADMIN explicitly
-- suppresses the Sandbox designation for an approved POC.
--
-- Suppression affects display only. It is never legal acceptance.
-- ============================================================


-- ------------------------------------------------------------
-- SUPER_ADMIN POC display exception
-- ------------------------------------------------------------

alter table public.organizations
  add column if not exists sandbox_designation_suppressed boolean
  not null
  default false;

comment on column public.organizations.sandbox_designation_suppressed is
  'SUPER_ADMIN-only display exception. Does not constitute legal acceptance or change commercial state.';


create or replace function public.protect_sandbox_designation_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sandbox_designation_suppressed
       is distinct from old.sandbox_designation_suppressed
     and not public.is_super_admin(auth.uid())
  then
    raise exception 'Only SUPER_ADMIN may change Sandbox designation suppression'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


drop trigger if exists organizations_protect_sandbox_designation
on public.organizations;

create trigger organizations_protect_sandbox_designation
before update of sandbox_designation_suppressed
on public.organizations
for each row
execute function public.protect_sandbox_designation_suppression();


-- ------------------------------------------------------------
-- Immutable organization legal authorization evidence
--
-- IDs are retained as forensic snapshots rather than FKs so
-- evidence survives later user/org/license lifecycle changes.
-- ------------------------------------------------------------

create table if not exists public.organization_legal_authorization_events (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,
  organization_name text not null,

  license_id uuid not null,

  terms_version_id uuid not null,
  terms_version text not null,
  terms_effective_date date not null,

  privacy_version_id uuid not null,
  privacy_version text not null,
  privacy_effective_date date not null,

  event_type text not null
    check (event_type in ('ACCEPTED', 'WITHDRAWN')),

  acted_by uuid not null,
  actor_email text null,
  actor_display_name text null,

  acted_at timestamptz not null default now()
);


create index if not exists organization_legal_authorization_events_org_idx
  on public.organization_legal_authorization_events(
    organization_id,
    acted_at desc,
    id desc
  );

create index if not exists organization_legal_authorization_events_license_idx
  on public.organization_legal_authorization_events(
    license_id,
    acted_at desc,
    id desc
  );

create index if not exists organization_legal_authorization_events_actor_idx
  on public.organization_legal_authorization_events(
    acted_by,
    acted_at desc
  );


create or replace function public.prevent_organization_legal_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Organization legal authorization evidence is immutable'
    using errcode = '55000';
end;
$$;


drop trigger if exists organization_legal_authorization_events_immutable
on public.organization_legal_authorization_events;

create trigger organization_legal_authorization_events_immutable
before update or delete
on public.organization_legal_authorization_events
for each row
execute function public.prevent_organization_legal_event_mutation();


alter table public.organization_legal_authorization_events
  enable row level security;

alter table public.organization_legal_authorization_events
  force row level security;

revoke all
on public.organization_legal_authorization_events
from public, anon, authenticated, service_role;


-- ------------------------------------------------------------
-- Active Business Owner predicate
-- ------------------------------------------------------------

create or replace function public.is_active_business_owner(
  target_organization_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    join public.profiles profile
      on profile.id = member.user_id
    where member.organization_id = target_organization_id
      and member.user_id = target_user_id
      and member.role = 'BUSINESS_OWNER'
      and member.is_active
      and organization.status = 'ACTIVE'
      and profile.is_active
  );
$$;

revoke all
on function public.is_active_business_owner(uuid, uuid)
from public, anon, authenticated, service_role;


-- ------------------------------------------------------------
-- Canonical current legal pair
-- ------------------------------------------------------------

create or replace function public.get_current_organization_legal_pair()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with terms as (
    select
      version.id,
      version.version,
      version.effective_date
    from public.legal_document_publications publication
    join public.legal_document_versions version
      on version.document_key = publication.document_key
     and version.id = publication.version_id
    where publication.document_key = 'TERMS_OF_SERVICE'
      and version.effective_date <= current_date
    limit 1
  ),
  privacy as (
    select
      version.id,
      version.version,
      version.effective_date
    from public.legal_document_publications publication
    join public.legal_document_versions version
      on version.document_key = publication.document_key
     and version.id = publication.version_id
    where publication.document_key = 'PRIVACY_POLICY'
      and version.effective_date <= current_date
    limit 1
  )
  select case
    when not exists (select 1 from terms)
      or not exists (select 1 from privacy)
    then null
    else jsonb_build_object(
      'terms_version_id', (select id from terms),
      'terms_version', (select version from terms),
      'terms_effective_date', (select effective_date from terms),
      'privacy_version_id', (select id from privacy),
      'privacy_version', (select version from privacy),
      'privacy_effective_date', (select effective_date from privacy)
    )
  end;
$$;

revoke all
on function public.get_current_organization_legal_pair()
from public, anon, authenticated, service_role;


-- ------------------------------------------------------------
-- Canonical legal state
--
-- NOT_CONFIGURED  current license or published pair unavailable
-- NOT_ACCEPTED    no accepted legal authorization exists
-- UPDATE_REQUIRED accepted older pair, current pair differs
-- WITHDRAWN       latest authorization was withdrawn
-- ACTIVE          latest accepted event matches current pair
-- ------------------------------------------------------------

create or replace function public.get_organization_legal_state(
  target_organization_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_license_id uuid;
  pair jsonb;
  latest record;
begin
  select license.id
  into current_license_id
  from public.organization_licenses license
  where license.organization_id = target_organization_id
    and license.is_current
  order by license.created_at desc, license.id desc
  limit 1;

  if current_license_id is null then
    return 'NOT_CONFIGURED';
  end if;

  pair := public.get_current_organization_legal_pair();

  if pair is null then
    return 'NOT_CONFIGURED';
  end if;

  select
    event.event_type,
    event.terms_version_id,
    event.privacy_version_id
  into latest
  from public.organization_legal_authorization_events event
  where event.organization_id = target_organization_id
  order by event.acted_at desc, event.id desc
  limit 1;

  if latest.event_type is null then
    return 'NOT_ACCEPTED';
  end if;

  if latest.event_type = 'WITHDRAWN' then
    return 'WITHDRAWN';
  end if;

  if latest.event_type = 'ACCEPTED'
     and latest.terms_version_id =
       (pair ->> 'terms_version_id')::uuid
     and latest.privacy_version_id =
       (pair ->> 'privacy_version_id')::uuid
  then
    return 'ACTIVE';
  end if;

  return 'UPDATE_REQUIRED';
end;
$$;

revoke all
on function public.get_organization_legal_state(uuid)
from public, anon, authenticated, service_role;


-- ------------------------------------------------------------
-- BUSINESS_OWNER acceptance
-- ------------------------------------------------------------

create or replace function public.accept_current_organization_legal_documents(
  target_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_profile record;
  organization_row record;
  current_license_id uuid;
  pair jsonb;
  latest record;
begin
  if actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if not public.is_active_business_owner(
    target_organization_id,
    actor_id
  ) then
    raise exception 'Business Owner access required'
      using errcode = '42501';
  end if;

  select
    organization.id,
    organization.name
  into organization_row
  from public.organizations organization
  where organization.id = target_organization_id
    and organization.status = 'ACTIVE';

  if organization_row.id is null then
    raise exception 'Organization unavailable';
  end if;

  select
    profile.email,
    profile.display_name
  into actor_profile
  from public.profiles profile
  where profile.id = actor_id
    and profile.is_active;

  select license.id
  into current_license_id
  from public.organization_licenses license
  where license.organization_id = target_organization_id
    and license.is_current
  order by license.created_at desc, license.id desc
  limit 1
  for update;

  if current_license_id is null then
    raise exception 'Current organization license required';
  end if;

  pair := public.get_current_organization_legal_pair();

  if pair is null then
    raise exception 'Current legal documents are not available';
  end if;

  select
    event.event_type,
    event.terms_version_id,
    event.privacy_version_id
  into latest
  from public.organization_legal_authorization_events event
  where event.organization_id = target_organization_id
  order by event.acted_at desc, event.id desc
  limit 1;

  if latest.event_type = 'ACCEPTED'
     and latest.terms_version_id =
       (pair ->> 'terms_version_id')::uuid
     and latest.privacy_version_id =
       (pair ->> 'privacy_version_id')::uuid
  then
    return;
  end if;

  insert into public.organization_legal_authorization_events (
    organization_id,
    organization_name,
    license_id,
    terms_version_id,
    terms_version,
    terms_effective_date,
    privacy_version_id,
    privacy_version,
    privacy_effective_date,
    event_type,
    acted_by,
    actor_email,
    actor_display_name
  )
  values (
    target_organization_id,
    organization_row.name,
    current_license_id,
    (pair ->> 'terms_version_id')::uuid,
    pair ->> 'terms_version',
    (pair ->> 'terms_effective_date')::date,
    (pair ->> 'privacy_version_id')::uuid,
    pair ->> 'privacy_version',
    (pair ->> 'privacy_effective_date')::date,
    'ACCEPTED',
    actor_id,
    actor_profile.email,
    actor_profile.display_name
  );
end;
$$;


revoke all
on function public.accept_current_organization_legal_documents(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.accept_current_organization_legal_documents(uuid)
to authenticated;


-- ------------------------------------------------------------
-- BUSINESS_OWNER withdrawal
-- ------------------------------------------------------------

create or replace function public.withdraw_organization_legal_acceptance(
  target_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_profile record;
  organization_row record;
  current_license_id uuid;
  latest record;
begin
  if actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if not public.is_active_business_owner(
    target_organization_id,
    actor_id
  ) then
    raise exception 'Business Owner access required'
      using errcode = '42501';
  end if;

  select
    organization.id,
    organization.name
  into organization_row
  from public.organizations organization
  where organization.id = target_organization_id
    and organization.status = 'ACTIVE';

  select
    profile.email,
    profile.display_name
  into actor_profile
  from public.profiles profile
  where profile.id = actor_id
    and profile.is_active;

  select license.id
  into current_license_id
  from public.organization_licenses license
  where license.organization_id = target_organization_id
    and license.is_current
  order by license.created_at desc, license.id desc
  limit 1
  for update;

  if current_license_id is null then
    raise exception 'Current organization license required';
  end if;

  select
    event.event_type,
    event.terms_version_id,
    event.terms_version,
    event.terms_effective_date,
    event.privacy_version_id,
    event.privacy_version,
    event.privacy_effective_date
  into latest
  from public.organization_legal_authorization_events event
  where event.organization_id = target_organization_id
  order by event.acted_at desc, event.id desc
  limit 1;

  if latest.event_type is distinct from 'ACCEPTED' then
    raise exception 'Organization legal acceptance is not active';
  end if;

  insert into public.organization_legal_authorization_events (
    organization_id,
    organization_name,
    license_id,
    terms_version_id,
    terms_version,
    terms_effective_date,
    privacy_version_id,
    privacy_version,
    privacy_effective_date,
    event_type,
    acted_by,
    actor_email,
    actor_display_name
  )
  values (
    target_organization_id,
    organization_row.name,
    current_license_id,
    latest.terms_version_id,
    latest.terms_version,
    latest.terms_effective_date,
    latest.privacy_version_id,
    latest.privacy_version,
    latest.privacy_effective_date,
    'WITHDRAWN',
    actor_id,
    actor_profile.email,
    actor_profile.display_name
  );
end;
$$;


revoke all
on function public.withdraw_organization_legal_acceptance(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.withdraw_organization_legal_acceptance(uuid)
to authenticated;


-- ------------------------------------------------------------
-- Sandbox derivation
-- ------------------------------------------------------------

create or replace function public.is_organization_sandbox(
  target_organization_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  commercial public.commercial_state;
  suppressed boolean;
begin
  select organization.sandbox_designation_suppressed
  into suppressed
  from public.organizations organization
  where organization.id = target_organization_id;

  if coalesce(suppressed, false) then
    return false;
  end if;

  select license.commercial_state
  into commercial
  from public.organization_licenses license
  where license.organization_id = target_organization_id
    and license.is_current
  order by license.created_at desc, license.id desc
  limit 1;

  if commercial is null
     or commercial not in ('TRIAL', 'COMP')
  then
    return false;
  end if;

  return public.get_organization_legal_state(
    target_organization_id
  ) <> 'ACTIVE';
end;
$$;


create or replace function public.get_organization_display_name(
  target_organization_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  organization_name text;
begin
  select organization.name
  into organization_name
  from public.organizations organization
  where organization.id = target_organization_id;

  if organization_name is null then
    return null;
  end if;

  if public.is_organization_sandbox(target_organization_id) then
    return organization_name || ' — Sandbox';
  end if;

  return organization_name;
end;
$$;


revoke all
on function public.is_organization_sandbox(uuid)
from public, anon, authenticated, service_role;

revoke all
on function public.get_organization_display_name(uuid)
from public, anon, authenticated;

grant execute
on function public.get_organization_display_name(uuid)
to service_role;


-- ------------------------------------------------------------
-- Current-user legal/Sandbox state
-- ------------------------------------------------------------

create or replace function public.get_my_organization_legal_state(
  target_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  pair jsonb;
  state text;
  organization_row record;
  owner_access boolean;
begin
  if actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if not public.is_super_admin(actor_id)
     and not exists (
       select 1
       from public.organization_members member
       join public.organizations organization
         on organization.id = member.organization_id
       where member.organization_id = target_organization_id
         and member.user_id = actor_id
         and member.is_active
         and organization.status = 'ACTIVE'
     )
  then
    raise exception 'Organization access denied'
      using errcode = '42501';
  end if;

  select
    organization.id,
    organization.name,
    organization.sandbox_designation_suppressed
  into organization_row
  from public.organizations organization
  where organization.id = target_organization_id;

  if organization_row.id is null then
    return null;
  end if;

  pair := public.get_current_organization_legal_pair();
  state := public.get_organization_legal_state(target_organization_id);
  owner_access := public.is_active_business_owner(
    target_organization_id,
    actor_id
  );

  return jsonb_build_object(
    'state', state,
    'can_accept', owner_access,
    'is_sandbox', public.is_organization_sandbox(target_organization_id),
    'sandbox_designation_suppressed',
      organization_row.sandbox_designation_suppressed,
    'canonical_name', organization_row.name,
    'display_name',
      public.get_organization_display_name(target_organization_id),
    'current_documents', pair
  );
end;
$$;


revoke all
on function public.get_my_organization_legal_state(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.get_my_organization_legal_state(uuid)
to authenticated;


-- ------------------------------------------------------------
-- SUPER_ADMIN Sandbox-display control
-- ------------------------------------------------------------

create or replace function public.admin_set_organization_sandbox_suppressed(
  target_organization_id uuid,
  target_suppressed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  update public.organizations
  set sandbox_designation_suppressed =
        coalesce(target_suppressed, false),
      updated_at = now()
  where id = target_organization_id;

  if not found then
    raise exception 'Organization not found';
  end if;
end;
$$;


revoke all
on function public.admin_set_organization_sandbox_suppressed(uuid, boolean)
from public, anon, authenticated, service_role;

grant execute
on function public.admin_set_organization_sandbox_suppressed(uuid, boolean)
to authenticated;


-- ------------------------------------------------------------
-- Server-only display-name resolver for transactional email
-- ------------------------------------------------------------

create or replace function public.get_organization_display_name_server(
  target_organization_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  return public.get_organization_display_name(
    target_organization_id
  );
end;
$$;


revoke all
on function public.get_organization_display_name_server(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.get_organization_display_name_server(uuid)
to service_role;


-- ------------------------------------------------------------
-- Extend existing access-context payload additively.
--
-- No routing, permission, license, Portal, session, or selection
-- semantics are changed.
-- ------------------------------------------------------------

create or replace function public.get_my_access_context(
  target_organization_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  actor_id uuid:=auth.uid();
  profile_row public.profiles%rowtype;
  super_admin boolean:=false;
  organizations_json jsonb:='[]'::jsonb;
  active_organization_id uuid:=null;
  active_role public.application_role:=null;
  permission_overrides_json jsonb:='[]'::jsonb;
  license_json jsonb:=null;
  customer_portal_ids_json jsonb:='[]'::jsonb;
begin
  if actor_id is null then
    return null;
  end if;

  select *
  into profile_row
  from public.profiles
  where id=actor_id;

  if profile_row.id is null or profile_row.is_active is not true then
    return null;
  end if;

  select public.is_super_admin(actor_id)
  into super_admin;

  if super_admin then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',organization.id,
          'name',organization.name,
          'display_name',
            public.get_organization_display_name(organization.id),
          'is_sandbox',
            public.is_organization_sandbox(organization.id),
          'slug',organization.slug,
          'avatar_path',organization.avatar_path,
          'avatar_updated_at',organization.avatar_updated_at,
          'role','SUPER_ADMIN'
        )
        order by organization.name
      ),
      '[]'::jsonb
    )
    into organizations_json
    from public.organizations organization
    where organization.status='ACTIVE';

    if target_organization_id is not null
      and exists (
        select 1
        from public.organizations organization
        where organization.id=target_organization_id
          and organization.status='ACTIVE'
      )
    then
      active_organization_id:=target_organization_id;
      active_role:='SUPER_ADMIN';
    end if;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',organization.id,
          'name',organization.name,
          'display_name',
            public.get_organization_display_name(organization.id),
          'is_sandbox',
            public.is_organization_sandbox(organization.id),
          'slug',organization.slug,
          'avatar_path',organization.avatar_path,
          'avatar_updated_at',organization.avatar_updated_at,
          'role',member.role
        )
        order by organization.name
      ),
      '[]'::jsonb
    )
    into organizations_json
    from public.organization_members member
    join public.organizations organization
      on organization.id=member.organization_id
    where member.user_id=actor_id
      and member.is_active
      and organization.status='ACTIVE';

    select
      member.organization_id,
      member.role
    into
      active_organization_id,
      active_role
    from public.organization_members member
    join public.organizations organization
      on organization.id=member.organization_id
    where member.user_id=actor_id
      and member.is_active
      and organization.status='ACTIVE'
      and (
        target_organization_id is null
        or member.organization_id=target_organization_id
      )
    order by
      case
        when target_organization_id is not null
          and member.organization_id=target_organization_id
        then 0
        else 1
      end,
      organization.name
    limit 1;

    if active_organization_id is null then
      select
        member.organization_id,
        member.role
      into
        active_organization_id,
        active_role
      from public.organization_members member
      join public.organizations organization
        on organization.id=member.organization_id
      where member.user_id=actor_id
        and member.is_active
        and organization.status='ACTIVE'
      order by organization.name
      limit 1;
    end if;
  end if;

  if active_organization_id is not null
    and active_role is not null
    and active_role <> 'SUPER_ADMIN'
  then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'role',permission.role,
          'permission',permission.permission,
          'is_allowed',permission.is_allowed
        )
        order by permission.permission
      ),
      '[]'::jsonb
    )
    into permission_overrides_json
    from public.organization_role_permissions permission
    where permission.organization_id=active_organization_id
      and permission.role=active_role;
  end if;

  if active_organization_id is not null then
    select jsonb_build_object(
      'license_status',license.license_status,
      'commercial_state',license.commercial_state,
      'starts_at',license.starts_at,
      'expires_at',license.expires_at,
      'grace_ends_at',license.grace_ends_at,
      'notice_days',license.notice_days,
      'notification_thresholds',license.notification_thresholds
    )
    into license_json
    from public.organization_licenses license
    where license.organization_id=active_organization_id
      and license.is_current
    limit 1;
  end if;

  select coalesce(
    jsonb_agg(access.customer_id order by access.customer_id),
    '[]'::jsonb
  )
  into customer_portal_ids_json
  from public.customer_portal_users access
  join public.organizations organization
    on organization.id=access.organization_id
  join public.customers customer
    on customer.id=access.customer_id
   and customer.organization_id=access.organization_id
  left join public.organization_settings settings
    on settings.organization_id=access.organization_id
  where access.user_id=actor_id
    and access.is_active
    and organization.status='ACTIVE'
    and customer.status='ACTIVE'
    and settings.portal_enabled is distinct from false
    and public.is_customer_portal_user(
      access.organization_id,
      access.customer_id,
      actor_id
    );

  return jsonb_build_object(
    'profile',
    jsonb_build_object(
      'id',profile_row.id,
      'display_name',profile_row.display_name,
      'first_name',profile_row.first_name,
      'last_name',profile_row.last_name,
      'email',profile_row.email,
      'title',profile_row.title,
      'avatar_path',profile_row.avatar_path,
      'avatar_updated_at',profile_row.avatar_updated_at,
      'is_active',profile_row.is_active
    ),
    'is_super_admin',super_admin,
    'organizations',organizations_json,
    'active_organization_id',active_organization_id,
    'active_role',active_role,
    'permission_overrides',permission_overrides_json,
    'license',license_json,
    'customer_portal_ids',customer_portal_ids_json
  );
end;
$function$;


alter function public.get_my_access_context(uuid)
  owner to postgres;

revoke all
on function public.get_my_access_context(uuid)
from public, anon, authenticated;

grant execute
on function public.get_my_access_context(uuid)
to authenticated;


comment on table public.organization_legal_authorization_events is
  'Immutable Business Owner legal authorization evidence bound to exact published DM3Oi Terms and Privacy versions.';

comment on function public.is_organization_sandbox(uuid) is
  'Derives Sandbox display state from TRIAL/COMP commercial state, current legal authorization, and the SUPER_ADMIN display-only suppression control.';

comment on function public.admin_set_organization_sandbox_suppressed(uuid, boolean) is
  'SUPER_ADMIN-only POC display exception. Does not create or imply legal acceptance.';
