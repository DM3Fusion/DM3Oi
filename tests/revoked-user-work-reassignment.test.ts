import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

test("revocation no longer requires operational work to be cleared first", () => {
  const migration = source(
    "supabase/migrations/20260927141000_dm3oi_revoked_user_work_reassignment.sql",
  );

  const transition =
    migration.match(
      /create or replace function public\.transition_organization_membership[\s\S]*?end\n\$\$;/,
    )?.[0] ?? "";

  assert.match(transition, /when 'REVOKE'/);
  assert.match(transition, /next_status := 'REVOKED'/);
  assert.doesNotMatch(transition, /ACTIVE_OPERATIONAL_RESPONSIBILITY/);
  assert.match(transition, /when 'ACTIVATE'[\s\S]*membership\.status <> 'VERIFIED'/);
  assert.match(transition, /organization_membership_events/);
});

test("revoked workload reassignment is tenant scoped and active-target only", () => {
  const migration = source(
    "supabase/migrations/20260927141000_dm3oi_revoked_user_work_reassignment.sql",
  );

  assert.match(migration, /reassign_revoked_member_work/);
  assert.match(migration, /membership\.status <> 'REVOKED'/);
  assert.match(migration, /m\.organization_id = membership\.organization_id/);
  assert.match(migration, /m\.status = 'ACTIVE'/);
  assert.match(migration, /m\.is_active/);
  assert.match(migration, /p\.is_active/);
  assert.match(migration, /replacement_user_id = membership\.user_id/);
  assert.match(migration, /public\.is_super_admin\(actor\)/);
  assert.match(migration, /actor_role = 'BUSINESS_OWNER'/);
  assert.match(migration, /actor_role = 'BUSINESS_ADMIN'/);
});

test("reassignment moves current work while preserving historical attribution", () => {
  const migration = source(
    "supabase/migrations/20260927141000_dm3oi_revoked_user_work_reassignment.sql",
  );

  assert.match(migration, /CASE_UNASSIGNED/);
  assert.match(migration, /CASE_ASSIGNED/);
  assert.match(migration, /TASK_ASSIGNED/);
  assert.match(migration, /ASSIGNMENT_CHANGED/);
  assert.match(migration, /REVOKED_USER_REASSIGNMENT/);

  assert.doesNotMatch(
    migration,
    /set\s+created_by_user_id\s*=/i,
  );
  assert.doesNotMatch(
    migration,
    /set\s+completed_by_user_id\s*=/i,
  );
  assert.doesNotMatch(
    migration,
    /set\s+actor_user_id\s*=/i,
  );
});

test("organization user detail exposes independent workload reassignment controls", () => {
  const page = source("app/users/[membershipId]/page.tsx");
  const actions = source("lib/data/organization-user-actions.ts");
  const repository = source("lib/data/organization-user-workload.ts");

  assert.match(page, /Reassign Work/);
  assert.match(page, /CASES/);
  assert.match(page, /TASKS/);
  assert.match(page, /SERVICE_REQUESTS/);
  assert.match(page, /reassignOrganizationUserWorkAction/);
  assert.match(page, /membership\.status === "REVOKED"/);
  assert.match(repository, /\.eq\("status", "ACTIVE"\)/);
  assert.match(repository, /\.neq\("user_id", userId\)/);
  assert.match(actions, /MANAGE_USERS/);
  assert.match(actions, /canConfigureOrganizationRole/);
  assert.match(actions, /reassign_revoked_member_work/);
});

test("SUPER_ADMIN permanent deletion reuses the existing guarded deletion engine from organization context", () => {
  const page = source("app/users/[membershipId]/page.tsx");
  const component = source("components/super-admin-user-delete.tsx");
  const platformActions = source("lib/data/platform-actions.ts");

  assert.match(page, /getPlatformUserDeletionEligibility/);
  assert.match(page, /SuperAdminUserDelete/);
  assert.match(page, /returnTo="\/users"/);
  assert.match(component, /deleteRevokedPlatformUserAction/);
  assert.match(platformActions, /getPlatformUserDeletionEligibility/);
  assert.match(platformActions, /admin\.auth\.admin\.deleteUser\(userId\)/);
  assert.match(platformActions, /returnTo=value\(form,"returnTo"\)==="\/users"/);
});
