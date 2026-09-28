-- Customer Portal onboarding is executed only by trusted server actions using
-- the service-role client. The original relation table granted writes only to
-- authenticated organization administrators, so Guided Intake could prepare
-- an Auth identity but could not create or reactivate its portal relation.

grant select, insert, update
  on table public.customer_portal_users
  to service_role;

-- One durable invitation lifecycle exists per organization, Customer, portal
-- identity, and normalized recipient. This makes concurrent/repeated sends
-- converge on the same lifecycle row instead of creating duplicates.
create unique index customer_portal_invitations_identity_email_key
  on public.customer_portal_invitations(
    organization_id,
    customer_id,
    user_id,
    recipient_email
  );
