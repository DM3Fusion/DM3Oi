begin;

-- Extend the existing request-routing projection without replacing the deployed
-- one-argument route/session function. The proxy supplies the active organization
-- cookie when available; a sole active membership is resolved as a safe fallback.
create or replace function public.get_my_route_access_state(
  target_is_meaningful_activity boolean,
  target_organization_id uuid
)
returns table (
  profile_active boolean,
  has_active_super_admin_access boolean,
  has_active_organization_access boolean,
  has_active_customer_portal_access boolean,
  has_pending_organization_membership boolean,
  session_policy_valid boolean,
  session_policy_scope text,
  route_organization_id uuid,
  route_organization_role text,
  route_organization_legal_state text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  base_state record;
  resolved_organization_id uuid;
  resolved_organization_role text;
  active_membership_count integer := 0;
begin
  if actor_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Preserve the existing authoritative access/session-policy implementation.
  select *
  into base_state
  from public.get_my_route_access_state(
    target_is_meaningful_activity
  );

  -- Prefer the exact active organization supplied by the authenticated
  -- application cookie, but only when the actor really has active membership.
  if target_organization_id is not null then
    select
      member.organization_id,
      member.role::text
    into
      resolved_organization_id,
      resolved_organization_role
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.user_id = actor_id
      and member.organization_id = target_organization_id
      and member.is_active = true
      and member.status = 'ACTIVE'
      and organization.status = 'ACTIVE'
    limit 1;
  end if;

  -- A newly provisioned Owner may not have the active-organization cookie yet.
  -- Resolve automatically only when there is exactly one valid active membership.
  if resolved_organization_id is null then
    select count(*)
    into active_membership_count
    from public.organization_members member
    join public.organizations organization
      on organization.id = member.organization_id
    where member.user_id = actor_id
      and member.is_active = true
      and member.status = 'ACTIVE'
      and organization.status = 'ACTIVE';

    if active_membership_count = 1 then
      select
        member.organization_id,
        member.role::text
      into
        resolved_organization_id,
        resolved_organization_role
      from public.organization_members member
      join public.organizations organization
        on organization.id = member.organization_id
      where member.user_id = actor_id
        and member.is_active = true
        and member.status = 'ACTIVE'
        and organization.status = 'ACTIVE'
      limit 1;
    end if;
  end if;

  return query
  select
    base_state.profile_active,
    base_state.has_active_super_admin_access,
    base_state.has_active_organization_access,
    base_state.has_active_customer_portal_access,
    base_state.has_pending_organization_membership,
    base_state.session_policy_valid,
    base_state.session_policy_scope,
    resolved_organization_id,
    resolved_organization_role,
    case
      when resolved_organization_id is null then null
      else public.get_organization_legal_state(
        resolved_organization_id
      )::text
    end;
end;
$$;

alter function public.get_my_route_access_state(boolean, uuid)
  owner to postgres;

revoke all on function public.get_my_route_access_state(boolean, uuid)
  from public, anon, authenticated;

grant execute on function public.get_my_route_access_state(boolean, uuid)
  to authenticated;

comment on function public.get_my_route_access_state(boolean, uuid) is
  'Returns existing self-only route and session state plus the selected organization role and current legal authorization state for request-level organization access enforcement.';

commit;
