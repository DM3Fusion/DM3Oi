import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const migrationPath =
  "supabase/migrations/20261015220000_dm3oi_membership_rpc_authorization_boundary.sql";
const migration = source(migrationPath);

const functionBody = (name: string, nextMarker: string) => {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf(nextMarker, start);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${name} must have a stable end marker`);
  return migration.slice(start, end);
};

const prepare = functionBody(
  "prepare_organization_membership_invitation",
  "alter function public.prepare_organization_membership_invitation",
);
const update = functionBody(
  "update_organization_membership",
  "alter function public.update_organization_membership",
);
const transition = functionBody(
  "transition_organization_membership",
  "alter function public.transition_organization_membership",
);
const invitationEvent = functionBody(
  "record_organization_membership_invitation_event",
  "alter function public.record_organization_membership_invitation_event",
);

test("membership RPCs use constrained security-definer execution", () => {
  for (const body of [prepare, update, transition, invitationEvent]) {
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
    assert.doesNotMatch(body, /(?<!public\.)organization_members\b/);
  }

  for (const signature of [
    /prepare_organization_membership_invitation\([\s\S]*?uuid,[\s\S]*?uuid,[\s\S]*?public\.application_role[\s\S]*?\)[\s\S]*?from public, anon, authenticated, service_role;[\s\S]*?to authenticated;/,
    /update_organization_membership\([\s\S]*?uuid,[\s\S]*?public\.application_role,[\s\S]*?boolean[\s\S]*?\)[\s\S]*?from public, anon, authenticated, service_role;[\s\S]*?to authenticated;/,
    /transition_organization_membership\(uuid, text\)[\s\S]*?from public, anon, authenticated, service_role;[\s\S]*?to authenticated;/,
    /record_organization_membership_invitation_event\(uuid, text\)[\s\S]*?from public, anon, authenticated, service_role;[\s\S]*?to authenticated;/,
  ]) {
    assert.match(migration, signature);
  }
});

test("invitation preparation enforces identity, tenant, lifecycle, and hierarchy boundaries", () => {
  assert.match(prepare, /actor uuid := auth\.uid\(\)/);
  assert.match(prepare, /organization\.status = 'ACTIVE'/);
  assert.match(prepare, /member\.status = 'ACTIVE'/);
  assert.match(prepare, /member\.is_active/);
  assert.match(prepare, /profile\.is_active/);
  assert.match(
    prepare,
    /has_effective_organization_permission\(\$1, 'MANAGE_USERS'\)/,
  );
  assert.match(
    prepare,
    /actor_role = 'BUSINESS_OWNER'[\s\S]*\$3 not in \('BUSINESS_ADMIN', 'STAFF_MANAGER', 'STAFF_USER'\)/,
  );
  assert.match(
    prepare,
    /actor_role = 'BUSINESS_ADMIN'[\s\S]*\$3 not in \('STAFF_MANAGER', 'STAFF_USER'\)/,
  );
  assert.match(prepare, /public\.is_super_admin\(\$2\)/);
  assert.match(prepare, /public\.platform_user_roles/);
  assert.match(prepare, /public\.customer_portal_users/);
  assert.match(prepare, /membership\.organization_id <> \$1/);
  assert.match(prepare, /membership\.status <> 'INVITED'/);
  assert.match(prepare, /values \(\$1, \$2, \$3, 'INVITED', false, null\)/);
  assert.doesNotMatch(prepare, /organization_membership_events/);
});

test("invitation preparation serializes retries and preserves one membership", () => {
  assert.match(prepare, /pg_advisory_xact_lock/);
  assert.match(prepare, /organization-membership-invitation:/);
  assert.match(prepare, /where member\.user_id = \$2[\s\S]*for update/);
  assert.doesNotMatch(prepare, /invited_at\s*=/);
  assert.match(
    source("supabase/migrations/20260925100000_dm3oi_single_organization_identity.sql"),
    /organization_members_one_organization_per_user_uidx[\s\S]*organization_members\(user_id\)/,
  );
});

test("role updates preserve super-admin access while constraining organization actors", () => {
  assert.match(update, /for update/);
  assert.match(update, /actor_is_super_admin := public\.is_super_admin\(actor\)/);
  assert.match(update, /if not actor_is_super_admin/);
  assert.match(update, /organization\.status = 'ACTIVE'/);
  assert.match(update, /profile\.is_active/);
  assert.match(update, /member\.status = 'ACTIVE'/);
  assert.match(update, /has_effective_organization_permission\([\s\S]*'MANAGE_USERS'/);
  assert.match(update, /changed\.user_id = actor/);
  assert.match(
    update,
    /changed\.role = 'BUSINESS_OWNER'[\s\S]*target_role = 'BUSINESS_OWNER'/,
  );
  assert.match(
    update,
    /actor_role = 'BUSINESS_ADMIN'[\s\S]*changed\.role not in \('STAFF_MANAGER', 'STAFF_USER'\)[\s\S]*target_role not in \('STAFF_MANAGER', 'STAFF_USER'\)/,
  );
  assert.match(update, /target_active <> changed\.is_active/);
  assert.match(update, /set[\s\S]*role = target_role,[\s\S]*updated_at = now\(\)/);
  assert.doesNotMatch(update, /set[\s\S]*is_active\s*=/);
});

test("lifecycle hardening retains current transitions, events, and work-reassignment behavior", () => {
  assert.match(transition, /if public\.is_super_admin\(actor\)/);
  assert.match(transition, /has_effective_organization_permission\([\s\S]*'MANAGE_USERS'/);
  assert.match(transition, /when 'ACTIVATE'[\s\S]*membership\.status <> 'VERIFIED'/);
  assert.match(transition, /when 'SUSPEND'[\s\S]*membership\.status <> 'ACTIVE'/);
  assert.match(transition, /when 'REACTIVATE'[\s\S]*membership\.status <> 'SUSPENDED'/);
  assert.match(transition, /when 'REVOKE'[\s\S]*next_status := 'REVOKED'/);
  assert.match(transition, /when 'REINSTATE'[\s\S]*Only SUPER_ADMIN/);
  assert.match(transition, /insert into public\.organization_membership_events/);
  assert.doesNotMatch(transition, /ACTIVE_OPERATIONAL_RESPONSIBILITY/);
});

test("invitation events cannot bypass effective permission, hierarchy, or event state", () => {
  assert.match(invitationEvent, /for share/);
  assert.match(invitationEvent, /if not public\.is_super_admin\(actor\)/);
  assert.match(
    invitationEvent,
    /has_effective_organization_permission\([\s\S]*'MANAGE_USERS'/,
  );
  assert.match(
    invitationEvent,
    /actor_role = 'BUSINESS_OWNER'[\s\S]*membership\.role = 'BUSINESS_OWNER'/,
  );
  assert.match(
    invitationEvent,
    /actor_role = 'BUSINESS_ADMIN'[\s\S]*membership\.role not in \('STAFF_MANAGER', 'STAFF_USER'\)/,
  );
  assert.match(invitationEvent, /'INVITATION_RESENT'[\s\S]*membership\.status <> 'INVITED'/);
  assert.match(invitationEvent, /'VERIFIED'[\s\S]*membership\.status <> 'VERIFIED'/);
  assert.match(invitationEvent, /insert into public\.organization_membership_events/);
});

test("database behavioral specification covers authorization and preserved invariants", () => {
  const specification = source(
    "supabase/tests/membership_rpc_authorization_boundary.sql",
  );
  for (const scenario of [
    "OWNER_INVITATION_HIERARCHY",
    "ADMIN_INVITATION_HIERARCHY",
    "STAFF_MUTATION_DENIAL",
    "EFFECTIVE_MANAGE_USERS_OVERRIDE",
    "CROSS_ORGANIZATION_DENIAL",
    "INVITATION_LIFECYCLE_RESTRICTIONS",
    "OWNER_TO_OWNER_DENIAL",
    "SELF_PROMOTION_DENIAL",
    "SUPER_ADMIN_COMPATIBILITY",
    "ROLE_HISTORY_PRESERVATION",
    "MEMBERSHIP_EVENT_PRESERVATION",
    "CAPACITY_PROTECTION",
  ]) {
    assert.match(specification, new RegExp(`SCENARIO: ${scenario}`));
  }
  assert.match(specification, /rollback;/);
});

test("stage 02A.2 uses membership RPCs while preserving staged cutover", () => {
  const invitation = source("lib/data/user-invitation-actions.ts");
  const organizationRoles = source("lib/data/organization-user-actions.ts");
  const platformActions = source("lib/data/platform-actions.ts");

  // Direct table privileges are removed only during the later cutover.
  assert.doesNotMatch(
    migration,
    /revoke\s+(insert|update|delete)[\s\S]*organization_members/i,
  );
  assert.doesNotMatch(migration, /drop policy/i);

  // Invitations must use the authorized RPC.
  assert.match(
    invitation,
    /session\.rpc\(\s*"prepare_organization_membership_invitation_v2"/,
  );
  assert.match(
    invitation,
    /completeOrganizationInvitation\(/,
  );
  assert.match(
    invitation,
    /recoverOrganizationInvitation\(/,
  );
  assert.match(
    invitation,
    /classifyInvitationDelivery\(/,
  );

  // No authenticated direct membership INSERT or UPDATE.
  assert.doesNotMatch(
    invitation,
    /session\s*\.from\("organization_members"\)[\s\S]{0,250}?\.(?:insert|update)\(/,
  );

  // Organization role changes must use the authorized RPC.
  assert.match(
    organizationRoles,
    /supabase\.rpc\(\s*"update_organization_membership"/,
  );
  assert.match(
    organizationRoles,
    /target_active:\s*membership\.is_active/,
  );
  assert.doesNotMatch(
    organizationRoles,
    /\.from\("organization_members"\)[\s\S]{0,250}?\.update\(\{\s*role\s*\}\)/,
  );

  // SUPER_ADMIN role updates continue using the existing RPC.
  assert.match(
    platformActions,
    /rpc\("update_organization_membership"/,
  );

  // Recovery must use the restricted service-role RPC, not table writes.
  const recovery = source(
    "lib/data/organization-invitation-recovery.ts",
  );

  assert.match(
    recovery,
    /admin\.rpc\(\s*"rollback_organization_membership_invitation"/,
  );
  assert.match(
    recovery,
    /admin\.rpc\(\s*"complete_organization_membership_invitation"/,
  );

  const organizationInvitation = invitation.slice(
    invitation.indexOf("export async function inviteOrganizationUserAction"),
    invitation.indexOf("export async function resendUserInviteAction"),
  );

  assert.doesNotMatch(
    organizationInvitation,
    /\.from\("organization_members"\)\s*\.(?:insert|update|delete)\s*\(/,
  );
  assert.doesNotMatch(
    organizationInvitation,
    /admin\.auth\.admin\.deleteUser\(/,
  );

  assert.match(
    source("lib/app-version.ts"),
    /APPLICATION_VERSION = "2\.0"/,
  );
});
