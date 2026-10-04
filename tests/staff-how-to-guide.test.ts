import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  authorizedOrganizationAdministrationNavigation,
  mobileSecondaryNavigation,
  platformNavigation,
} from "../lib/application-navigation.ts";
import {
  organizationGuideHref,
  type ApplicationRole,
  type PermissionContext,
} from "../lib/auth/permissions.ts";

const source = (path: string) => readFileSync(path, "utf8");
const guidePath = "app/staff-how-to-guide/page.tsx";
const guide = source(guidePath);
const ownerGuide = source("app/how-to-guide/page.tsx");

const access = (role: ApplicationRole): PermissionContext => ({
  isSuperAdmin: false,
  internalAccess: true,
  activeOrganization: { role },
});

const sections = [
  ["getting-started", "Getting Started"],
  ["dashboard", "Dashboard / Operational Overview"],
  ["customers", "Customers"],
  ["cases", "Cases"],
  ["tasks", "Tasks"],
  ["service-desk", "Service Desk"],
  ["customer-portal", "Customer Portal"],
  ["communications", "Inbox / Communications"],
  ["questions-rules", "Questions & Rules"],
  ["reports", "Reports"],
  ["common-workflows", "Common Staff Workflows"],
  ["troubleshooting", "Tips & Troubleshooting"],
] as const;

test("Staff How to Guide route has the intended static operational sections", () => {
  assert.equal(existsSync(guidePath), true);
  assert.match(guide, /title="DM3Oi Staff How to Guide"/);
  assert.match(guide, /eyebrow="Help"/);
  assert.match(guide, /id="guide-top"/);
  assert.match(guide, /!canAccessOrganizationGuide\(access, "\/staff-how-to-guide"\)\) notFound\(\)/);
  assert.doesNotMatch(guide, /@\/lib\/data\/|createClient\(|requirePermission/);
  for (const [id, title] of sections) {
    assert.match(guide, new RegExp(`id="${id}"`));
    assert.match(guide, new RegExp(`title="${title.replace(/[&/]/g, "\\$&")}"`));
  }
});

test("staff content omits administration and platform-only instructions", () => {
  for (const forbidden of [
    "SUPER_ADMIN", "Super Admin", "Platform Console", "Platform Administration",
    "Supabase", "Vercel", "migration", "deployment", "database administration",
    "tenant management", "Submit Customer Data",
  ]) assert.doesNotMatch(guide, new RegExp(forbidden, "i"), forbidden);

  assert.doesNotMatch(guide, /invite (?:a |organization )?(?:user|staff)|manage roles|branding|logo administration/i);
  assert.doesNotMatch(guide, /choose Enable Portal Access|resend invitation|Customer Import/i);
  assert.match(guide, /Portal access activation, invitation management, and portal-wide settings are not staff actions/);
});

test("each organization role receives exactly one role-appropriate guide link", () => {
  for (const role of ["BUSINESS_OWNER", "BUSINESS_ADMIN"] as const) {
    assert.equal(organizationGuideHref(access(role)), "/how-to-guide");
    const items = authorizedOrganizationAdministrationNavigation(access(role));
    assert.deepEqual(items.filter((item) => item.label === "How to Guide").map((item) => item.href), ["/how-to-guide"]);
    assert.deepEqual(mobileSecondaryNavigation(access(role), false).filter((item) => item.label === "How to Guide").map((item) => item.href), ["/how-to-guide"]);
  }
  for (const role of ["STAFF_MANAGER", "STAFF_USER"] as const) {
    assert.equal(organizationGuideHref(access(role)), "/staff-how-to-guide");
    const items = authorizedOrganizationAdministrationNavigation(access(role));
    assert.deepEqual(items.filter((item) => item.label === "How to Guide").map((item) => item.href), ["/staff-how-to-guide"]);
    assert.deepEqual(mobileSecondaryNavigation(access(role), false).filter((item) => item.label === "How to Guide").map((item) => item.href), ["/staff-how-to-guide"]);
  }
  assert.equal(organizationGuideHref({ ...access("SUPER_ADMIN"), isSuperAdmin: true }), null);
  assert.equal(platformNavigation.some((item) => item.href.includes("how-to-guide")), false);
});

test("route guards preserve Owner Admin and staff separation", () => {
  assert.match(ownerGuide, /!canAccessOrganizationGuide\(access, "\/how-to-guide"\)\) notFound\(\)/);
  assert.doesNotMatch(ownerGuide, /staff-how-to-guide/);
  assert.match(guide, /!canAccessOrganizationGuide\(access, "\/staff-how-to-guide"\)\) notFound\(\)/);
  assert.doesNotMatch(guide, /canAccessOrganizationGuide\(access, "\/how-to-guide"/);
});

test("staff task guidance preserves required workflow work", () => {
  const taskSection = guide.slice(guide.indexOf('id="tasks"'), guide.indexOf('id="service-desk"'));
  assert.match(taskSection, /Workflow-required Tasks cannot be deleted or manually reordered/);
  assert.doesNotMatch(taskSection, /remove workflow|required Tasks can be (?:removed|deleted)/i);
});

test("staff figures are accessible compact and free of production-looking PII", () => {
  for (const title of [
    "Customer register example", "Guided Case Intake sequence", "Task register example",
    "Service Request work flow", "Customer Portal interaction", "Inbox review pattern",
    "Business Reach map key",
  ]) assert.match(guide, new RegExp(`title="${title}"`));
  assert.match(guide, /<figure className="guide-figure">/);
  assert.match(guide, /role="img" aria-label=\{title\}/);
  assert.match(guide, /<figcaption><strong>\{title\}<\/strong><span>\{caption\}<\/span><\/figcaption>/);
  assert.doesNotMatch(guide, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(guide, /\bCASE[- ]?\d{4,}\b/i);
});
