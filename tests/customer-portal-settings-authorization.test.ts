import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getEffectiveOrganizationPermissions,
  hasPermission,
  type ApplicationRole,
} from "../lib/auth/permissions.ts";

const source = (path: string) => readFileSync(path, "utf8");
const page = source("app/settings/customer-portal/page.tsx");
const actions = source("lib/data/organization-administration-actions.ts");
const action = actions.slice(
  actions.indexOf("export async function saveCustomerPortalSettings"),
  actions.indexOf("const caseConfigurationPath"),
);

function context(
  role: ApplicationRole,
  activeOrganization = true,
  effectivePermissions = getEffectiveOrganizationPermissions(role),
) {
  return {
    isSuperAdmin: role === "SUPER_ADMIN",
    internalAccess: true,
    activeOrganization: activeOrganization ? { role } : null,
    effectivePermissions,
  };
}

test("Customer Portal settings capability permits organization administrators", () => {
  assert.equal(
    hasPermission(context("BUSINESS_OWNER"), "MANAGE_ORGANIZATION_SETTINGS"),
    true,
  );
  assert.equal(
    hasPermission(context("BUSINESS_ADMIN"), "MANAGE_ORGANIZATION_SETTINGS"),
    true,
  );
});

test("Customer Portal settings fail closed for staff unless explicitly granted", () => {
  for (const role of ["STAFF_MANAGER", "STAFF_USER"] as const) {
    assert.equal(
      hasPermission(context(role), "MANAGE_ORGANIZATION_SETTINGS"),
      false,
    );

    const granted = new Set(getEffectiveOrganizationPermissions(role));
    granted.add("MANAGE_ORGANIZATION_SETTINGS");
    assert.equal(
      hasPermission(context(role, true, granted), "MANAGE_ORGANIZATION_SETTINGS"),
      true,
    );
  }
});

test("SUPER_ADMIN requires an active organization for organization settings", () => {
  assert.equal(
    hasPermission(context("SUPER_ADMIN"), "MANAGE_ORGANIZATION_SETTINGS"),
    true,
  );
  assert.equal(
    hasPermission(
      context("SUPER_ADMIN", false),
      "MANAGE_ORGANIZATION_SETTINGS",
    ),
    false,
  );
});

test("Customer Portal settings page and action enforce the same capability", () => {
  assert.match(
    page,
    /hasPermission\(access, "MANAGE_ORGANIZATION_SETTINGS"\)/,
  );
  assert.match(action, /!organizationId \|\| !ok\(access\)/);
  assert.doesNotMatch(action, /!access\?\.isSuperAdmin/);
});

test("Customer Portal settings results use the canonical Settings route", () => {
  assert.match(action, /revalidatePath\("\/settings\/customer-portal"\)/);
  assert.match(
    action,
    /redirect\("\/settings\/customer-portal\?message=Changes%20Saved"\)/,
  );
  assert.doesNotMatch(action, /\/administration\/customer-portal/);
});
