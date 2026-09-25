import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20260925160000_dm3oi_super_admin_organization_reset.sql",
);

const cleanupMigration = source(
  "supabase/migrations/20260925170000_dm3oi_complete_organization_reset_identity_cleanup.sql",
);

const resetAction = source("lib/data/platform-actions.ts");
const globalDeletion = source(
  "lib/data/platform-user-global-deletion.ts",
);

test("organization reset RPCs are active-SUPER_ADMIN gated and narrowly executable", () => {
  assert.match(
    migration,
    /create or replace function public\.preview_organization_reset\([\s\S]*?security definer[\s\S]*?set search_path = ''/,
  );
  assert.match(
    migration,
    /create or replace function public\.reset_organization_company_and_users\([\s\S]*?security definer[\s\S]*?set search_path = ''/,
  );

  const gates =
    migration.match(
      /if actor is null or not public\.is_super_admin\(actor\) then/g,
    ) ?? [];

  assert.equal(gates.length, 2);

  assert.match(
    migration,
    /revoke all on function public\.preview_organization_reset\(uuid, uuid\)[\s\S]*?from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.preview_organization_reset\(uuid, uuid\)[\s\S]*?to authenticated/,
  );
  assert.match(
    migration,
    /revoke all on function public\.reset_organization_company_and_users\(uuid, uuid, text\)[\s\S]*?from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.reset_organization_company_and_users\(uuid, uuid, text\)[\s\S]*?to authenticated/,
  );

  const resetExecuteGrants =
    migration.match(
      /grant execute on function public\.(?:preview_organization_reset|reset_organization_company_and_users)\([^;]+;/gi,
    ) ?? [];

  assert.equal(resetExecuteGrants.length, 2);

  for (const grant of resetExecuteGrants) {
    assert.match(grant, /to authenticated\s*;/i);
    assert.doesNotMatch(grant, /to (?:anon|public|service_role)\s*;/i);
  }
});

test("reset requires exact organization confirmation and an active BUSINESS_OWNER to preserve", () => {
  assert.match(
    migration,
    /confirmation_text <> \('RESET ' \|\| organization_record\.name\)/,
  );

  const ownerContract =
    /organization_id = target_organization_id[\s\S]*?user_id = preserved_owner_user_id[\s\S]*?role = 'BUSINESS_OWNER'::public\.application_role[\s\S]*?status = 'ACTIVE'[\s\S]*?is_active = true/;

  const ownerChecks = migration.match(
    new RegExp(ownerContract.source, "g"),
  ) ?? [];

  assert.ok(
    ownerChecks.length >= 2,
    "preview and reset must both validate the preserved active BUSINESS_OWNER",
  );

  assert.match(
    migration,
    /delete from public\.organization_members[\s\S]*?organization_id = target_organization_id[\s\S]*?user_id <> preserved_owner_user_id/,
  );
});

test("service request message immutability exception is organization scoped and immediately cleared", () => {
  assert.match(
    migration,
    /current_setting\(\s*'dm3oi\.organization_reset_organization_id',\s*true\s*\) = old\.organization_id::text[\s\S]*?public\.is_super_admin\(auth\.uid\(\)\)/,
  );

  assert.match(
    migration,
    /set_config\(\s*'dm3oi\.organization_reset_organization_id',\s*target_organization_id::text,\s*true\s*\)[\s\S]*?delete from public\.service_request_messages[\s\S]*?set_config\(\s*'dm3oi\.organization_reset_organization_id',\s*'',\s*true\s*\)/,
  );

  assert.doesNotMatch(
    migration,
    /current_setting\('dm3oi\.organization_reset', true\)/,
  );
  assert.doesNotMatch(migration, /disable trigger|enable trigger/i);
});

test("reset records actual row counts for every destructive statement", () => {
  const deleteStatements =
    migration.match(/delete from public\.[a-z0-9_]+/gi) ?? [];
  const rowCounts =
    migration.match(/get diagnostics deleted_count = row_count;/gi) ?? [];

  assert.equal(deleteStatements.length, 21);
  assert.equal(rowCounts.length, 21);

  const expectedKeys = [
    "serviceRequestCommunications",
    "serviceRequestActivity",
    "serviceRequestMessages",
    "serviceRequests",
    "caseActivity",
    "caseQuestionResponses",
    "caseQuestions",
    "caseAssignments",
    "caseTasks",
    "cases",
    "customerPortalUsers",
    "customers",
    "notifications",
    "membershipEvents",
    "organizationUsersRemoved",
    "caseNumberCounters",
    "customerAnnualNumberCounters",
    "customerNumberCounters",
    "serviceRequestAnnualNumberCounters",
    "analyticsLiveSessions",
    "analyticsPageViews",
  ];

  for (const key of expectedKeys) {
    assert.match(
      migration,
      new RegExp(
        `jsonb_build_object\\('${key}',\\s*deleted_count\\)`,
      ),
      `missing actual deletion count for ${key}`,
    );
  }
});

test("reset preview includes all transactional counters", () => {
  for (const key of [
    "caseNumberCounters",
    "customerAnnualNumberCounters",
    "customerNumberCounters",
    "serviceRequestAnnualNumberCounters",
  ]) {
    assert.match(
      migration,
      new RegExp(`'${key}'`),
      `preview must include ${key}`,
    );
  }
});

test("reset preserves organization configuration and global identities", () => {
  const preservedTables = [
    "organizations",
    "organization_settings",
    "organization_case_types",
    "organization_lifecycle_statuses",
    "organization_role_permissions",
    "organization_licenses",
    "organization_license_events",
    "question_definitions",
    "question_options",
    "rule_definitions",
    "rule_actions",
    "public_landing_page_drafts",
    "public_landing_page_versions",
    "public_landing_page_publications",
    "public_landing_page_publication_history",
  ];

  for (const table of preservedTables) {
    assert.doesNotMatch(
      migration,
      new RegExp(`delete from public\\.${table}(?:\\s|;|$)`, "i"),
      `reset must preserve ${table}`,
    );
  }

  assert.doesNotMatch(migration, /delete from auth\./i);
  assert.doesNotMatch(migration, /delete from public\.profiles/i);
  assert.doesNotMatch(migration, /\btruncate\b/i);
  assert.doesNotMatch(migration, /\bdrop table\b/i);
});

test("reset audit is durable, read-only to authenticated callers, and SUPER_ADMIN visible", () => {
  assert.match(
    migration,
    /create table if not exists public\.platform_organization_reset_audit/,
  );
  assert.match(
    migration,
    /preserved_owner_user_id uuid not null/,
  );
  assert.match(migration, /actor_user_id uuid not null/);

  assert.doesNotMatch(
    migration,
    /preserved_owner_user_id uuid[^,\n]*references public\.profiles/i,
  );
  assert.doesNotMatch(
    migration,
    /actor_user_id uuid[^,\n]*references public\.profiles/i,
  );

  assert.match(
    migration,
    /alter table public\.platform_organization_reset_audit enable row level security/,
  );
  assert.match(
    migration,
    /using \(public\.is_super_admin\(auth\.uid\(\)\)\)/,
  );
  assert.match(
    migration,
    /revoke all on table public\.platform_organization_reset_audit[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select on table public\.platform_organization_reset_audit to authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete|all).*platform_organization_reset_audit.*authenticated/i,
  );

  assert.match(
    migration,
    /insert into public\.platform_organization_reset_audit[\s\S]*?deleted_counts[\s\S]*?counts/,
  );
});

test("SUPER_ADMIN reset UI uses preview, explicit owner selection, and typed confirmation", () => {
  const component = source("components/super-admin-organization-reset.tsx");
  const action = source("lib/data/platform-actions.ts");
  const page = source("app/admin/organizations/[organizationId]/page.tsx");

  assert.match(component, /RESET/);
  assert.match(component, /preservedOwner/i);
  assert.match(component, /preview/i);

  assert.match(action, /preview_organization_reset/);
  assert.match(action, /reset_organization_company_and_users/);

  assert.match(
    page,
    /SuperAdminOrganizationReset/,
  );
});


test("complete reset captures identity candidates without deleting Auth or profiles in SQL", () => {
  assert.match(
    cleanupMigration,
    /'identityCleanupCandidates'/,
  );
  assert.match(
    cleanupMigration,
    /'identityCleanupCandidateUserIds'/,
  );
  assert.match(
    cleanupMigration,
    /'resetAuditId'/,
  );

  assert.doesNotMatch(cleanupMigration, /delete\s+from\s+auth\./i);
  assert.doesNotMatch(
    cleanupMigration,
    /delete\s+from\s+public\.profiles/i,
  );
});

test("identity cleanup audit can only be finalized by the service role", () => {
  assert.match(
    cleanupMigration,
    /create or replace function public\.complete_organization_reset_identity_cleanup/,
  );
  assert.match(
    cleanupMigration,
    /if auth\.role\(\) <> 'service_role' then/,
  );
  assert.match(
    cleanupMigration,
    /grant execute on function public\.complete_organization_reset_identity_cleanup\([\s\S]*?\) to service_role;/,
  );
  assert.doesNotMatch(
    cleanupMigration,
    /grant execute on function public\.complete_organization_reset_identity_cleanup\([\s\S]*?\) to authenticated;/,
  );
});

test("complete reset performs fail-closed global eligibility before Auth deletion", () => {
  assert.match(
    resetAction,
    /getGlobalUserDeletionEligibility/,
  );
  assert.match(
    resetAction,
    /admin\.auth\.admin\.deleteUser\(userId\)/,
  );
  assert.match(
    resetAction,
    /complete_organization_reset_identity_cleanup/,
  );

  assert.match(
    globalDeletion,
    /Another organization membership exists\./,
  );
  assert.match(
    globalDeletion,
    /A platform administrator role exists\./,
  );
  assert.match(
    globalDeletion,
    /A Customer Portal identity exists\./,
  );
  assert.match(
    globalDeletion,
    /Dependency checks could not be completed\./,
  );
});

test("reset UI describes complete test-identity cleanup and previews candidate count", () => {
  const component = source(
    "components/super-admin-organization-reset.tsx",
  );

  assert.match(component, /identityCleanupCandidates/);
  assert.match(
    component,
    /Test identities evaluated for permanent cleanup/,
  );
  assert.match(
    component,
    /permanent removal from DM3Oi and Supabase Auth/,
  );
  assert.doesNotMatch(
    component,
    /not automatically deleted from\s+Supabase Auth/,
  );
});


test("reset identity cleanup has a durable retry and reconciliation path", () => {
  const component = source(
    "components/super-admin-organization-reset.tsx",
  );
  const page = source(
    "app/admin/organizations/[organizationId]/page.tsx",
  );

  assert.match(
    resetAction,
    /retryOrganizationResetIdentityCleanupAction/,
  );
  assert.match(
    resetAction,
    /admin\.auth\.admin\.getUserById\(userId\)/,
  );
  assert.match(
    resetAction,
    /from\("profiles"\)[\s\S]*?\.eq\("id",userId\)[\s\S]*?\.maybeSingle\(\)/,
  );
  assert.match(
    resetAction,
    /previouslyDeletedUserIds/,
  );
  assert.match(
    resetAction,
    /previouslyRetainedUserIds/,
  );
  assert.match(
    resetAction,
    /if\(previouslyRetained\.has\(userId\)\)[\s\S]*?retainedUserIds\.push\(userId\)[\s\S]*?continue/,
  );
  assert.match(
    resetAction,
    /\["PENDING","PARTIAL"\]/,
  );
  assert.match(
    resetAction,
    /finalizeOrganizationResetIdentityCleanup/,
  );

  assert.match(
    component,
    /Retry Identity Cleanup/,
  );
  assert.match(
    component,
    /retryOrganizationResetIdentityCleanupAction/,
  );
  assert.match(
    page,
    /retryResetAuditId=\{query\.resetAuditId\}/,
  );
});
