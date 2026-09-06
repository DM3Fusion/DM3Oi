import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  hasPermission,
  type ApplicationRole,
} from "../lib/auth/permissions.ts";

const source = (path: string) => readFileSync(path, "utf8");
const access = (role: ApplicationRole, isSuperAdmin = false) => ({
  isSuperAdmin,
  internalAccess: role !== "PUBLIC_USER",
  activeOrganization: { role },
});

test("organization user detail is membership-scoped and requires VIEW_USERS", () => {
  const detail = source("app/users/[membershipId]/page.tsx");
  assert.ok(existsSync("app/users/[membershipId]/page.tsx"));
  assert.match(detail, /hasPermission\(access, "VIEW_USERS"\)/);
  assert.match(detail, /\.eq\("id", membershipId\)/);
  assert.match(detail, /\.eq\("organization_id", access\.activeOrganization\.id\)/);
  assert.match(detail, /\.maybeSingle\(\)/);
  assert.match(detail, /if \(!membership\) notFound\(\)/);
  assert.doesNotMatch(detail, /\/admin\/users\/\$\{/);
});

test("read and management behavior follows the centralized role matrix", () => {
  for (const role of ["STAFF_USER", "STAFF_MANAGER"] as const) {
    assert.equal(hasPermission(access(role), "VIEW_USERS"), true);
    assert.equal(hasPermission(access(role), "MANAGE_USERS"), false);
  }
  for (const role of ["BUSINESS_ADMIN", "BUSINESS_OWNER"] as const) {
    assert.equal(hasPermission(access(role), "VIEW_USERS"), true);
    assert.equal(hasPermission(access(role), "MANAGE_USERS"), true);
  }
  assert.equal(hasPermission(access("SUPER_ADMIN", true), "VIEW_USERS"), true);
  assert.equal(hasPermission(access("SUPER_ADMIN", true), "MANAGE_USERS"), true);
  assert.equal(hasPermission(access("PUBLIC_USER"), "VIEW_USERS"), false);
});

test("organization membership mutations are capability and tenant scoped", () => {
  const action = source("lib/data/organization-user-actions.ts");
  assert.match(action, /hasPermission\(access, "MANAGE_USERS"\)/);
  assert.match(action, /\.eq\("id", membershipId\)/);
  assert.match(action, /\.eq\("organization_id", organizationId\)/);
  assert.match(action, /\.update\(\{ role, is_active:/);
  assert.doesNotMatch(action, /requireSuperAdmin/);
});

test("organization detail exposes only membership controls to managers", () => {
  const detail = source("app/users/[membershipId]/page.tsx");
  assert.match(detail, /hasPermission\(access, "MANAGE_USERS"\)/);
  assert.match(detail, /Display name/);
  assert.match(detail, /Email/);
  assert.match(detail, /Organization role/);
  assert.match(detail, /Membership status/);
  assert.match(detail, /Invitation state/);
  assert.match(detail, /updateOrganizationMembershipAction/);
  assert.match(detail, /ResendInviteButton/);
  assert.doesNotMatch(detail, /Platform role|SUPER ADMIN|password|security/i);
});

test("platform identity route remains separate and SUPER_ADMIN-only", () => {
  const platformDetail = source("app/admin/users/[userId]/page.tsx");
  const platformRepository = source("lib/data/platform-repository.ts");
  assert.match(platformDetail, /getPlatformUser\(userId\)/);
  assert.match(platformRepository, /requireSuperAdmin\(\)/);
  assert.doesNotMatch(source("app/users/page.tsx"), /\/admin\/users\/\$\{m\./);
});
