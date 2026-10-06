import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const queue = source("components/admin/customer-import-submission-queue.tsx");
const component = source("components/admin/customer-import-rollback.tsx");
const rollbackActions = source(
  "app/admin/customer-import/rollback-actions.ts",
);
const deletionActions = source(
  "lib/data/customer-permanent-deletion-actions.ts",
);

test("rollback UI is rendered only for completed imported submissions", () => {
  assert.match(
    queue,
    /submission\.status === "IMPORTED" \? \([\s\S]*?<CustomerImportRollback/,
  );
  assert.match(
    queue,
    /\{submission\.status === "IMPORTED" \? \(\s*<CustomerImportRollback/,
  );
  assert.match(
    rollbackActions,
    /submission\.status !== "IMPORTED" \|\| !submission\.imported_at/,
  );
  assert.match(
    rollbackActions,
    /Only completed Customer imports can be rolled back\./,
  );
});

test("authoritative candidates come only from persisted CREATED outcomes", () => {
  assert.match(
    rollbackActions,
    /Array\.isArray\(importResult\.outcomes\)/,
  );
  assert.match(
    rollbackActions,
    /if \(classification !== "CREATED"\) continue;[\s\S]*outcome\.customer_id/,
  );
  assert.match(
    rollbackActions,
    /customerIds\.length !== importResult\.created/,
  );
  assert.match(
    rollbackActions,
    /new Set\(customerIds\)\.size !== customerIds\.length/,
  );
  assert.doesNotMatch(rollbackActions, /mts\\\.|example\\\.com|email.*match/i);
  assert.doesNotMatch(component, /mts\.|example\.com/i);
});

test("duplicate exact and invalid outcomes are excluded from deletion candidates", () => {
  assert.match(
    rollbackActions,
    /"CREATED",[\s\S]*"EXACT",[\s\S]*"DUPLICATE",[\s\S]*"INVALID"/,
  );
  assert.match(rollbackActions, /classification !== "CREATED"/);
  assert.match(
    component,
    /Existing Customers and rows held as duplicates are not deleted\./,
  );
});

test("preview fails closed on organization mismatch and reports missing Customers", () => {
  assert.match(
    rollbackActions,
    /customer\.organization_id !== submission\.organization_id/,
  );
  assert.match(
    rollbackActions,
    /An imported Customer no longer belongs to the submission organization\./,
  );
  assert.match(
    rollbackActions,
    /alreadyMissing: auditedCustomerIds\.length - presentPreviews\.length/,
  );
  assert.match(component, /Already missing[\s\S]*preview\.alreadyMissing/);
});

test("preview aggregates blockers from the existing permanent deletion engine", () => {
  assert.match(
    rollbackActions,
    /getCustomerDeletionPreviewForOrganizationAction\([\s\S]*submission\.organization_id,[\s\S]*customer\.id/,
  );
  assert.match(
    rollbackActions,
    /blockerCategories: aggregateBlockers\(blockedPreviews\)/,
  );
  assert.match(
    component,
    /Protected dependencies were found\.[\s\S]*blockerCategories\.map/,
  );
  assert.match(
    deletionActions,
    /super_admin_customer_deletion_preview[\s\S]*target_organization_id: context\.organizationId[\s\S]*target_customer_id: customerId/,
  );
});

test("execution confirmation is exact and based on the current eligible count", () => {
  assert.match(
    rollbackActions,
    /`DELETE \$\{state\.eligible\} IMPORTED CUSTOMERS`/,
  );
  assert.match(
    rollbackActions,
    /if \(confirmation !== expectedConfirmation\)/,
  );
  assert.match(
    component,
    /`DELETE \$\{preview\.eligible\} IMPORTED CUSTOMERS`/,
  );
  assert.match(
    component,
    /disabled=\{[\s\S]*deleting \|\| confirmation !== expectedConfirmation/,
  );
});

test("execution reloads state and rechecks each Customer immediately before deletion", () => {
  const executeStart = rollbackActions.indexOf(
    "export async function executeCustomerImportRollbackAction",
  );
  const execute = rollbackActions.slice(executeStart);

  assert.match(execute, /const state = await buildRollbackState\(submissionId\)/);
  assert.match(
    execute,
    /for \(const customerId of batch\)[\s\S]*getCustomerDeletionPreviewForOrganizationAction[\s\S]*permanentlyDeleteCustomerForOrganizationAction/,
  );
  assert.match(execute, /if \(!freshPreview\.preview\.eligible\)/);
  assert.match(execute, /deletion\.kind === "blocked"/);
  assert.match(execute, /deletion\.kind === "missing"/);
});

test("rollback is bounded resumable and preserves the import audit", () => {
  assert.match(rollbackActions, /const DELETE_BATCH_SIZE = 25/);
  assert.match(
    rollbackActions,
    /state\.eligibleCustomerIds\.slice\(0, DELETE_BATCH_SIZE\)/,
  );
  assert.match(
    component,
    /This pass will delete up to[\s\S]*preview\.eligible[\s\S]*eligible imported Customers/,
  );
  assert.match(
    component,
    /Preview again[\s\S]*after every pass to continue safely\./,
  );
  assert.doesNotMatch(
    rollbackActions,
    /\.from\("customer_import_submissions"\)[\s\S]*\.(?:update|delete)\(/,
  );
  assert.match(
    rollbackActions,
    /\.select\([\s\S]*import_result[\s\S]*\)/,
  );
});

test("rollback remains SUPER_ADMIN-only without direct table deletion", () => {
  assert.match(rollbackActions, /await requireSuperAdmin\(\)/);
  assert.match(
    deletionActions,
    /requireExplicitSuperAdminCustomerContext[\s\S]*!access\.isSuperAdmin/,
  );
  assert.match(
    rollbackActions,
    /permanentlyDeleteCustomerForOrganizationAction/,
  );
  assert.match(
    deletionActions,
    /super_admin_permanently_delete_customer/,
  );
  assert.doesNotMatch(rollbackActions, /\.delete\(|delete from/i);
  assert.doesNotMatch(component, /\.delete\(|delete from/i);
});

test("rollback introduces no polling realtime cron or background worker", () => {
  const combined = `${component}\n${rollbackActions}`;
  assert.doesNotMatch(
    combined,
    /setInterval|setTimeout|subscribe\(|channel\(|postgres_changes|realtime|cron|worker/i,
  );
  assert.match(component, /onClick=\{\(\) => void checkRollback\(\)\}/);
  assert.match(component, /onSubmit=\{\(event\) => \{/);
});
