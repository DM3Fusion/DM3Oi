-- Keep organization membership writes aligned with effective MANAGE_USERS and
-- the Owner/Admin assignment hierarchy used by the organization invitation UI.

drop policy if exists members_admin_insert on public.organization_members;
create policy members_admin_insert
on public.organization_members
for insert
to authenticated
with check (
  public.is_super_admin()
  or (
    not public.is_super_admin(user_id)
    and role in (
      'BUSINESS_OWNER',
      'BUSINESS_ADMIN',
      'STAFF_MANAGER',
      'STAFF_USER'
    )
    and public.has_effective_organization_permission(
      organization_id,
      'MANAGE_USERS'
    )
    and (
      public.has_organization_role(
        organization_id,
        array['BUSINESS_OWNER']::public.application_role[],
        auth.uid()
      )
      or (
        role in ('STAFF_MANAGER', 'STAFF_USER')
        and public.has_organization_role(
          organization_id,
          array['BUSINESS_ADMIN']::public.application_role[],
          auth.uid()
        )
      )
    )
  )
);

drop policy if exists members_admin_update on public.organization_members;
create policy members_admin_update
on public.organization_members
for update
to authenticated
using (
  public.is_super_admin()
  or (
    not public.is_super_admin(user_id)
    and public.has_effective_organization_permission(
      organization_id,
      'MANAGE_USERS'
    )
    and (
      public.has_organization_role(
        organization_id,
        array['BUSINESS_OWNER']::public.application_role[],
        auth.uid()
      )
      or (
        role in ('STAFF_MANAGER', 'STAFF_USER')
        and public.has_organization_role(
          organization_id,
          array['BUSINESS_ADMIN']::public.application_role[],
          auth.uid()
        )
      )
    )
  )
)
with check (
  public.is_super_admin()
  or (
    not public.is_super_admin(user_id)
    and role in (
      'BUSINESS_OWNER',
      'BUSINESS_ADMIN',
      'STAFF_MANAGER',
      'STAFF_USER'
    )
    and public.has_effective_organization_permission(
      organization_id,
      'MANAGE_USERS'
    )
    and (
      public.has_organization_role(
        organization_id,
        array['BUSINESS_OWNER']::public.application_role[],
        auth.uid()
      )
      or (
        role in ('STAFF_MANAGER', 'STAFF_USER')
        and public.has_organization_role(
          organization_id,
          array['BUSINESS_ADMIN']::public.application_role[],
          auth.uid()
        )
      )
    )
  )
);

comment on policy members_admin_insert on public.organization_members is
  'Effective MANAGE_USERS is required; Owners may assign internal roles and Admins may assign Staff roles.';
comment on policy members_admin_update on public.organization_members is
  'Effective MANAGE_USERS and the Owner/Admin hierarchy protect both current and resulting membership state.';
