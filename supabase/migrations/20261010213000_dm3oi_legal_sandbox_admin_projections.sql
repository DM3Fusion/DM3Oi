-- ============================================================
-- DM3Oi legal / Sandbox SUPER_ADMIN projections
--
-- Narrow SECURITY DEFINER read boundaries for Platform
-- administration. No direct access to immutable legal evidence.
-- ============================================================


-- ------------------------------------------------------------
-- Platform organization Sandbox states
-- ------------------------------------------------------------

create or replace function public.get_platform_organization_sandbox_states()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null
     or not public.is_super_admin(actor_id)
  then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'organization_id', organization.id,
          'canonical_name', organization.name,
          'display_name',
            public.get_organization_display_name(organization.id),
          'is_sandbox',
            public.is_organization_sandbox(organization.id),
          'sandbox_designation_suppressed',
            organization.sandbox_designation_suppressed,
          'legal_state',
            public.get_organization_legal_state(organization.id)
        )
        order by organization.name
      )
      from public.organizations organization
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all
on function public.get_platform_organization_sandbox_states()
from public, anon, authenticated, service_role;

grant execute
on function public.get_platform_organization_sandbox_states()
to authenticated;


-- ------------------------------------------------------------
-- SUPER_ADMIN legal audit for one organization
-- ------------------------------------------------------------

create or replace function public.get_organization_legal_audit_admin(
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
  organization_row record;
  pair jsonb;
  events jsonb;
begin
  if actor_id is null
     or not public.is_super_admin(actor_id)
  then
    raise exception 'Not authorized'
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', event.id,
        'event_type', event.event_type,
        'license_id', event.license_id,
        'terms_version_id', event.terms_version_id,
        'terms_version', event.terms_version,
        'terms_effective_date', event.terms_effective_date,
        'privacy_version_id', event.privacy_version_id,
        'privacy_version', event.privacy_version,
        'privacy_effective_date', event.privacy_effective_date,
        'acted_by', event.acted_by,
        'actor_email', event.actor_email,
        'actor_display_name', event.actor_display_name,
        'acted_at', event.acted_at
      )
      order by event.acted_at desc, event.id desc
    ),
    '[]'::jsonb
  )
  into events
  from public.organization_legal_authorization_events event
  where event.organization_id = target_organization_id;

  return jsonb_build_object(
    'organization_id', organization_row.id,
    'canonical_name', organization_row.name,
    'display_name',
      public.get_organization_display_name(organization_row.id),
    'is_sandbox',
      public.is_organization_sandbox(organization_row.id),
    'sandbox_designation_suppressed',
      organization_row.sandbox_designation_suppressed,
    'legal_state',
      public.get_organization_legal_state(organization_row.id),
    'current_documents', pair,
    'events', events
  );
end;
$$;

revoke all
on function public.get_organization_legal_audit_admin(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.get_organization_legal_audit_admin(uuid)
to authenticated;


comment on function public.get_platform_organization_sandbox_states() is
  'SUPER_ADMIN-only aggregate projection of Organization legal and Sandbox display state.';

comment on function public.get_organization_legal_audit_admin(uuid) is
  'SUPER_ADMIN-only immutable legal authorization audit projection for one Organization.';
