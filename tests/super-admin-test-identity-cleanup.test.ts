import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20261008170000_dm3oi_orphaned_test_identity_cleanup.sql",
);
const actions = source("lib/data/platform-actions.ts");
const page = source("app/admin/users/[userId]/page.tsx");
const globalDeletion = source(
  "lib/data/platform-user-global-deletion.ts",
);

test("targeted cleanup remains active SUPER_ADMIN only", () => {
  assert.match(migration, /not public\.is_super_admin\(actor\)/);
  assert.match(migration, /active SUPER_ADMIN authorization required/);
  assert.match(
    actions,
    /deleteOrphanedTestIdentityAction[\s\S]*requireSuperAdmin\(\)/,
  );
  assert.match(migration, /target_user_id = actor/);
});

test("cleanup is restricted to orphaned non-platform identities", () => {
  assert.match(
    migration,
    /from public\.organization_members[\s\S]*user_id = target_user_id/,
  );
  assert.match(
    migration,
    /from public\.platform_user_roles[\s\S]*user_id = target_user_id/,
  );
  assert.match(
    actions,
    /organization_members[\s\S]*\.eq\("user_id",userId\)/,
  );
});

test("cleanup is limited to Portal and Service Desk identity dependencies", () => {
  assert.match(migration, /delete from public\.customer_portal_users/);
  assert.match(migration, /update public\.service_requests/);
  assert.match(
    migration,
    /requester_user_id[\s\S]*assigned_user_id[\s\S]*created_by_user_id/,
  );
  assert.match(migration, /delete from public\.service_request_activity/);
  assert.match(migration, /delete from public\.service_request_messages/);
  assert.match(
    migration,
    /delete from public\.service_request_communications/,
  );

  assert.doesNotMatch(migration, /delete from public\.cases/i);
  assert.doesNotMatch(migration, /delete from public\.customers/i);
  assert.doesNotMatch(migration, /delete from auth\.users/i);
  assert.doesNotMatch(migration, /delete from public\.profiles/i);
});

test("forward fix detaches requester-bound Service Requests before deleting Portal access", () => {
  const forwardFix = source(
    "supabase/migrations/20261008180000_dm3oi_orphaned_test_identity_cleanup_fk_order.sql",
  );

  const serviceRequestUpdate = forwardFix.indexOf(
    "update public.service_requests request",
  );
  const portalDelete = forwardFix.indexOf(
    "delete from public.customer_portal_users portal_user",
  );

  assert.ok(serviceRequestUpdate >= 0);
  assert.ok(portalDelete > serviceRequestUpdate);

  assert.match(
    forwardFix,
    /requester_user_id = case[\s\S]*request\.requester_user_id = target_user_id then null/,
  );

  assert.match(
    forwardFix,
    /service_requests[\s\S]*customer_portal_users/,
  );
});

test("immutable Service Desk messages use the existing scoped deletion gate", () => {
  assert.match(
    migration,
    /dm3oi\.organization_reset_organization_id/,
  );
  assert.match(
    migration,
    /message\.organization_id = target_organization_id[\s\S]*message\.author_user_id = target_user_id/,
  );
});

test("UI exposes recovery only for the supported blocker set", () => {
  assert.match(page, /A Customer Portal identity exists\./);
  assert.match(page, /Service Desk history or responsibility exists\./);
  assert.match(page, /orphanDeletionEligibility\.blockers\.every/);
  assert.match(page, /Delete Test Identity/);

  assert.match(
    actions,
    /allowedCleanupBlockers=new Set\(\[[\s\S]*A Customer Portal identity exists\.[\s\S]*Service Desk history or responsibility exists\./,
  );
});

test("global fail-closed guard is re-run before Auth deletion", () => {
  const start = actions.indexOf(
    "export async function deleteOrphanedTestIdentityAction",
  );
  assert.ok(start >= 0);

  const action = actions.slice(start);

  const firstCheck = action.indexOf(
    "getGlobalUserDeletionEligibility(userId)",
  );
  const cleanup = action.indexOf(
    "super_admin_cleanup_orphaned_test_identity",
  );
  const secondCheck = action.indexOf(
    "getGlobalUserDeletionEligibility(userId)",
    firstCheck + 1,
  );
  const authDelete = action.indexOf(
    "admin.auth.admin.deleteUser(userId)",
  );

  assert.ok(firstCheck >= 0);
  assert.ok(cleanup > firstCheck);
  assert.ok(secondCheck > cleanup);
  assert.ok(authDelete > secondCheck);

  assert.match(
    globalDeletion,
    /Dependency checks could not be completed\./,
  );
});

test("identity-specific typed confirmation is required", () => {
  assert.match(
    actions,
    /expectedConfirmation=`DELETE TEST USER \$\{displayName\}`/,
  );
  assert.match(
    page,
    /testIdentityConfirmation = `DELETE TEST USER \$\{name\}`/,
  );
});
