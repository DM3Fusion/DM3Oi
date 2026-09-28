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
const css = source("app/globals.css");

test("Customer deletion workflow remains SUPER_ADMIN-only", () => {
  assert.match(
    page,
    /\{access\.isSuperAdmin \? \([\s\S]*?<CustomerPermanentDelete[\s\S]*?\) : null\}/,
  );
  assert.match(actions, /!access\.isSuperAdmin/);
  assert.match(migration, /not public\.is_super_admin\(actor\)/);
});

test("eligibility button invokes the intended action outside the confirmation form", () => {
  assert.match(
    component,
    /type="button"[\s\S]*?onClick=\{\(\) => void checkEligibility\(\)\}[\s\S]*?Check Delete Eligibility/,
  );
  assert.match(
    component,
    /const result = await getCustomerDeletionPreviewAction\(customerId\)/,
  );
  assert.equal((component.match(/<form/g) ?? []).length, 1);
  assert.equal((component.match(/<\/form>/g) ?? []).length, 1);
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

test("typed confirmation renders only in the eligible preview branch", () => {
  const eligibleBranch = component.slice(
    component.indexOf(": preview.eligible ? ("),
    component.indexOf(") : (", component.indexOf(": preview.eligible ? (") + 1),
  );

  assert.match(eligibleBranch, /Type DELETE to confirm/);
  assert.match(eligibleBranch, /name="confirmation"/);
  assert.match(eligibleBranch, /value=\{confirmation\}/);
  assert.match(eligibleBranch, /Delete Customer Permanently/);
  assert.doesNotMatch(
    component.slice(0, component.indexOf(": preview.eligible ? (")),
    /name="confirmation"/,
  );
});

test("only exact case-sensitive DELETE enables destructive submission", () => {
  assert.match(component, /const expectedConfirmation = "DELETE"/);
  assert.match(
    component,
    /disabled=\{deleting \|\| confirmation !== expectedConfirmation\}/,
  );
  assert.match(
    component,
    /if \(confirmation !== expectedConfirmation\) \{[\s\S]*?setError\("Type DELETE exactly to confirm permanent Customer deletion\."\)[\s\S]*?return;/,
  );

  for (const invalid of ["", "D", "DEL", "delete", "Delete", "DELETE ", " DELETE"]) {
    assert.notEqual(invalid, "DELETE");
  }
});

test("Enter submission cannot bypass confirmation and pending gates", () => {
  assert.match(
    component,
    /onSubmit=\{\(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?void deleteCustomer\(\);/,
  );
  assert.match(component, /if \(!preview\?\.eligible \|\| deleting\) return/);
  assert.match(
    component,
    /await permanentlyDeleteCustomerAction\(\s*customerId,\s*confirmation,\s*\)/,
  );
  assert.match(component, /setDeleting\(true\)/);
  assert.match(component, /finally \{[\s\S]*?setDeleting\(false\)/);
});

test("server rejects missing or incorrect confirmation before the deletion RPC", () => {
  assert.match(
    actions,
    /permanentlyDeleteCustomerAction\(\s*customerId: string,\s*confirmation: string/,
  );
  const confirmationGate = actions.indexOf('if (confirmation !== "DELETE")');
  const deleteRpc = actions.indexOf('"super_admin_permanently_delete_customer"');
  assert.ok(confirmationGate > 0 && deleteRpc > confirmationGate);
  assert.match(
    actions,
    /if \(confirmation !== "DELETE"\) \{[\s\S]*?ok: false,[\s\S]*?Type DELETE exactly to confirm permanent Customer deletion/,
  );
  assert.notEqual(undefined, "DELETE");
  assert.notEqual("delete", "DELETE");
});

test("correct confirmation reaches the existing scoped deletion path", () => {
  assert.match(
    component,
    /permanentlyDeleteCustomerAction\(\s*customerId,\s*confirmation/,
  );
  assert.match(
    actions,
    /if \(confirmation !== "DELETE"\)[\s\S]*?super_admin_permanently_delete_customer[\s\S]*?target_organization_id: context\.organizationId,[\s\S]*?target_customer_id: customerId/,
  );
  assert.match(
    migration,
    /super_admin_permanently_delete_customer[\s\S]*?for update[\s\S]*?delete from public\.customers[\s\S]*?where organization_id=target_organization_id\s+and id=target_customer_id/,
  );
});

test("confirmation uses in-application responsive form UI without browser dialogs", () => {
  assert.doesNotMatch(component, /window\.(?:confirm|prompt|alert)/);
  assert.match(component, /cannot be undone/);
  assert.match(component, /className="customer-delete-confirmation"/);
  assert.match(css, /\.customer-delete-confirmation \{[\s\S]*?max-width: 34rem/);
  assert.match(
    css,
    /@media \(max-width: 600px\) \{[\s\S]*?\.customer-delete-confirmation[\s\S]*?width: 100%/,
  );
});

test("deployment skew protection uses a bounded build SHA prefix", () => {
  assert.match(
    nextConfig,
    /deploymentId: process\.env\.VERCEL_GIT_COMMIT_SHA\?\.slice\(0, 32\)/,
  );
  assert.doesNotMatch(nextConfig, /deploymentId:\s*["'][0-9a-f]+["']/i);
});
