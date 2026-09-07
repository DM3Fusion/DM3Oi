-- Give Business Owners organization-wide Communications oversight while keeping
-- recipient read/archive state private to the intended recipient.

drop policy if exists notifications_recipient_select on public.notifications;
drop policy if exists notifications_authorized_select on public.notifications;

create policy notifications_authorized_select
on public.notifications
for select
to authenticated
using (
  (
    recipient_user_id = auth.uid()
    and (
      public.is_super_admin()
      or public.has_effective_organization_permission(
        organization_id,
        'VIEW_COMMUNICATIONS'
      )
    )
  )
  or (
    not public.is_super_admin(recipient_user_id)
    and public.has_effective_organization_permission(
      organization_id,
      'VIEW_COMMUNICATIONS'
    )
    and public.has_organization_role(
      organization_id,
      array['BUSINESS_OWNER']::public.application_role[],
      auth.uid()
    )
  )
);

comment on policy notifications_authorized_select on public.notifications is
  'Recipients retain personal access; an active Business Owner with VIEW_COMMUNICATIONS may observe non-platform notifications in that organization.';
