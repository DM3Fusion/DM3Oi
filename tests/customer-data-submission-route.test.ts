import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canSubmitCustomerData } from "../lib/customer-data-submission-access.ts";

const source = (path: string) => readFileSync(path, "utf8");
const page = source("app/customers/import/page.tsx");
const customerPage = source("app/customers/page.tsx");
const modal = source("components/customers/customer-data-submit-modal.tsx");
const action = source("app/customers/import/actions.ts");
const repository = source("lib/data/customer-import-submissions.ts");
const styles = source("app/globals.css");
const interceptedCustomerRoute = source(
  "app/customers/@modal/(.)[customerId]/page.tsx",
);

const access = (
  role: "BUSINESS_OWNER" | "BUSINESS_ADMIN" | "STAFF_MANAGER" | "STAFF_USER" | "SUPER_ADMIN",
  isSuperAdmin = false,
) => ({
  isSuperAdmin,
  internalAccess: true,
  activeOrganization: { role },
});

test("Customer Data submission access is limited to organization administrators", () => {
  assert.equal(canSubmitCustomerData(access("BUSINESS_OWNER")), true);
  assert.equal(canSubmitCustomerData(access("BUSINESS_ADMIN")), true);
  assert.equal(canSubmitCustomerData(access("STAFF_MANAGER")), false);
  assert.equal(canSubmitCustomerData(access("STAFF_USER")), false);
  assert.equal(canSubmitCustomerData(access("SUPER_ADMIN", true)), true);
  assert.equal(
    canSubmitCustomerData({
      isSuperAdmin: true,
      internalAccess: true,
      activeOrganization: null,
    }),
    false,
  );
});

test("the organization Customer Data submission route uses the centralized access check", () => {
  assert.match(page, /title="Submit Customer Data"/);
  assert.match(page, /canSubmitCustomerData\(access\)/);
  assert.match(page, /getCustomerImportSubmissions\(\)/);
  assert.match(
    page,
    /<CustomerDataSubmitModal[\s\S]*organizationName=\{access\.activeOrganization\.name\}/,
  );
  assert.match(customerPage, /canSubmitCustomerData\(access\)/);
  assert.match(
    customerPage,
    /<a className="secondary-button" href="\/customers\/import">[\s\S]*Submit Customer Data[\s\S]*<\/a>/,
  );
  assert.doesNotMatch(page, /href="\/admin\/customer-import"/);
  assert.doesNotMatch(modal, /href="\/admin\/customer-import"/);
});

test("the submission page distinguishes its upload action from the Customers entry point", () => {
  assert.match(
    customerPage,
    /href="\/customers\/import">[\s\S]*Submit Customer Data[\s\S]*<\/a>/,
  );
  assert.match(
    modal,
    /className="primary-button customer-data-upload-button"[\s\S]*Upload Customer Data/,
  );
  assert.match(
    styles,
    /\.customer-data-upload-button\{[\s\S]*?border:1px solid #000;[\s\S]*?border-radius:7px;[\s\S]*?background:#f0fdf4;[\s\S]*?color:#166534;/,
  );
});

test("the submission link bypasses the dynamic Customer modal interceptor", () => {
  assert.match(interceptedCustomerRoute, /params: Promise<\{ customerId: string \}>/);
  assert.match(interceptedCustomerRoute, /<CustomerDetail customerId=\{customerId\}/);
  assert.doesNotMatch(
    customerPage,
    /<Link[^>]*href="\/customers\/import"/,
  );
});

test("the submission surface explains staging and minimum source information", () => {
  assert.match(
    page,
    /Submitting a file does not directly add Customers to \$\{access\.activeOrganization\.name\}\./,
  );
  assert.match(modal, /to \{organizationName\}\./);
  assert.doesNotMatch(page, /does not directly add Customers to DM3Oi\./);
  assert.doesNotMatch(modal, /does not directly add Customers[\s\S]*to DM3Oi\./);
  assert.match(modal, /SUPER_ADMIN review and[\s\S]*onboarding/);
  assert.match(modal, /does not have to use DM3Oi&apos;s canonical import column[\s\S]*names/);
  assert.match(modal, /does not change existing Customer[\s\S]*records/);

  for (const field of [
    "Name",
    "Street Address",
    "City",
    "State",
    "ZIP/Postal Code",
    "Email",
    "Phone",
  ]) {
    assert.match(modal, new RegExp(`<li>${field}</li>`));
  }
});

test("organization submission reuses staging actions without direct import controls", () => {
  assert.match(action, /requireCustomerDataSubmitter\(\)/);
  assert.match(action, /CUSTOMER_IMPORT_FILE_BUCKET/);
  assert.match(action, /\.from\("customer_import_submissions"\)[\s\S]*\.insert\(/);
  assert.match(action, /notifyPlatformAdministratorsOfCustomerDataSubmission/);
  assert.match(repository, /\.from\("customer_import_submissions"\)/);
  assert.doesNotMatch(page, /validate|preview|Ready To Import/i);
  assert.doesNotMatch(modal, /validate|preview|Ready To Import/i);
});

test("Customer Data submission introduces no polling or realtime refresh", () => {
  assert.doesNotMatch(
    [page, customerPage, modal, action, repository].join("\n"),
    /setInterval|setTimeout|\.channel\(|postgres_changes|router\.refresh/,
  );
});
