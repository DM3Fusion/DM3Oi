import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const migration = read(
  "supabase/migrations/20260925180000_dm3oi_super_admin_permanent_organization_delete.sql",
);
const actions = read("lib/data/platform-actions.ts");
const detailPage = read(
  "app/admin/organizations/[organizationId]/page.tsx",
);
const organizationsPage = read("app/admin/organizations/page.tsx");
const deleteComponent = read(
  "components/super-admin-organization-delete.tsx",
);
const trialDetail = read(
  "app/admin/trial-requests/[requestId]/page.tsx",
);
const trialNewOrganization = read(
  "app/admin/organizations/new/page.tsx",
);
const globalDeletion = read(
  "lib/data/platform-user-global-deletion.ts",
);
const avatar = read("lib/profile/avatar.ts");

test("permanent organization deletion is active SUPER_ADMIN only", () => {
  assert.match(
    migration,
    /not public\.is_super_admin\(actor\)/,
  );
  assert.match(
    migration,
    /active SUPER_ADMIN authorization required/,
  );

  assert.match(
    migration,
    /grant execute on function public\.preview_permanent_organization_deletion\(uuid\)\s+to authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.permanently_delete_organization\(uuid, text\)\s+to authenticated;/,
  );

  assert.match(
    actions,
    /export async function permanentlyDeleteOrganizationAction/,
  );
  assert.match(
    actions,
    /const access=await requireSuperAdmin\(\)/,
  );
});

test("permanent deletion requires exact organization-name confirmation", () => {
  assert.match(
    migration,
    /confirmation is distinct from \('DELETE ' \|\| organization_record\.name\)/,
  );
  assert.match(
    actions,
    /const expectedConfirmation=`DELETE \$\{organization\.data\.name\}`/,
  );
  assert.match(
    deleteComponent,
    /DELETE \$\{organizationName\}/,
  );
});

test("server revalidates immediately before permanent mutation", () => {
  assert.match(
    migration,
    /Revalidate immediately before mutation/,
  );
  assert.match(
    migration,
    /perform public\.preview_permanent_organization_deletion\(\s*target_organization_id\s*\)/,
  );
});

test("deletion audit survives organization deletion without organization FK", () => {
  assert.match(
    migration,
    /alter table public\.platform_organization_reset_audit\s+drop constraint if exists platform_organization_reset_audit_organization_id_fkey/,
  );

  assert.match(
    migration,
    /create table if not exists public\.platform_organization_deletion_audit/,
  );
  assert.match(
    migration,
    /deleted_organization_id uuid not null/,
  );
  assert.match(
    migration,
    /organization_name text not null/,
  );
  assert.match(
    migration,
    /organization_slug text not null/,
  );

  const deletionAuditDefinition =
    migration.match(
      /create table if not exists public\.platform_organization_deletion_audit[\s\S]*?\n\);/,
    )?.[0] ?? "";

  assert.doesNotMatch(
    deletionAuditDefinition,
    /references public\.organizations/,
  );
});

test("converted Trial Request history survives organization deletion", () => {
  assert.match(
    migration,
    /converted_organization_deleted_id uuid/,
  );
  assert.match(
    migration,
    /converted_organization_deleted_name text/,
  );
  assert.match(
    migration,
    /converted_organization_deleted_slug text/,
  );

  assert.match(
    migration,
    /converted_organization_deleted_id = organization_record\.id/,
  );
  assert.match(
    migration,
    /converted_organization_deleted_name = organization_record\.name/,
  );
  assert.match(
    migration,
    /converted_organization_deleted_slug = organization_record\.slug/,
  );
  assert.match(
    migration,
    /converted_organization_id = null/,
  );

  assert.match(
    migration,
    /converted_organization_id is not null\s+and converted_organization_deleted_id is null\s+and converted_organization_deleted_name is null\s+and converted_organization_deleted_slug is null/,
  );
  assert.match(
    migration,
    /converted_organization_id is null\s+and converted_organization_deleted_id is not null\s+and converted_organization_deleted_name is not null\s+and converted_organization_deleted_slug is not null/,
  );

  assert.match(
    trialDetail,
    /converted_organization_deleted_id/,
  );
  assert.match(
    trialDetail,
    /converted_organization_deleted_name/,
  );
  assert.match(
    trialDetail,
    /converted_organization_deleted_slug/,
  );
  assert.match(
    trialDetail,
    /permanently deleted/i,
  );
});

test("historical converted Trial Requests cannot re-enter organization conversion", () => {
  assert.match(
    trialNewOrganization,
    /candidate\.status !== "QUALIFIED"/,
  );

  const currentConversionMigration = read(
    "supabase/migrations/20260925130000_dm3oi_trial_conversion_license.sql",
  );

  assert.match(
    currentConversionMigration,
    /if item\.status = 'CONVERTED' then/,
  );
  assert.match(
    currentConversionMigration,
    /trial request already converted/,
  );
  assert.match(
    currentConversionMigration,
    /item\.converted_at is not null/,
  );
});

test("identity candidates are captured before relationships are removed and exclude actor", () => {
  const candidateMatches =
    migration.match(/where candidate\.user_id <> actor;/g) ?? [];

  assert.ok(
    candidateMatches.length >= 2,
    "preview and execution must both exclude the acting SUPER_ADMIN",
  );

  assert.match(
    migration,
    /from public\.organization_members om[\s\S]*?union[\s\S]*?from public\.customer_portal_users cpu/,
  );

  assert.match(
    actions,
    /getGlobalUserDeletionEligibility/,
  );
  assert.match(
    actions,
    /admin\.auth\.admin\.deleteUser\(userId\)/,
  );

  assert.match(
    globalDeletion,
    /eligible/,
  );
});

test("database migration never directly deletes Auth or profile identities", () => {
  assert.doesNotMatch(
    migration,
    /delete\s+from\s+auth\.users/i,
  );
  assert.doesNotMatch(
    migration,
    /delete\s+from\s+public\.profiles/i,
  );
});

test("organization-owned operational data is explicitly purged before organization row", () => {
  const organizationDelete =
    migration.indexOf("delete from public.organizations");
  assert.ok(organizationDelete > 0);

  const requiredDeletes = [
    "delete from public.service_request_communications",
    "delete from public.service_request_activity",
    "delete from public.service_request_messages",
    "delete from public.service_requests",
    "delete from public.case_activity",
    "delete from public.case_question_responses",
    "delete from public.case_questions",
    "delete from public.case_assignments",
    "delete from public.case_tasks",
    "delete from public.cases",
    "delete from public.customer_portal_users",
    "delete from public.customers",
    "delete from public.rule_actions",
    "delete from public.rule_definitions",
    "delete from public.question_options",
    "delete from public.question_definitions",
    "delete from public.organization_membership_events",
    "delete from public.analytics_live_sessions",
    "delete from public.analytics_page_views",
  ];

  for (const statement of requiredDeletes) {
    const position = migration.indexOf(statement);
    assert.ok(position >= 0, `missing explicit purge: ${statement}`);
    assert.ok(
      position < organizationDelete,
      `${statement} must occur before organization deletion`,
    );
  }
});

test("immutable Service Desk messages are deletable only inside authorized reset/delete window", () => {
  assert.match(
    migration,
    /dm3oi\.organization_reset_organization_id/,
  );
  assert.match(
    migration,
    /dm3oi\.organization_delete_organization_id/,
  );
  assert.match(
    migration,
    /public\.is_super_admin\(auth\.uid\(\)\)/,
  );
  assert.match(
    migration,
    /service request messages are immutable/,
  );
});

test("post-commit identity cleanup is durable and service-role finalized", () => {
  assert.match(
    migration,
    /identity_cleanup jsonb/,
  );
  assert.match(
    migration,
    /'status', 'PENDING'/,
  );
  assert.match(
    migration,
    /complete_permanent_organization_deletion_cleanup/,
  );
  assert.match(
    migration,
    /auth\.role\(\) <> 'service_role'/,
  );
  assert.match(
    migration,
    /identity cleanup result does not exactly partition candidates/,
  );
  assert.match(
    migration,
    /identity cleanup result sets overlap/,
  );

  assert.match(
    actions,
    /retryPermanentOrganizationDeletionCleanupAction/,
  );
});

test("Storage cleanup is restricted to organization avatar buckets and retries safely", () => {
  assert.match(
    actions,
    /ORGANIZATION_AVATAR_BUCKET/,
  );
  assert.match(
    actions,
    /ORGANIZATION_AVATAR_SOURCE_BUCKET/,
  );

  assert.match(
    avatar,
    /organization-avatars/,
  );
  assert.match(
    avatar,
    /organization-avatar-sources/,
  );

  assert.doesNotMatch(
    actions,
    /landing-page-assets/,
  );

  assert.match(
    actions,
    /\.list\(organizationId,\{limit,offset:0\}\)/,
  );
  assert.doesNotMatch(
    actions,
    /offset\+=limit/,
  );

  assert.match(
    migration,
    /storage_cleanup jsonb/,
  );
  assert.match(
    migration,
    /'organizationAvatarSourcePrefix', target_organization_id::text \|\| '\/'/,
  );

  // A failed removal leaves the first page intact. The loop must stop
  // immediately rather than repeatedly retrying the same failed batch.
  assert.match(
    actions,
    /if\(removed\.error\)\{[\s\S]*?failedPaths\.push\([\s\S]*?break;/,
    "a failed Storage batch must stop immediately",
  );
});

test("durable deletion audit grants server cleanup the required table privileges", () => {
  const privilegeMigration = read(
    "supabase/migrations/20260925181000_dm3oi_permanent_deletion_audit_service_role.sql",
  );

  assert.match(
    privilegeMigration,
    /grant select, update\s+on table public\.platform_organization_deletion_audit\s+to service_role;/,
  );
  assert.doesNotMatch(
    privilegeMigration,
    /grant[\s\S]*\b(insert|delete)\b/i,
  );
});

test("global identity deletion guard can read every dependency table through service role", () => {
  const privilegeMigration = read(
    "supabase/migrations/20260925182000_dm3oi_global_identity_guard_service_role_select.sql",
  );

  const requiredTables = [
    "case_activity",
    "case_assignments",
    "case_question_responses",
    "case_tasks",
    "cases",
    "notifications",
    "organization_license_events",
    "organization_licenses",
    "organization_lifecycle_statuses",
    "organization_role_permissions",
    "platform_user_roles",
    "question_definitions",
    "rule_actions",
    "rule_definitions",
    "service_request_activity",
    "service_request_messages",
    "trial_request_status_history",
    "trial_requests",
  ];

  for (const table of requiredTables) {
    assert.match(
      privilegeMigration,
      new RegExp(`public\\.${table}`),
      `${table} must be readable by the server-side deletion guard`,
    );
  }

  assert.match(
    privilegeMigration,
    /grant select on table[\s\S]*to service_role;/,
  );
  assert.doesNotMatch(
    privilegeMigration,
    /\b(insert|update|delete|truncate)\b/i,
  );
});

test("completed retained identities can be explicitly re-evaluated after a fail-closed dependency check", () => {
  assert.match(
    actions,
    /recheckPermanentOrganizationDeletionRetainedIdentitiesAction/,
  );
  assert.match(
    actions,
    /recheckRetainedUserIds\?:boolean/,
  );
  assert.match(
    actions,
    /previouslyRetained\.has\(userId\)&&!recheckRetainedUserIds/,
  );
  assert.match(
    actions,
    /recheckRetainedUserIds:true/,
  );
  assert.match(
    actions,
    /previouslyDeletedUserIds:uniqueStrings\(/,
  );
  assert.match(
    actions,
    /getGlobalUserDeletionEligibility\(userId\)/,
  );
  assert.match(
    actions,
    /finalizePermanentOrganizationDeletionCleanup/,
  );
});

test("completed deletion audits with retained identities are recoverable from the organizations page", () => {
  assert.match(
    actions,
    /getRetainedPermanentOrganizationDeletionIdentityReviews/,
  );
  assert.match(
    actions,
    /retainedUserIds\.length>0/,
  );
  assert.match(
    organizationsPage,
    /Retained Identity Review/,
  );
  assert.match(
    organizationsPage,
    /Re-evaluate Identities/,
  );
  assert.match(
    organizationsPage,
    /recheckPermanentOrganizationDeletionRetainedIdentitiesAction/,
  );
});

test("unresolved post-deletion cleanup is discoverable after organization route disappears", () => {
  assert.match(
    actions,
    /getPendingPermanentOrganizationDeletionCleanups/,
  );
  assert.match(
    actions,
    /\["PENDING","PARTIAL"\]\.includes\(identityStatus\)/,
  );
  assert.match(
    actions,
    /\["PENDING","PARTIAL"\]\.includes\(storageStatus\)/,
  );

  assert.match(
    organizationsPage,
    /Pending Deletion Cleanup/,
  );
  assert.match(
    organizationsPage,
    /retryPermanentOrganizationDeletionCleanupAction/,
  );
  assert.match(
    organizationsPage,
    /Retry Cleanup/,
  );
});

test("permanent deletion is distinct from reusable company reset in the UI", () => {
  assert.match(
    detailPage,
    /Permanent organization deletion/,
  );
  assert.match(
    detailPage,
    /cannot be reversed/,
  );
  assert.match(
    detailPage,
    /SuperAdminOrganizationDelete/,
  );

  assert.match(
    deleteComponent,
    /Delete Organization Permanently/,
  );
  assert.match(
    deleteComponent,
    /permanent/i,
  );
  assert.match(
    deleteComponent,
    /non-reversible/i,
  );
});

test("preview exposes identity, operational, configuration, audit, and trial impact", () => {
  const requiredPreviewKeys = [
    "identityCleanupCandidates",
    "organizationUsers",
    "customerPortalUsers",
    "customers",
    "cases",
    "caseTasks",
    "caseActivity",
    "caseAssignments",
    "caseQuestions",
    "caseQuestionResponses",
    "serviceRequests",
    "serviceRequestMessages",
    "serviceRequestActivity",
    "serviceRequestCommunications",
    "notifications",
    "membershipEvents",
    "questionDefinitions",
    "questionOptions",
    "ruleDefinitions",
    "ruleActions",
    "caseTypes",
    "lifecycleStatuses",
    "rolePermissions",
    "organizationSettings",
    "licenses",
    "licenseEvents",
    "caseNumberCounters",
    "customerAnnualNumberCounters",
    "customerNumberCounters",
    "serviceRequestAnnualNumberCounters",
    "analyticsLiveSessions",
    "analyticsPageViews",
    "resetAuditRows",
    "trialRequestLinks",
  ];

  for (const key of requiredPreviewKeys) {
    assert.match(
      migration,
      new RegExp(`'${key}'`),
      `preview must include ${key}`,
    );
  }
});
