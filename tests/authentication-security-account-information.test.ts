import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repository = readFileSync(
  "lib/data/platform-authentication-security-accounts.ts",
  "utf8",
);

const page = readFileSync(
  "app/admin/authentication-security/page.tsx",
  "utf8",
);

const component = readFileSync(
  "components/platform/authentication-security-events-table.tsx",
  "utf8",
);

test("account resolution requires SUPER_ADMIN", () => {
  assert.match(
    repository,
    /getAuthenticationSecurityAccounts[\s\S]*?await requireSuperAdmin\(\)/,
  );
});

test("account identities are resolved server-side", () => {
  assert.match(repository, /createAdminClient/);
  assert.match(repository, /auth\.admin\.getUserById/);
  assert.match(repository, /SECURITY_EVENTS_PAGE_SIZE/);
});

test("account identity includes authentication email", () => {
  assert.match(repository, /result\.data\.user\?\.email/);
  assert.match(component, /Email Address/);
});

test("event modal distinguishes current membership from event role", () => {
  assert.match(component, /Current Membership Role/);
  assert.match(component, /Current Membership Status/);
  assert.match(component, /Application Role at Event/);
});

test("Events page passes resolved accounts to the modal", () => {
  assert.match(page, /getAuthenticationSecurityAccounts\(result\.events\)/);
  assert.match(page, /accounts=\{eventAccounts\}/);
});

test("Events table retains four columns", () => {
  const headers = component.match(/<th>/g) ?? [];
  assert.equal(headers.length, 4);
});
