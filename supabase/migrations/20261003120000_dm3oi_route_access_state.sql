begin;

-- Return only the authenticated identity's minimum proxy-routing facts. This
-- keeps inactive and pending membership visibility behind a self-only boundary
-- without exposing tenant or platform records.
create or replace function public.get_my_route_access_state()
returns table (
  profile_active boolean,
  has_active_super_admin_access boolean,
  has_active_organization_access boolean,
  has_active_customer_portal_access boolean,
  has_pending_organization_membership boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
  select
    coalesce(
      (
        select profile.is_active
        from public.profiles profile
        where profile.id = actor_id
      ),
      false
    ),
    exists (
      select 1
      from public.platform_user_roles platform_role
      where platform_role.user_id = actor_id
        and platform_role.role = 'SUPER_ADMIN'
        and platform_role.is_active = true
    ),
    exists (
      select 1
      from public.organization_members member
      where member.user_id = actor_id
        and member.is_active = true
    ),
    exists (
      select 1
      from public.customer_portal_users portal_user
      where portal_user.user_id = actor_id
        and portal_user.is_active = true
    ),
    exists (
      select 1
      from public.organization_members member
      join public.organizations organization
        on organization.id = member.organization_id
      where member.user_id = actor_id
        and member.is_active = false
        and member.status in ('INVITED', 'VERIFIED')
        and organization.status = 'ACTIVE'
    );
end;
$$;

revoke all on function public.get_my_route_access_state()
  from public, anon, authenticated;

grant execute on function public.get_my_route_access_state()
  to authenticated;

comment on function public.get_my_route_access_state()
is 'Returns only the authenticated identity own minimum access flags for request routing.';

commit;
