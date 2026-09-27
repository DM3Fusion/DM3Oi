import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  organizationUserDisplayName,
  resolvePendingInviteIdentityRepair,
} from "../lib/data/pending-invite-identity.ts";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20260927120000_dm3oi_invitation_verification_activation.sql",
);
const detail = source("app/users/[membershipId]/page.tsx");
const register = source("app/users/page.tsx");
const actions = source("lib/data/organization-user-actions.ts");

test("every successful Auth acceptance path reconciles the authoritative membership", () => {
  const callback = source("app/auth/callback/route.ts");
  const completion = source("app/auth/invite/complete/route.ts");
  const otp = source("lib/auth/actions.ts");
  for (const path of [callback, completion, otp])
    assert.match(path, /verify_my_membership_invitation/);
  assert.match(callback, /account\/pending-activation/);
  assert.match(completion, /account\/pending-activation/);
});

test("verification is identity-bound, tenant-derived, inactive, and retry-safe", () => {
  assert.match(migration, /actor uuid := auth\.uid\(\)/);
  assert.match(migration, /member\.user_id = actor/);
  assert.match(migration, /membership\.user_id <> actor/);
  assert.match(migration, /pending_membership_count > 1[\s\S]*ambiguous membership invitation/);
  assert.match(migration, /member\.status in \('INVITED', 'VERIFIED'\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /if membership\.status = 'INVITED'/);
  assert.match(migration, /status = 'VERIFIED'/);
  const verificationFunction = migration.slice(
    migration.indexOf("create or replace function public.verify_my_membership_invitation"),
    migration.indexOf("revoke all on function public.verify_my_membership_invitation"),
  );
  assert.doesNotMatch(verificationFunction, /set[\s\S]{0,80}status = 'ACTIVE'/);
  assert.match(
    source("supabase/migrations/20260922170000_dm3oi_member_lifecycle_and_profile_title.sql"),
    /new\.is_active := new\.status = 'ACTIVE'/,
  );
});

test("verification creates one durable event and idempotent unread activation notifications", () => {
  assert.match(migration, /insert into public\.organization_membership_events/);
  assert.match(migration, /'VERIFIED',[\s\S]*'INVITED', 'VERIFIED'/);
  assert.match(migration, /verification_event_id/);
  assert.match(migration, /perform public\.create_notification/);
  assert.match(migration, /'ORGANIZATION_USER_INVITATION_VERIFIED'/);
  assert.match(migration, /'User invitation accepted — activation required'/);
  assert.match(migration, /'\/users\/' \|\| membership\.id::text/);
  assert.match(migration, /manager\.user_id <> actor/);
  assert.match(migration, /manager\.role in \('BUSINESS_OWNER', 'BUSINESS_ADMIN'\)/);
  assert.match(migration, /effective_organization_role_permission\([\s\S]*'MANAGE_USERS'/);
  assert.match(migration, /manager\.role = 'BUSINESS_ADMIN'[\s\S]*membership\.role in \('STAFF_MANAGER', 'STAFF_USER'\)/);
  assert.match(migration, /not public\.is_super_admin\(manager\.user_id\)/);
  assert.doesNotMatch(migration, /read_at[^;]*now\(\)/);
  assert.doesNotMatch(source("app/api/email/open/[token]/route.ts"), /ORGANIZATION_USER_INVITATION_VERIFIED/);
});

test("canonical human identity repair follows safe priority and preserves meaningful names", () => {
  assert.deepEqual(
    resolvePendingInviteIdentityRepair({
      authEmail: "avery@example.com",
      profile: {
        email: "avery@example.com",
        first_name: "Avery",
        last_name: "Owner",
        display_name: "AVERY@example.com",
        title: null,
      },
      userMetadata: { display_name: "Metadata Alias" },
    }),
    {
      email: "avery@example.com",
      first_name: "Avery",
      last_name: "Owner",
      display_name: "Avery Owner",
      title: null,
    },
  );
  assert.equal(
    organizationUserDisplayName({
      email: "avery@example.com",
      first_name: "Avery",
      last_name: "Owner",
      display_name: "avery@example.com",
    }),
    "Avery Owner",
  );
  assert.equal(
    organizationUserDisplayName({
      email: "avery@example.com",
      first_name: "Avery",
      last_name: "Owner",
      display_name: "A. Owner",
    }),
    "A. Owner",
  );
  const metadataRepair = resolvePendingInviteIdentityRepair({
    authEmail: "avery@example.com",
    profile: {
      email: "avery@example.com",
      first_name: null,
      last_name: null,
      display_name: " ",
      title: null,
    },
    userMetadata: { first_name: "Avery", last_name: "Owner" },
  });
  assert.equal(metadataRepair?.display_name, "Avery Owner");
  assert.equal(metadataRepair?.first_name, "Avery");
  assert.equal(metadataRepair?.last_name, "Owner");
  assert.match(migration, /from auth\.users/);
  assert.match(migration, /lower\(trim\(profile\.display_name\)\) <> lower\(trim\(profile\.email\)\)/);
});

test("register and detail render human identity separately from email", () => {
  for (const page of [register, detail]) {
    assert.match(page, /profiles\(id,email,first_name,last_name,display_name/);
    assert.match(page, /organizationUserDisplayName/);
    assert.match(page, /profile\?\.email/);
  }
});

test("membership heading is authoritative and organization-specific", () => {
  assert.match(detail, /\.eq\("organization_id", access\.activeOrganization\.id\)/);
  assert.match(detail, /\{access\.activeOrganization\.name\} Membership/);
  assert.match(detail, /Access applies only to this organization\./);
  assert.doesNotMatch(detail, /Mimms|Fobbs/);
});

test("detail activation is visible only for an authorized VERIFIED target", () => {
  assert.match(detail, /canManageTarget/);
  assert.match(detail, /canConfigureOrganizationRole/);
  assert.match(detail, /membership\.status === "VERIFIED"/);
  assert.match(detail, /Verified — awaiting activation/);
  assert.match(detail, />\s*Activate User\s*</);
  assert.match(detail, /PendingSubmitButton[\s\S]*pendingLabel="Activating…"/);
  assert.doesNotMatch(detail, /membership\.status === "INVITED"[\s\S]{0,200}value="ACTIVATE"/);
});

test("register quick action reuses the lifecycle server action with duplicate-tap protection", () => {
  assert.match(register, /m\.status === "INVITED"[\s\S]*ResendInviteButton/);
  assert.match(register, /m\.status === "VERIFIED"/);
  assert.match(register, /canConfigureOrganizationRole/);
  assert.match(register, /action=\{transitionOrganizationMembershipAction\}/);
  assert.match(register, /name="returnTo" value="\/users"/);
  assert.match(register, /PendingSubmitButton[\s\S]*Activate/);
  assert.match(actions, /returnTo === "\/users"/);
  assert.match(actions, /supabase\.rpc\("transition_organization_membership"/);
  assert.match(actions, /revalidatePath\("\/users"\)/);
});

test("activation remains VERIFIED-only, audited, hierarchy-scoped, and role-cap protected", () => {
  assert.match(migration, /update of organization_id, role, is_active, status/);
  assert.match(migration, /new\.status = 'ACTIVE'/);
  assert.match(migration, /maximum active % memberships reached/);
  const lifecycle = source(
    "supabase/migrations/20260925150000_dm3oi_remove_public_user_role.sql",
  );
  assert.match(lifecycle, /when 'ACTIVATE'[\s\S]*membership\.status <> 'VERIFIED'/);
  assert.match(lifecycle, /when 'ACTIVATE' then 'ACTIVATED'/);
  assert.match(lifecycle, /actor_role = 'BUSINESS_ADMIN'[\s\S]*membership\.role not in \('STAFF_MANAGER', 'STAFF_USER'\)/);
});

test("existing communications read behavior and Customer Portal separation remain unchanged", () => {
  const communications = source("lib/data/communications-actions.ts");
  assert.match(communications, /set_notification_read_state/);
  assert.match(communications, /revalidatePath\("\/communications"\)/);
  assert.doesNotMatch(migration, /customer_portal_users|customer_portal_invitations/);
  assert.doesNotMatch(migration, /email_deliveries|opened_at/);
});
