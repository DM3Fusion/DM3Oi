-- Case Lifecycle configuration is platform-governed.
-- Organization owners/admins may not read or mutate lifecycle presentation.
-- SUPER_ADMIN retains access while operating in an active organization context.

drop policy if exists organization_lifecycle_access
on public.organization_lifecycle_statuses;

create policy organization_lifecycle_access
on public.organization_lifecycle_statuses
for all
to authenticated
using (
  public.is_super_admin()
)
with check (
  public.is_super_admin()
);
