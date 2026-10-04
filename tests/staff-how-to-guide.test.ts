import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  authorizedOrganizationAdministrationNavigation,
  mobileSecondaryNavigation,
  platformTemplatesNavigation,
} from "../lib/application-navigation.ts";
import {
  organizationGuideHref,
  type ApplicationRole,
  type PermissionContext,
} from "../lib/auth/permissions.ts";
import {
  defaultHowToGuideContent,
  parseHowToGuideContent,
} from "../lib/how-to-guide-content.ts";

const source = (path: string) => readFileSync(path, "utf8");
const guide = source("app/staff-how-to-guide/page.tsx");
const ownerGuide = source("app/how-to-guide/page.tsx");
const figures = source("components/how-to-guides/guide-figures.tsx");

const staffContent = defaultHowToGuideContent.STAFF;

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

test("Staff How to Guide route uses the locked shared renderer", () => {
  assert.match(
    guide,
    /canAccessOrganizationGuide\(access, "\/staff-how-to-guide"\)/,
  );
  assert.match(
    guide,
    /getPublishedHowToGuideForServer\("STAFF"\)/,
  );
  assert.match(
    guide,
    /<HowToGuideRenderer[\s\S]*content=\{content\}/,
  );

  const accessIndex = guide.indexOf("getAccessContext()");
  const guardIndex = guide.indexOf(
    'canAccessOrganizationGuide(access, "/staff-how-to-guide")',
  );
  const loadIndex = guide.indexOf(
    'getPublishedHowToGuideForServer("STAFF")',
  );

  assert.ok(accessIndex >= 0);
  assert.ok(guardIndex > accessIndex);
  assert.ok(loadIndex > guardIndex);

  assert.doesNotMatch(
    guide,
    /createClient\(|requirePermission|getLiveOrganizationData|getOperationalIntelligence/,
  );
});

test("Staff default guide preserves intended operational sections", () => {
  assert.equal(
    parseHowToGuideContent("STAFF", staffContent),
    staffContent,
  );

  assert.equal(staffContent.title, "DM3Oi Staff How to Guide");

  assert.deepEqual(
    staffContent.sections.map((section) => [section.key, section.title]),
    sections,
  );
});

test("staff content omits administration and platform-only instructions", () => {
  const serialized = JSON.stringify(staffContent);

  for (const forbidden of [
    "SUPER_ADMIN",
    "Super Admin",
    "Platform Console",
    "Platform Administration",
    "Supabase",
    "Vercel",
    "migration",
    "deployment",
    "database administration",
    "tenant management",
    "Submit Customer Data",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"), forbidden);
  }

  assert.doesNotMatch(
    serialized,
    /invite (?:a |organization )?(?:user|staff)|manage roles|branding|logo administration/i,
  );
  assert.doesNotMatch(
    serialized,
    /choose Enable Portal Access|resend invitation|Customer Import/i,
  );
  assert.match(
    serialized,
    /Portal access activation, invitation management, and portal-wide settings are not staff actions/,
  );
});

test("each organization role receives exactly one role-appropriate guide link", () => {
  for (const role of ["BUSINESS_OWNER", "BUSINESS_ADMIN"] as const) {
    assert.equal(organizationGuideHref(access(role)), "/how-to-guide");

    const items = authorizedOrganizationAdministrationNavigation(
      access(role),
    );

    assert.deepEqual(
      items
        .filter((item) => item.label === "How to Guide")
        .map((item) => item.href),
      ["/how-to-guide"],
    );

    assert.deepEqual(
      mobileSecondaryNavigation(access(role), false)
        .filter((item) => item.label === "How to Guide")
        .map((item) => item.href),
      ["/how-to-guide"],
    );
  }

  for (const role of ["STAFF_MANAGER", "STAFF_USER"] as const) {
    assert.equal(
      organizationGuideHref(access(role)),
      "/staff-how-to-guide",
    );

    const items = authorizedOrganizationAdministrationNavigation(
      access(role),
    );

    assert.deepEqual(
      items
        .filter((item) => item.label === "How to Guide")
        .map((item) => item.href),
      ["/staff-how-to-guide"],
    );

    assert.deepEqual(
      mobileSecondaryNavigation(access(role), false)
        .filter((item) => item.label === "How to Guide")
        .map((item) => item.href),
      ["/staff-how-to-guide"],
    );
  }

  assert.equal(
    organizationGuideHref({
      ...access("SUPER_ADMIN"),
      isSuperAdmin: true,
    }),
    null,
  );

  assert.equal(
    platformTemplatesNavigation.some(
      (item) => item.href === "/admin/how-to-guides",
    ),
    true,
  );
});

test("route guards preserve Owner Admin and staff separation", () => {
  assert.match(
    ownerGuide,
    /canAccessOrganizationGuide\(access, "\/how-to-guide"\)/,
  );
  assert.doesNotMatch(
    ownerGuide,
    /canAccessOrganizationGuide\(access, "\/staff-how-to-guide"/,
  );

  assert.match(
    guide,
    /canAccessOrganizationGuide\(access, "\/staff-how-to-guide"\)/,
  );
  assert.doesNotMatch(
    guide,
    /canAccessOrganizationGuide\(access, "\/how-to-guide"/,
  );
});

test("staff task guidance preserves required workflow work", () => {
  const tasks = staffContent.sections.find(
    (section) => section.key === "tasks",
  );

  assert.ok(tasks);

  assert.match(
    JSON.stringify(tasks),
    /Workflow-required Tasks cannot be deleted or manually reordered/,
  );

  assert.doesNotMatch(
    JSON.stringify(tasks),
    /remove workflow|required Tasks can be (?:removed|deleted)/i,
  );
});

test("staff figures remain code-controlled and free of production-looking PII", () => {
  for (const key of [
    "customer-register",
    "guided-intake-staff",
    "task-register-staff",
    "service-request-flow-staff",
    "portal-interaction",
    "inbox-pattern",
    "business-reach-staff",
  ]) {
    assert.match(figures, new RegExp(`"${key}"`));
  }

  const serialized = JSON.stringify(staffContent);

  assert.doesNotMatch(
    serialized,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  );
  assert.doesNotMatch(serialized, /\bCASE[- ]?\d{4,}\b/i);
});
