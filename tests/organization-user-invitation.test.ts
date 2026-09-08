import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assignableOrganizationUserRoles,
  organizationInvitationMetadata,
  organizationRoleLimit,
} from "../lib/data/user-provisioning.ts";
import {
  canInviteOrganizationUsers,
  hasPermission,
  type ApplicationRole,
} from "../lib/auth/permissions.ts";

const source = (path: string) => readFileSync(path, "utf8");
const usersPage = source("app/users/page.tsx");
const newUserPage = source("app/users/new/page.tsx");
const actions = source("lib/data/user-invitation-actions.ts");
const migration = source(
  "supabase/migrations/20260907133000_dm3oi_organization_user_management_hierarchy.sql",
);
const foundation = source(
  "supabase/migrations/20260903150000_dm3iqcm_data_foundation.sql",
);
const access = (role: ApplicationRole) => ({
  isSuperAdmin: role === "SUPER_ADMIN",
  internalAccess: role !== "PUBLIC_USER",
  activeOrganization: role === "PUBLIC_USER" ? null : { role },
});

test("Add User is limited to organization Owners and authorized Admins", () => {
  assert.match(usersPage, /canInviteOrganizationUsers\(context\)/);
  assert.match(usersPage, /href="\/users\/new"/);
  assert.match(usersPage, /\+ Add User/);
  assert.equal(hasPermission(access("BUSINESS_OWNER"), "MANAGE_USERS"), true);
  assert.equal(hasPermission(access("BUSINESS_ADMIN"), "MANAGE_USERS"), true);
  assert.equal(hasPermission(access("STAFF_MANAGER"), "MANAGE_USERS"), false);
  assert.equal(hasPermission(access("STAFF_USER"), "MANAGE_USERS"), false);
  assert.equal(canInviteOrganizationUsers(access("BUSINESS_OWNER")), true);
  assert.equal(canInviteOrganizationUsers(access("BUSINESS_ADMIN")), true);
  assert.equal(canInviteOrganizationUsers(access("STAFF_MANAGER")), false);
  assert.equal(canInviteOrganizationUsers(access("STAFF_USER")), false);
  assert.equal(canInviteOrganizationUsers(access("SUPER_ADMIN")), false);
});

test("role assignment follows the Owner and Admin hierarchy", () => {
  assert.deepEqual(assignableOrganizationUserRoles("BUSINESS_OWNER"), [
    "BUSINESS_OWNER",
    "BUSINESS_ADMIN",
    "STAFF_MANAGER",
    "STAFF_USER",
  ]);
  assert.deepEqual(assignableOrganizationUserRoles("BUSINESS_ADMIN"), [
    "STAFF_MANAGER",
    "STAFF_USER",
  ]);
  assert.deepEqual(assignableOrganizationUserRoles("STAFF_MANAGER"), []);
  assert.deepEqual(assignableOrganizationUserRoles("STAFF_USER"), []);
  assert.doesNotMatch(newUserPage, /SUPER_ADMIN|PUBLIC_USER/);
  assert.match(actions, /!assignableRoles\.includes\(role\)/);
});

test("active organization and current actor membership are derived server-side", () => {
  assert.match(actions, /const organization = access\?\.activeOrganization/);
  assert.match(actions, /\.eq\("organization_id", activeOrganization\.id\)/);
  assert.match(actions, /\.eq\("user_id", actorUser\.id\)/);
  assert.match(actions, /\.eq\("is_active", true\)/);
  assert.doesNotMatch(newUserPage, /name="organizationId"/);
  assert.doesNotMatch(actions.slice(actions.indexOf("export async function inviteOrganizationUserAction"), actions.indexOf("export async function resendUserInviteAction")), /value\(form, "organizationId"\)/);
});

test("effective permission and hierarchy are enforced by membership RLS", () => {
  assert.match(migration, /has_effective_organization_permission\([\s\S]*'MANAGE_USERS'/);
  assert.match(migration, /array\['BUSINESS_OWNER'\]::public\.application_role\[\]/);
  assert.match(migration, /role in \('STAFF_MANAGER', 'STAFF_USER'\)[\s\S]*array\['BUSINESS_ADMIN'\]/);
  assert.match(migration, /not public\.is_super_admin\(user_id\)/);
  assert.doesNotMatch(migration, /disable row level security|grant all/i);
});

test("limited roles are preflighted and remain trigger-enforced", () => {
  assert.equal(organizationRoleLimit("BUSINESS_OWNER"), 2);
  assert.equal(organizationRoleLimit("BUSINESS_ADMIN"), 2);
  assert.equal(organizationRoleLimit("STAFF_MANAGER"), null);
  assert.equal(organizationRoleLimit("STAFF_USER"), null);
  assert.match(newUserPage, /limit of \$\{limit\} reached/);
  assert.match(actions, /\.select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(actions, /\(count \?\? 0\) >= limit/);
  assert.match(foundation, /maximum active % memberships reached for organization/);
});

test("invitation reuses canonical Auth, profile, and membership infrastructure", () => {
  assert.match(actions, /inviteOrganizationUserAction/);
  assert.match(actions, /admin\.auth\.admin\.inviteUserByEmail/);
  assert.match(actions, /redirectTo: getInvitationRedirect\(\)/);
  assert.match(actions, /first_name: firstName/);
  assert.match(actions, /last_name: lastName/);
  assert.match(actions, /organization_name: activeOrganization\.name/);
  assert.match(actions, /\.from\("organization_members"\)/);
  assert.match(actions, /deleteUser\(userId\)|deleteUser\(targetUserId\)/);
  assert.match(actions, /revalidatePath\("\/users"\)/);
  assert.match(actions, /Invitation sent\./);
  assert.match(usersPage, /getInvitationEligibility/);
  assert.match(usersPage, /ResendInviteButton/);
});

test("organization invitation metadata preserves existing Auth data", () => {
  assert.deepEqual(
    organizationInvitationMetadata(
      {
        first_name: "Avery",
        last_name: "Owner",
        display_name: "Avery Owner",
        existing_key: "preserved",
      },
      "Authorized Organization",
    ),
    {
      first_name: "Avery",
      last_name: "Owner",
      display_name: "Avery Owner",
      existing_key: "preserved",
      organization_name: "Authorized Organization",
    },
  );
});

test("organization name is server-derived for initial and reissued invitations", () => {
  const organizationFlow = actions.slice(
    actions.indexOf("export async function inviteOrganizationUserAction"),
    actions.indexOf("export async function resendUserInviteAction"),
  );
  assert.match(
    organizationFlow,
    /organization_name: activeOrganization\.name/,
  );
  assert.match(
    organizationFlow,
    /organizationInvitationMetadata\([\s\S]*existingAuthUser\.user_metadata,[\s\S]*activeOrganization\.name/,
  );
  assert.doesNotMatch(organizationFlow, /value\(form, "organizationName"\)/);
  assert.doesNotMatch(newUserPage, /name="organizationName"/);
});

test("manual resend distinguishes organization and platform metadata", () => {
  const resendFlow = actions.slice(
    actions.indexOf("export async function resendUserInviteAction"),
    actions.indexOf("export async function getInvitationEligibility"),
  );
  assert.match(
    resendFlow,
    /const orgAdmin =[\s\S]*access\.activeOrganization\?\.id === organizationId[\s\S]*hasPermission\(access, "MANAGE_USERS"\)/,
  );
  assert.match(
    resendFlow,
    /const resendData = orgAdmin[\s\S]*organizationInvitationMetadata\([\s\S]*access\.activeOrganization!\.name[\s\S]*: targetUser\.user_metadata/,
  );
  assert.doesNotMatch(resendFlow, /value\(form, "organizationName"\)/);
});

test("form submission is duplicate-safe and errors remain sanitized", () => {
  assert.match(newUserPage, /PendingSubmitButton/);
  assert.match(newUserPage, /pendingLabel="Sending…"/);
  assert.match(newUserPage, /Send Invitation/);
  assert.match(newUserPage, /role="alert"/);
  assert.match(newUserPage, /href="\/users"/);
  assert.match(actions, /The invitation could not be sent\./);
  assert.doesNotMatch(newUserPage, /inviteError|profileError|membershipResult/);
  assert.match(actions, /\.from\("platform_user_roles"\)[\s\S]*"SUPER_ADMIN"/);
});
