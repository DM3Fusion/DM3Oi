import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  authorizedOrganizationSettingsNavigation,
  organizationAdministrationNavigation,
  organizationNavigation,
  organizationSettingsNavigation,
  platformNavigation,
} from "../lib/application-navigation.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("organization primary navigation has the canonical permission-filtered order", () => {
  assert.deepEqual(
    organizationNavigation.map((item) => item.label),
    [
      "Dashboard",
      "Service Desk",
      "Inbox",
      "Cases",
      "Tasks",
      "Reports",
      "Customers",
    ],
  );

  assert.equal(
    organizationNavigation
      .map((item) => String(item.href))
      .includes("/goals"),
    false,
  );

  assert.equal(
    organizationNavigation
      .map((item) => String(item.href))
      .includes("/questions"),
    false,
  );
});

test("non-platform Settings children use the exact shared order", () => {
  const items = authorizedOrganizationSettingsNavigation({
    isSuperAdmin: false,
    internalAccess: true,
    activeOrganization: { role: "BUSINESS_OWNER" },
    effectivePermissions: new Set([
      "VIEW_ADMINISTRATION",
      "VIEW_GOALS",
      "VIEW_QUESTIONS",
      "MANAGE_ROLE_PERMISSIONS",
    ]),
  });
  assert.deepEqual(
    items.map(({ label, href }) => ({ label, href })),
    [
      { label: "Customer Portal", href: "/settings/customer-portal" },
      { label: "Case Configuration", href: "/settings/case-configuration" },
      { label: "Goals", href: "/goals" },
      { label: "Questions & Rules", href: "/questions" },
      { label: "User Access", href: "/settings/user-access" },
    ],
  );
});

test("Questions and Rules keeps VIEW_QUESTIONS filtering and appears only under Settings", () => {
  const permitted = authorizedOrganizationSettingsNavigation({
    isSuperAdmin: false,
    internalAccess: true,
    activeOrganization: { role: "STAFF_USER" },
    effectivePermissions: new Set(["VIEW_QUESTIONS"]),
  });
  const denied = authorizedOrganizationSettingsNavigation({
    isSuperAdmin: false,
    internalAccess: true,
    activeOrganization: { role: "STAFF_USER" },
    effectivePermissions: new Set(),
  });
  assert.deepEqual(permitted.map((item) => item.href), ["/questions"]);
  assert.equal(denied.some((item) => item.href === "/questions"), false);
  assert.equal(organizationSettingsNavigation.filter((item) => item.href === "/questions").length, 1);
  assert.equal(organizationAdministrationNavigation.map((item) => String(item.href)).includes("/questions"), false);
  assert.equal(organizationNavigation.map((item) => String(item.href)).includes("/questions"), false);
});

test("desktop tablet and phone consume one Settings hierarchy with Questions active", () => {
  const shell = source("components/layout/app-shell.tsx");
  const mobile = source("components/layout/mobile-bottom-navigation.tsx");
  assert.match(shell, /authorizedOrganizationSettingsNavigation\(access\)/);
  assert.match(shell, /settingsItems=\{platformContext \? \[\] : settingsNavigation\}/);
  assert.match(shell, /pathname\.startsWith\("\/settings"\) \|\| pathname\.startsWith\("\/questions"\)/);
  assert.match(mobile, /settingsItems\.map\(\(settingsItem\) =>/);
  assert.match(mobile, /settingsItems\.some\(\(child\) => matchesPath\(pathname, child\.href\)\)/);
});

test("Platform Operations navigation remains unchanged", () => {
  assert.deepEqual(
    platformNavigation.map(({ label, href }) => ({ label, href })),
    [
      { label: "Platform Console", href: "/" },
      { label: "Organizations", href: "/admin/organizations" },
      { label: "New Organizations", href: "/admin/organizations/new" },
      { label: "Case Cleanup", href: "/admin/case-cleanup" },
      { label: "Customer Import", href: "/admin/customer-import" },
      { label: "Duplicate Customers", href: "/admin/customer-duplicates" },
      { label: "Trial Requests", href: "/admin/trial-requests" },
      { label: "Templates", href: "/admin/email-templates" },
      { label: "Users / Access", href: "/admin/users" },
    ],
  );
});
