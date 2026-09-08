import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyAccess,
  isOrganizationUserRole,
  organizationInvitationMetadata,
  ORGANIZATION_USER_ROLES,
} from "../lib/data/user-provisioning.ts";

test("only tenant-internal roles can be selected for organization provisioning", () => {
  assert.deepEqual(ORGANIZATION_USER_ROLES, [
    "BUSINESS_OWNER",
    "BUSINESS_ADMIN",
    "STAFF_MANAGER",
    "STAFF_USER",
  ]);
  assert.equal(isOrganizationUserRole("SUPER_ADMIN"), false);
  assert.equal(isOrganizationUserRole("PUBLIC_USER"), false);
});

test("an invited profile without assigned access remains Pending Access", () => {
  assert.equal(
    classifyAccess({
      platformAdmin: false,
      activeOrganizationMembership: false,
      activePortalAccess: false,
    }),
    "Pending Access",
  );
});

test("an active membership classifies the user as an Organization User", () => {
  assert.equal(
    classifyAccess({
      platformAdmin: false,
      activeOrganizationMembership: true,
      activePortalAccess: false,
    }),
    "Organization User",
  );
});

test("platform access remains distinct from organization membership", () => {
  assert.equal(
    classifyAccess({
      platformAdmin: true,
      activeOrganizationMembership: false,
      activePortalAccess: false,
    }),
    "Platform Admin",
  );
});

test("organization invitation metadata is display-only and additive", () => {
  assert.deepEqual(
    organizationInvitationMetadata(
      { display_name: "Casey User", setup_state: "INVITED" },
      "Mimms Tax Service",
    ),
    {
      display_name: "Casey User",
      setup_state: "INVITED",
      organization_name: "Mimms Tax Service",
    },
  );
});

test("Admin Auth credential is server-only and actions require SUPER_ADMIN", () => {
  const admin = readFileSync("lib/supabase/admin.ts", "utf8");
  const actions = readFileSync("lib/data/user-invitation-actions.ts", "utf8");
  assert.match(admin, /^import "server-only";/);
  assert.match(admin, /DM3IQCM_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(admin, /NEXT_PUBLIC_.*SERVICE_ROLE/);
  assert.equal((actions.match(/await requireSuperAdmin\(\)/g) ?? []).length, 4);
  assert.match(actions, /inviteUserByEmail/);
  assert.match(actions, /\.ilike\("email", email\)/);
  assert.match(actions, /listUsers/);
  assert.match(actions, /candidate\.email\?\.toLowerCase\(\) === email/);
  assert.match(actions, /\.eq\("status", "ACTIVE"\)/);
  assert.match(actions, /deleteUser\(userId\)/);
});

test("SUPER_ADMIN identity updates Auth email before synchronizing the profile", () => {
  const actions = readFileSync("lib/data/user-invitation-actions.ts", "utf8");
  const page = readFileSync("app/admin/users/[userId]/page.tsx", "utf8");
  const form = readFileSync("components/platform-identity-form.tsx", "utf8");
  assert.match(actions, /updateUserById\(userId, \{ email \}\)/);
  assert.match(actions, /Auth email updated but profile synchronization failed/);
  assert.match(actions, /\.ilike\("email", email\)/);
  assert.match(actions, /email,\n      is_active/);
  assert.match(page, /PlatformIdentityForm/);
  assert.match(form, /name="email"/);
  assert.match(form, /Save identity/);
  assert.match(form, /Changes Saved/);
  assert.match(form, /license-save-button/);
});

test("password and email-code login paths remain available", () => {
  const login = readFileSync("app/login/page.tsx", "utf8");
  assert.match(login, /signInAction/);
  assert.match(login, /sendLoginOtpAction/);
  assert.match(login, /verifyLoginOtpAction/);
});
