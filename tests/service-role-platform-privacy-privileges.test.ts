import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20260907093000_dm3oi_fix_service_role_privileges.sql",
);
const privacyRepository = source("lib/data/platform-privacy.ts");
const identityCategory = source("lib/auth/identity-category.ts");
const invitations = source("lib/data/user-invitation-actions.ts");
const organizationPrivacy = source(
  "supabase/migrations/20260906120000_dm3oi_organization_role_permissions.sql",
);
const projectionFix = source(
  "supabase/migrations/20260907090000_dm3oi_fix_organization_projection_function_grants.sql",
);
const profilePrivileges = source(
  "supabase/migrations/20260904040000_dm3iqcm_service_role_profile_provisioning.sql",
);
const portalPrivileges = source(
  "supabase/migrations/20260904170000_dm3iqcm_service_role_portal_read_privileges.sql",
);
const communicationPrivileges = source(
  "supabase/migrations/20260904200000_dm3iqcm_service_request_communications_service_role.sql",
);
const notificationPrivileges = source(
  "supabase/migrations/20260904210000_dm3iqcm_service_request_notification_read_privileges.sql",
);

test("service role receives only the platform-role columns used by trusted server paths", () => {
  assert.match(
    migration,
    /grant select \(id, user_id, role, is_active\)\s+on table public\.platform_user_roles\s+to service_role/,
  );
  assert.match(
    migration,
    /revoke select on table public\.platform_user_roles from service_role/,
  );
  assert.match(
    migration,
    /revoke select \(created_at, updated_at\) on table public\.platform_user_roles from service_role/,
  );
  assert.doesNotMatch(migration, /grant (?:all|select) on (?:table )?public\.platform_user_roles/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|truncate|references|trigger)/);
});

test("platform-role service reads are server-only and use no columns beyond the grant", () => {
  assert.match(privacyRepository, /^import "server-only";/);
  assert.match(privacyRepository, /createAdminClient\(\)[\s\S]*\.select\("user_id"\)[\s\S]*\.eq\("role", "SUPER_ADMIN"\)[\s\S]*\.eq\("is_active", true\)/);
  assert.match(identityCategory, /\.select\("id"\)\.eq\("user_id", userId\)\.eq\("role", "SUPER_ADMIN"\)\.eq\("is_active", true\)/);
  for (const line of invitations.matchAll(/admin\.from\("platform_user_roles"\)([^\n]+)/g)) {
    assert.match(line[1], /\.select\("id"\)/);
    assert.match(line[1], /\.eq\("user_id",/);
    assert.match(line[1], /\.eq\("role", "SUPER_ADMIN"\)/);
    assert.match(line[1], /\.eq\("is_active", true\)/);
  }
  assert.equal(
    [...invitations.matchAll(/admin\.from\("platform_user_roles"\)/g)].length,
    2,
  );
});

test("sibling trusted repository dependencies retain their existing narrow grants", () => {
  assert.match(
    profilePrivileges,
    /grant select, insert, update\s+on table public\.profiles\s+to service_role/,
  );
  assert.match(
    portalPrivileges,
    /grant select on public\.organizations, public\.customers, public\.organization_settings to service_role/,
  );
  assert.match(
    communicationPrivileges,
    /grant select, insert, update\s+on public\.service_request_communications\s+to service_role/,
  );
  assert.match(
    notificationPrivileges,
    /grant select\s+on public\.service_requests,\s+public\.customer_portal_users,\s+public\.organization_members\s+to service_role/,
  );
  assert.doesNotMatch(
    organizationPrivacy,
    /revoke[^;]+from[^;]*service_role/i,
  );
});

test("the hotfix grants no organization-facing role access", () => {
  assert.match(
    migration,
    /revoke all privileges on table public\.platform_user_roles from public, anon/,
  );
  assert.doesNotMatch(migration, /to (?:authenticated|anon|public)\b/i);
  const grants = migration
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.startsWith("grant "));
  assert.equal(grants.length, 1);
  assert.match(grants[0], /to service_role$/);
});

test("organization projections and platform actor masking remain intact", () => {
  assert.match(
    organizationPrivacy,
    /create view public\.organization_cases with \(security_barrier=true\)/,
  );
  assert.match(
    organizationPrivacy,
    /revoke select on public\.cases,public\.case_activity,public\.case_tasks,public\.customers,public\.question_definitions,[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    projectionFix,
    /not public\.is_super_admin\(auth\.uid\(\)\) and public\.is_super_admin\(target_actor\) then null/,
  );
  assert.match(projectionFix, /then 'DM3Oi Sys Support'/);
  assert.doesNotMatch(
    migration,
    /public\.(?:cases|case_activity|case_tasks|customers|question_definitions|service_requests|service_request_activity|service_request_messages|service_request_communications)/,
  );
});

test("platform audit remains callable only through its SUPER ADMIN guard", () => {
  assert.match(
    organizationPrivacy,
    /function public\.get_platform_operational_actor_audit[\s\S]*if not public\.is_super_admin\(auth\.uid\(\)\) then raise exception 'not authorized'/,
  );
  assert.doesNotMatch(migration, /get_platform_operational_actor_audit/);
  assert.doesNotMatch(migration, /create policy|alter table .* disable row level security/i);
});
