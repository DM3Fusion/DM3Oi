import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const page = source("app/customers/[customerId]/page.tsx");
const component = source("components/customer-permanent-delete.tsx");
const actions = source("lib/data/customer-permanent-deletion-actions.ts");
const migration = source(
  "supabase/migrations/20260926223000_dm3oi_super_admin_permanent_customer_delete.sql",
);
const nextConfig = source("next.config.ts");

test("Customer deletion workflow remains SUPER_ADMIN-only", () => {
  assert.match(
    page,
    /\{access\.isSuperAdmin \? \([\s\S]*?<CustomerPermanentDelete[\s\S]*?\) : null\}/,
  );
  assert.match(actions, /!access\.isSuperAdmin/);
  assert.match(migration, /not public\.is_super_admin\(actor\)/);
});

test("eligibility button invokes the intended action without form nesting", () => {
  assert.match(
    component,
    /type="button"[\s\S]*?onClick=\{\(\) => void checkEligibility\(\)\}[\s\S]*?Check Delete Eligibility/,
  );
  assert.match(
    component,
    /const result = await getCustomerDeletionPreviewAction\(customerId\)/,
  );
  assert.doesNotMatch(component, /<form|type="submit"/);
});

test("customer ID and active organization context reach the scoped preview RPC", () => {
  assert.match(
    page,
    /<CustomerPermanentDelete[\s\S]*?customerId=\{customer\.id\}/,
  );
  assert.match(
    actions,
    /const organizationId = access\?\.activeOrganization\?\.id/,
  );
  assert.match(
    actions,
    /super_admin_customer_deletion_preview[\s\S]*?target_organization_id: context\.organizationId,[\s\S]*?target_customer_id: customerId/,
  );
  assert.match(
    migration,
    /where organization_id=target_organization_id\s+and id=target_customer_id/,
  );
});

test("successful and blocked eligibility results render", () => {
  assert.match(component, /setPreview\(result\.preview\)/);
  assert.match(
    component,
    /No protected Customer dependencies were found[\s\S]*?Delete Customer Permanently/,
  );
  assert.match(
    component,
    /This Customer cannot be permanently deleted\.[\s\S]*?preview\.blockers\.map/,
  );
});

test("eligibility failures are safe and cannot leave the button pending", () => {
  assert.match(
    component,
    /try \{[\s\S]*?getCustomerDeletionPreviewAction\(customerId\)[\s\S]*?\} catch \{[\s\S]*?setError\(eligibilityRequestError\)[\s\S]*?\} finally \{[\s\S]*?setChecking\(false\)/,
  );
  assert.match(
    component,
    /Customer dependency checks could not be completed\. Refresh the page and try again\./,
  );
  assert.match(component, /role="alert"/);
});

test("all protected Customer dependencies still block deletion", () => {
  for (const dependency of [
    "PORTAL_ACCESS",
    "CASE_HISTORY",
    "SERVICE_DESK_HISTORY",
    "GUIDED_INTAKE_DRAFT",
  ]) {
    const matches = migration.match(new RegExp(`'${dependency}'`, "g")) ?? [];
    assert.equal(matches.length, 2, `${dependency} must block preview and delete`);
  }
  assert.match(migration, /if jsonb_array_length\(blockers\) > 0 then/);
  assert.match(migration, /errcode='23514'/);
});

test("permanent deletion retains explicit eligibility and confirmation gates", () => {
  assert.match(component, /if \(!preview\?\.eligible \|\| deleting\) return/);
  assert.match(component, /const confirmed = window\.confirm/);
  assert.match(component, /This action cannot be undone/);
  assert.match(component, /if \(!confirmed\) return/);
  assert.match(
    component,
    /await permanentlyDeleteCustomerAction\(customerId\)/,
  );
  assert.match(
    migration,
    /super_admin_permanently_delete_customer[\s\S]*?for update[\s\S]*?delete from public\.customers[\s\S]*?where organization_id=target_organization_id\s+and id=target_customer_id/,
  );
});

test("deployment skew protection uses the same build SHA as the version label", () => {
  assert.match(
    nextConfig,
    /deploymentId: process\.env\.VERCEL_GIT_COMMIT_SHA/,
  );
});
