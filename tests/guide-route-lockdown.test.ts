import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  authorizedOrganizationAdministrationNavigation,
  mobileSecondaryNavigation,
  platformNavigation,
  platformTemplatesNavigation,
} from "../lib/application-navigation.ts";
import {
  canAccessOrganizationGuide,
  organizationGuideHref,
  type ApplicationRole,
  type PermissionContext,
} from "../lib/auth/permissions.ts";

const source = (path: string) => readFileSync(path, "utf8");
const active = (role: ApplicationRole): PermissionContext => ({
  isSuperAdmin: false,
  internalAccess: true,
  activeOrganization: { role },
});

test("guide route authorization permits only the matching active organization role", () => {
  for (const role of ["BUSINESS_OWNER", "BUSINESS_ADMIN"] as const) {
    const context = active(role);
    assert.equal(canAccessOrganizationGuide(context, "/how-to-guide"), true);
    assert.equal(canAccessOrganizationGuide(context, "/staff-how-to-guide"), false);
  }

  for (const role of ["STAFF_MANAGER", "STAFF_USER"] as const) {
    const context = active(role);
    assert.equal(canAccessOrganizationGuide(context, "/how-to-guide"), false);
    assert.equal(canAccessOrganizationGuide(context, "/staff-how-to-guide"), true);
  }
});

test("signed-out platform-only and organization-less contexts cannot access either guide", () => {
  const denied: Array<PermissionContext | null> = [
    null,
    { isSuperAdmin: false, internalAccess: false, activeOrganization: null },
    { isSuperAdmin: false, internalAccess: true, activeOrganization: null },
    { isSuperAdmin: true, internalAccess: true, activeOrganization: null },
    { isSuperAdmin: true, internalAccess: true, activeOrganization: { role: "SUPER_ADMIN" } },
  ];

  for (const context of denied) {
    assert.equal(canAccessOrganizationGuide(context, "/how-to-guide"), false);
    assert.equal(canAccessOrganizationGuide(context, "/staff-how-to-guide"), false);
  }
});

test("inactive lifecycle states cannot produce guide access under canonical context semantics", () => {
  const lifecycle = source("supabase/migrations/20260922170000_dm3oi_member_lifecycle_and_profile_title.sql");
  const verifiedLifecycle = source("supabase/migrations/20260922190000_dm3oi_verified_membership_lifecycle.sql");
  const accessMigration = source("supabase/migrations/20261003200000_dm3oi_customer_portal_identity_database_hardening.sql");

  assert.match(lifecycle, /new\.is_active := new\.status = 'ACTIVE'/);
  assert.match(lifecycle, /before insert or update of status[\s\S]*organization_members/);
  assert.match(verifiedLifecycle, /add value if not exists 'VERIFIED'/);
  assert.match(accessMigration, /from public\.organization_members member[\s\S]*where member\.user_id=actor_id[\s\S]*and member\.is_active[\s\S]*and organization\.status='ACTIVE'/);

  for (const status of ["INVITED", "VERIFIED", "SUSPENDED", "REVOKED"] as const) {
    const canonicalContext: PermissionContext = {
      isSuperAdmin: false,
      internalAccess: false,
      activeOrganization: null,
    };
    assert.equal(organizationGuideHref(canonicalContext), null, status);
  }
});

test("multi-organization authorization follows only the current active role", () => {
  const memberships = [
    { id: "organization-a", role: "BUSINESS_ADMIN" as const },
    { id: "organization-b", role: "STAFF_USER" as const },
  ];
  const organizationA = {
    ...active(memberships[0].role),
    organizations: memberships,
  };
  const organizationB = {
    ...organizationA,
    activeOrganization: { role: memberships[1].role },
  };

  assert.equal(organizationGuideHref(organizationA), "/how-to-guide");
  assert.equal(organizationGuideHref(organizationB), "/staff-how-to-guide");
});

test("role changes select the new guide on the next access-context resolution", () => {
  assert.equal(organizationGuideHref(active("STAFF_USER")), "/staff-how-to-guide");
  assert.equal(organizationGuideHref(active("BUSINESS_ADMIN")), "/how-to-guide");
  assert.equal(organizationGuideHref(active("BUSINESS_ADMIN")), "/how-to-guide");
  assert.equal(organizationGuideHref(active("STAFF_USER")), "/staff-how-to-guide");

  const context = source("lib/auth/context.ts");
  assert.match(context, /React clears cache\(\) between Server Component requests/);
  assert.match(context, /export const getAccessContext = cache\(resolveAccessContext\)/);
  assert.match(context, /\.rpc\(\s*"get_my_access_context"/);
});

test("desktop and mobile expose exactly one role-appropriate guide item", () => {
  const expectations = new Map<ApplicationRole, string>([
    ["BUSINESS_OWNER", "/how-to-guide"],
    ["BUSINESS_ADMIN", "/how-to-guide"],
    ["STAFF_MANAGER", "/staff-how-to-guide"],
    ["STAFF_USER", "/staff-how-to-guide"],
  ]);

  for (const [role, href] of expectations) {
    const context = active(role);
    for (const items of [
      authorizedOrganizationAdministrationNavigation(context),
      mobileSecondaryNavigation(context, false),
    ]) {
      assert.deepEqual(
        items.filter((item) => item.label === "How to Guide").map((item) => item.href),
        [href],
        role,
      );
    }
  }

  assert.equal(
    platformNavigation.some(
      (item) =>
        item.href === "/admin/email-templates" &&
        item.label === "Templates",
    ),
    true,
  );
  assert.equal(
    platformTemplatesNavigation.some(
      (item) =>
        item.href === "/admin/how-to-guides" &&
        item.label === "How-to Guide Templates",
    ),
    true,
  );
  assert.equal(
    mobileSecondaryNavigation({
      isSuperAdmin: true,
      internalAccess: true,
      activeOrganization: null,
    }, true).some((item) => item.label === "How to Guide"),
    false,
  );
});

test("guide routes are protected server pages and absent from every public allowlist", () => {
  const proxy = source("proxy.ts");
  const ownerGuide = source("app/how-to-guide/page.tsx");
  const staffGuide = source("app/staff-how-to-guide/page.tsx");
  const publicRoutes = proxy.match(/const publicRoutes=\[([^\]]*)\]/)?.[1] ?? "";

  assert.doesNotMatch(publicRoutes, /how-to-guide/);
  assert.match(
    proxy,
    /if\(!authenticated&&protectedRoute\)[\s\S]*new URL\("\/login"/,
  );
  assert.match(
    ownerGuide,
    /if \(!canAccessOrganizationGuide\(access, "\/how-to-guide"\)\)\s*\{\s*notFound\(\);\s*\}/,
  );
  assert.match(
    staffGuide,
    /if \(!canAccessOrganizationGuide\(access, "\/staff-how-to-guide"\)\)\s*\{\s*notFound\(\);\s*\}/,
  );
  assert.doesNotMatch(
    ownerGuide,
    /createClient\(|getLiveOrganizationData|getOperationalIntelligence/,
  );
  assert.doesNotMatch(
    staffGuide,
    /createClient\(|getLiveOrganizationData|getOperationalIntelligence/,
  );
});
