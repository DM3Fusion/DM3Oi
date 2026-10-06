import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const form = source("components/admin/customer-import-review-form.tsx");
const route = source("app/api/admin/customer-import/review/route.ts");
const actions = source("app/admin/customer-import/submission-actions.ts");
const stagingMigration = source(
  "supabase/migrations/20261002013000_dm3oi_customer_data_submission_staging.sql",
);
const grantsMigration = source(
  "supabase/migrations/20261002100000_dm3oi_customer_import_service_role_privileges.sql",
);

test("review saves use a stable same-origin endpoint instead of a deployment-specific Server Action id", () => {
  assert.match(
    form,
    /fetch\("\/api\/admin\/customer-import\/review",\s*\{[\s\S]*method: "POST"[\s\S]*credentials: "same-origin"/,
  );
  assert.doesNotMatch(form, /updateCustomerImportSubmissionAction/);
  assert.match(route, /function isSameOrigin\(request: NextRequest\)/);
  assert.match(route, /new URL\(origin\)\.origin === request\.nextUrl\.origin/);
  assert.match(route, /status: 403/);
});

test("the stable review endpoint retains SUPER_ADMIN authorization and concise diagnostics", () => {
  assert.match(route, /updateCustomerImportSubmissionAction\(form\)/);
  assert.match(actions, /updateCustomerImportSubmissionAction[\s\S]*requireSuperAdmin\(\)/);
  assert.match(
    route,
    /Customer import submission review request failed[\s\S]*operation: "update_review"[\s\S]*submissionId/,
  );
  assert.match(
    route,
    /The Customer data submission could not be updated\./,
  );
});

test("review payload uses canonical status and file-disposition keys", () => {
  for (const status of [
    "UPLOADED",
    "UNDER_REVIEW",
    "NEEDS_CORRECTION",
    "READY_TO_IMPORT",
    "REJECTED",
  ]) {
    assert.match(form, new RegExp(`value="${status}"`));
    assert.match(actions, new RegExp(`"${status}"`));
  }

  for (const disposition of [
    "RETAINED",
    "DELETED_WITHOUT_PROCESSING",
    "DELETED_AFTER_PROCESSING",
  ]) {
    assert.match(form, new RegExp(`value="${disposition}"`));
    assert.match(actions, new RegExp(`"${disposition}"`));
  }

  assert.match(form, /name="superAdminNote"/);
  assert.match(form, /name="correctionInstructions"/);
  assert.match(
    actions,
    /status === "NEEDS_CORRECTION" && !correctionInstructions/,
  );
  assert.match(
    actions,
    /file_disposition: fileDisposition[\s\S]*super_admin_note: superAdminNote \|\| null[\s\S]*correction_instructions:/,
  );
});

test("retained unimported reviews update only review metadata", () => {
  const reviewStart = actions.indexOf(
    "export async function updateCustomerImportSubmissionAction",
  );
  const deleteStart = actions.indexOf(
    "export async function deleteCustomerImportSourceAction",
  );
  const reviewAction = actions.slice(reviewStart, deleteStart);

  assert.match(reviewAction, /submission\.status === "IMPORTED"/);
  assert.match(reviewAction, /reviewed_at: new Date\(\)\.toISOString\(\)/);
  assert.match(reviewAction, /reviewed_by_user_id: context\.user\.id/);
  assert.doesNotMatch(
    reviewAction,
    /imported_at:|imported_by_user_id:|import_result:|source_file_deleted_at:/,
  );
});

test("review transport does not weaken organization RLS or broaden table grants", () => {
  assert.match(stagingMigration, /enable row level security/);
  assert.match(
    stagingMigration,
    /for select[\s\S]*public\.has_organization_role\([\s\S]*'BUSINESS_OWNER'[\s\S]*'BUSINESS_ADMIN'/,
  );
  assert.doesNotMatch(stagingMigration, /for update[\s\S]*to authenticated/);
  assert.match(
    grantsMigration,
    /grant select, insert, update[\s\S]*to service_role/,
  );
  assert.doesNotMatch(grantsMigration, /to authenticated|to anon/);
});
