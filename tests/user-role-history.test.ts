import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20261004120000_dm3oi_user_role_history.sql",
  "utf8",
);

const organizationActions = fs.readFileSync(
  "lib/data/organization-user-actions.ts",
  "utf8",
);

const platformActions = fs.readFileSync(
  "lib/data/platform-actions.ts",
  "utf8",
);

test("role history is a separate durable append-only audit surface", () => {
  assert.match(
    migration,
    /create table public\.user_role_history/,
  );

  assert.match(
    migration,
    /scope text not null[\s\S]*'ORGANIZATION'[\s\S]*'PLATFORM'/,
  );

  assert.match(
    migration,
    /event_type text not null[\s\S]*'BASELINE'[\s\S]*'ASSIGNED'[\s\S]*'CHANGED'[\s\S]*'REMOVED'/,
  );

  assert.doesNotMatch(
    migration,
    /subject_user_id uuid[^,\n]*references/,
  );

  assert.doesNotMatch(
    migration,
    /organization_id uuid[^,\n]*references/,
  );

  assert.doesNotMatch(
    migration,
    /membership_id uuid[^,\n]*references/,
  );

  assert.doesNotMatch(
    migration,
    /actor_user_id uuid[^,\n]*references/,
  );
});

test("organization role history records assignment change and removal at the table boundary", () => {
  assert.match(
    migration,
    /create trigger organization_members_role_history[\s\S]*after insert or update of role or delete[\s\S]*on public\.organization_members/,
  );

  assert.match(
    migration,
    /tg_op = 'INSERT'[\s\S]*target_event := 'ASSIGNED'/,
  );

  assert.match(
    migration,
    /tg_op = 'UPDATE'[\s\S]*old\.role is not distinct from new\.role[\s\S]*return new[\s\S]*target_event := 'CHANGED'/,
  );

  assert.match(
    migration,
    /tg_op = 'DELETE'[\s\S]*target_event := 'REMOVED'/,
  );

  assert.match(
    migration,
    /old_role := old\.role[\s\S]*next_role := new\.role/,
  );
});

test("role tracking covers both current organization mutation paths", () => {
  assert.match(
    organizationActions,
    /\.from\("organization_members"\)[\s\S]*\.update\(\{ role \}\)/,
  );

  assert.match(
    platformActions,
    /rpc\("update_organization_membership"[\s\S]*target_role:role/,
  );

  assert.match(
    migration,
    /on public\.organization_members[\s\S]*execute function public\.audit_organization_member_role\(\)/,
  );
});

test("membership lifecycle-only changes do not create organization role-history events", () => {
  assert.match(
    migration,
    /elsif tg_op = 'UPDATE' then[\s\S]*if old\.role is not distinct from new\.role then[\s\S]*return new/,
  );

  assert.doesNotMatch(
    migration,
    /target_event := 'SUSPENDED'/,
  );

  assert.doesNotMatch(
    migration,
    /target_event := 'REACTIVATED'/,
  );

  assert.doesNotMatch(
    migration,
    /target_event := 'REVOKED'/,
  );
});

test("platform SUPER_ADMIN history handles active assignment and removal", () => {
  assert.match(
    migration,
    /create trigger platform_user_roles_role_history[\s\S]*after insert or update of role, is_active or delete[\s\S]*on public\.platform_user_roles/,
  );

  assert.match(
    migration,
    /not old\.is_active and new\.is_active[\s\S]*target_event := 'ASSIGNED'/,
  );

  assert.match(
    migration,
    /old\.is_active and not new\.is_active[\s\S]*target_event := 'REMOVED'/,
  );

  assert.match(
    migration,
    /scope = 'PLATFORM'[\s\S]*coalesce\(prior_role, new_role\) = 'SUPER_ADMIN'/,
  );
});

test("existing access is represented as a truthful tracking baseline", () => {
  assert.match(
    migration,
    /'ORGANIZATION',[\s\S]*'BASELINE'[\s\S]*'TRACKING_BASELINE'/,
  );

  assert.match(
    migration,
    /from public\.organization_members membership/,
  );

  assert.match(
    migration,
    /'PLATFORM',[\s\S]*'BASELINE'[\s\S]*'TRACKING_BASELINE'/,
  );

  assert.match(
    migration,
    /from public\.platform_user_roles role_row[\s\S]*where role_row\.is_active/,
  );
});

test("role-history snapshots remain readable after source identities are removed", () => {
  assert.match(
    migration,
    /subject_display_name text/,
  );

  assert.match(
    migration,
    /subject_email text/,
  );

  assert.match(
    migration,
    /organization_name text/,
  );

  assert.match(
    migration,
    /actor_display_name text/,
  );

  assert.match(
    migration,
    /actor_email text/,
  );

  assert.match(
    migration,
    /snapshot_role_history_profile/,
  );
});

test("initial role-history table is RLS protected before the hardened read boundary", () => {
  assert.match(
    migration,
    /alter table public\.user_role_history enable row level security/,
  );

  assert.match(
    migration,
    /alter table public\.user_role_history force row level security/,
  );

  assert.match(
    migration,
    /revoke all[\s\S]*on table public\.user_role_history[\s\S]*from public, anon, authenticated, service_role/,
  );
});

test("normal users cannot directly mutate role-history rows", () => {
  assert.doesNotMatch(
    migration,
    /grant insert[\s\S]*user_role_history[\s\S]*authenticated/,
  );

  assert.doesNotMatch(
    migration,
    /grant update[\s\S]*user_role_history[\s\S]*authenticated/,
  );

  assert.doesNotMatch(
    migration,
    /grant delete[\s\S]*user_role_history[\s\S]*authenticated/,
  );

  assert.match(
    migration,
    /security definer[\s\S]*audit_organization_member_role/,
  );

  assert.match(
    migration,
    /security definer[\s\S]*audit_platform_user_role/,
  );
});

const privacyMigration = fs.readFileSync(
  "supabase/migrations/20261004121000_dm3oi_user_role_history_read_privacy.sql",
  "utf8",
);

test("role-history direct reads are replaced with narrow RPC boundaries", () => {
  assert.match(
    privacyMigration,
    /revoke select[\s\S]*on table public\.user_role_history[\s\S]*from authenticated/,
  );

  assert.match(
    privacyMigration,
    /drop policy if exists user_role_history_read/,
  );

  assert.match(
    privacyMigration,
    /create or replace function public\.get_organization_user_role_history/,
  );

  assert.match(
    privacyMigration,
    /create or replace function public\.get_platform_user_role_history/,
  );

  assert.doesNotMatch(
    privacyMigration,
    /grant select[\s\S]*user_role_history[\s\S]*authenticated/,
  );
});

test("organization role-history RPC is limited to active Owner Admin or SUPER_ADMIN", () => {
  assert.match(
    privacyMigration,
    /public\.is_super_admin\(actor\)/,
  );

  assert.match(
    privacyMigration,
    /membership\.organization_id = target_organization_id/,
  );

  assert.match(
    privacyMigration,
    /membership\.user_id = actor/,
  );

  assert.match(
    privacyMigration,
    /membership\.is_active/,
  );

  assert.match(
    privacyMigration,
    /membership\.status = 'ACTIVE'/,
  );

  assert.match(
    privacyMigration,
    /membership\.role in \([\s\S]*'BUSINESS_OWNER'[\s\S]*'BUSINESS_ADMIN'/,
  );
});

test("organization role history masks historical platform actors", () => {
  assert.match(
    privacyMigration,
    /actor_was_super_admin boolean not null default false/,
  );

  assert.match(
    privacyMigration,
    /create trigger user_role_history_actor_scope/,
  );

  assert.match(
    privacyMigration,
    /public\.is_super_admin\(new\.actor_user_id\)/,
  );

  assert.match(
    privacyMigration,
    /when history\.actor_was_super_admin and not actor_is_super[\s\S]*then null/,
  );

  assert.match(
    privacyMigration,
    /history\.actor_was_super_admin,[\s\S]*history\.created_at/,
  );
});

test("complete cross-scope history remains SUPER_ADMIN-only", () => {
  assert.match(
    privacyMigration,
    /create or replace function public\.get_platform_user_role_history/,
  );

  assert.match(
    privacyMigration,
    /if actor is null[\s\S]*or not public\.is_super_admin\(actor\)[\s\S]*raise exception 'not authorized'/,
  );

  assert.match(
    privacyMigration,
    /where history\.subject_user_id = target_user_id/,
  );

  assert.match(
    privacyMigration,
    /order by history\.created_at desc, history\.id desc/,
  );
});

const roleHistoryRepository = fs.readFileSync(
  "lib/data/user-role-history.ts",
  "utf8",
);

const organizationUserPage = fs.readFileSync(
  "app/users/[membershipId]/page.tsx",
  "utf8",
);

const platformUserPage = fs.readFileSync(
  "app/admin/users/[userId]/page.tsx",
  "utf8",
);

test("application reads role history only through the hardened RPCs", () => {
  assert.match(
    roleHistoryRepository,
    /get_organization_user_role_history/,
  );

  assert.match(
    roleHistoryRepository,
    /get_platform_user_role_history/,
  );

  assert.doesNotMatch(
    roleHistoryRepository,
    /\.from\("user_role_history"\)/,
  );
});

test("organization user detail shows organization-scoped role history", () => {
  assert.match(
    organizationUserPage,
    /getOrganizationUserRoleHistory\(/,
  );

  assert.match(
    organizationUserPage,
    /<h2>Role History<\/h2>/,
  );

  assert.match(
    organizationUserPage,
    /formatOrganizationDateTime\(/,
  );

  assert.match(
    organizationUserPage,
    /roleHistoryEventDescription\(event, access\.isSuperAdmin\)/,
  );
});

test("platform user detail shows complete cross-scope role history", () => {
  assert.match(
    platformUserPage,
    /getPlatformUserRoleHistory\(user\.id\)/,
  );

  assert.match(
    platformUserPage,
    /event\.scope === "PLATFORM"/,
  );

  assert.match(
    platformUserPage,
    /"DM3Oi Platform"/,
  );

  assert.match(
    platformUserPage,
    /formatPlatformDateTime\(event\.createdAt\)/,
  );
});

test("role-history copy distinguishes baseline change assignment and removal", () => {
  assert.match(
    roleHistoryRepository,
    /Role present when Role History tracking began\./,
  );

  assert.match(
    roleHistoryRepository,
    /row\.eventType === "CHANGED"/,
  );

  assert.match(
    roleHistoryRepository,
    /row\.eventType === "ASSIGNED"/,
  );

  assert.match(
    roleHistoryRepository,
    /row\.eventType === "REMOVED"/,
  );

  assert.match(
    roleHistoryRepository,
    /row\.actorIsPlatform && !platformViewer[\s\S]*`\$\{verb\} by \$\{ORGANIZATION_SUPPORT_IDENTITY\}`/,
  );
  assert.match(roleHistoryRepository, /row\.actorIsPlatform \? "DM3Oi Platform" : "System"/);
  assert.match(
    fs.readFileSync("lib/auth/platform-privacy.ts", "utf8"),
    /ORGANIZATION_SUPPORT_IDENTITY = "DM3Oi Sys Support"/,
  );
});
