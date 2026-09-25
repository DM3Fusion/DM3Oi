import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  derivePlatformUserStatus,
  normalizePlatformUserQuery,
  normalizePlatformUserRole,
  normalizePlatformUserStatus,
  platformUserMatchesFilters,
  platformUserMatchesSearch,
  type FilterablePlatformUser,
  type PlatformUserStatusInput,
} from "../lib/platform-user-filters.ts";
import {
  maskPlatformProfile,
  ORGANIZATION_SUPPORT_IDENTITY,
} from "../lib/auth/platform-privacy.ts";

const source = (path: string) => readFileSync(path, "utf8");
const user: FilterablePlatformUser = {
  display_name: "George Mimms",
  first_name: "George",
  last_name: "Mimms",
  email: "authoritative-auth@pobox.com",
  accessState: "Organization User",
  status: "ACTIVE",
  platformRoleAssigned: false,
  portalAccesses: [],
  memberships: [
    {
      organizationName: "Mimms Tax Service",
      role: "BUSINESS_OWNER",
      status: "ACTIVE",
    },
    {
      organizationName: "Example Services",
      role: "STAFF_MANAGER",
      status: "SUSPENDED",
    },
  ],
};

const statusInput = (
  changes: Partial<PlatformUserStatusInput> = {},
): PlatformUserStatusInput => ({
  authAccountExists: true,
  profileExists: true,
  profileActive: true,
  hasApplicationAssignment: false,
  effectivePlatformAccess: false,
  effectiveOrganizationAccess: false,
  effectivePortalAccess: false,
  membershipStatuses: [],
  ...changes,
});

test("aggregate platform-user status covers every approved state", () => {
  assert.equal(derivePlatformUserStatus(statusInput({ profileActive: false, effectivePlatformAccess: true })), "INACTIVE");
  assert.equal(derivePlatformUserStatus(statusInput({ effectivePlatformAccess: true })), "ACTIVE");
  assert.equal(derivePlatformUserStatus(statusInput({ effectiveOrganizationAccess: true })), "ACTIVE");
  assert.equal(derivePlatformUserStatus(statusInput({ effectivePortalAccess: true })), "ACTIVE");
  assert.equal(derivePlatformUserStatus(statusInput({ membershipStatuses: ["SUSPENDED"] })), "SUSPENDED");
  assert.equal(derivePlatformUserStatus(statusInput({ membershipStatuses: ["VERIFIED"] })), "VERIFIED");
  assert.equal(derivePlatformUserStatus(statusInput({ membershipStatuses: ["INVITED"] })), "INVITED");
  assert.equal(derivePlatformUserStatus(statusInput({ membershipStatuses: ["REVOKED"] })), "REVOKED");
  assert.equal(derivePlatformUserStatus(statusInput()), "PENDING_ACCESS");
  assert.equal(derivePlatformUserStatus(statusInput({ profileExists: false })), "AUTH_ONLY");
});

test("membership lifecycle precedence is deterministic without effective access", () => {
  assert.equal(
    derivePlatformUserStatus(statusInput({ membershipStatuses: ["REVOKED", "INVITED", "VERIFIED", "SUSPENDED"] })),
    "SUSPENDED",
  );
  assert.equal(
    derivePlatformUserStatus(statusInput({ membershipStatuses: ["REVOKED", "INVITED", "VERIFIED"] })),
    "VERIFIED",
  );
  assert.equal(
    derivePlatformUserStatus(statusInput({ membershipStatuses: ["REVOKED", "INVITED"] })),
    "INVITED",
  );
});

test("platform user search covers authoritative email, organization, role, lifecycle, and aggregate status", () => {
  for (const query of [
    " george ",
    "MIMMS",
    "authoritative-auth",
    "tax serv",
    "owner",
    "staff manager",
    "organization user",
    "suspended",
    "active",
  ]) {
    assert.equal(platformUserMatchesSearch(user, query), true, query);
  }
  assert.equal(platformUserMatchesSearch(user, "unknown value"), false);
  assert.equal(platformUserMatchesSearch(user, " "), true);
  assert.equal(normalizePlatformUserQuery(`  ${"x".repeat(220)}  `).length, 200);
});

test("role and status filters normalize safely and match all supported access representations", () => {
  assert.equal(platformUserMatchesFilters(user, "", "BUSINESS_OWNER", "ACTIVE"), true);
  assert.equal(platformUserMatchesFilters(user, "", "STAFF_USER", "ACTIVE"), false);
  assert.equal(platformUserMatchesFilters({ ...user, platformRoleAssigned: true }, "", "SUPER_ADMIN", "ALL"), true);
  const portalUser = { ...user, portalAccesses: [{ organizationName: "Portal Org", customerName: "Customer" }] };
  assert.equal(platformUserMatchesSearch(portalUser, "Customer Portal"), true);
  assert.equal(normalizePlatformUserRole("PUBLIC_USER"), "ALL");
  assert.equal(platformUserMatchesFilters(user, "", "ALL", "SUSPENDED"), false);
  assert.equal(normalizePlatformUserRole("staff_manager"), "STAFF_MANAGER");
  assert.equal(normalizePlatformUserRole("unsupported"), "ALL");
  assert.equal(normalizePlatformUserStatus("pending_access"), "PENDING_ACCESS");
  assert.equal(normalizePlatformUserStatus("unsupported"), "ALL");
});

test("platform repository authorizes before Auth enumeration and unions every identity source", () => {
  const repository = source("lib/data/platform-repository.ts");
  assert.match(repository, /async function loadPlatformData\(\)[\s\S]*await requireSuperAdmin\(\)[\s\S]*createAdminClient\(\)/);
  assert.match(repository, /admin\.auth\.admin\.listUsers\(\{ page, perPage \}\)/);
  assert.match(repository, /if \(result\.data\.users\.length < perPage\) break/);
  for (const sourceCollection of ["authUsers", "profiles", "platformRoles", "memberships", "portalUsers"]) {
    assert.match(repository, new RegExp(`\.\.\.data\\.${sourceCollection}\\.map`));
  }
  assert.match(repository, /email: authUser\?\.email \?\? profile\?\.email/);
  assert.match(repository, /lastSignInAt: authUser\?\.last_sign_in_at/);
  assert.match(repository, /userSinceAt: authUser\?\.created_at \?\? profile\?\.created_at/);
});

test("platform users page applies only normalized URL filters to its authorized result", () => {
  const page = source("app/admin/users/page.tsx");
  assert.match(page, /getPlatformAdministration\(\)/);
  assert.match(page, /searchParams: Promise<\{ q\?: string; role\?: string; status\?: string \}>/);
  assert.match(page, /normalizePlatformUserQuery\(query\.q\)/);
  assert.match(page, /normalizePlatformUserRole\(query\.role\)/);
  assert.match(page, /normalizePlatformUserStatus\(query\.status\)/);
  assert.match(page, /platformUserMatchesFilters\(user, q, role, status\)/);
  assert.doesNotMatch(page, /createClient|createAdminClient|\.from\(/);
});

test("platform filters are debounced, URL-backed, clearable, and preserve parameters", () => {
  const filters = source("components/platform-user-filters.tsx");
  assert.match(filters, /setTimeout\([\s\S]*300/);
  assert.match(filters, /new URLSearchParams\(searchParams\.toString\(\)\)/);
  assert.match(filters, /name="q"/);
  assert.match(filters, /name="role"/);
  assert.match(filters, /name="status"/);
  assert.match(filters, /All roles/);
  assert.match(filters, /All statuses/);
  assert.match(filters, /Clear Filters/);
  assert.doesNotMatch(filters, /Apply/);
});

test("directory retains row navigation, count, timestamps, and distinct empty states", () => {
  const page = source("app/admin/users/page.tsx");
  assert.match(page, /title="Platform Users"/);
  assert.match(page, /visibleUsers\.length[\s\S]*users\.length/);
  assert.match(page, /Last Sign In/);
  assert.match(page, /User Since/);
  assert.match(page, /Never/);
  assert.match(page, /formatPlatformDateTime/);
  assert.match(page, /<NavigableRow/);
  assert.match(page, /No users match the current filters\./);
  assert.match(page, /No platform users yet/);
  assert.match(page, /href="\/admin\/users\/new"/);
});

test("organization-facing platform privacy remains unchanged", () => {
  const profile = {
    id: "platform-id",
    display_name: "Private Admin",
    email: "private@example.com",
  };
  const masked = maskPlatformProfile(profile, new Set([profile.id]));
  assert.equal(masked.display_name, ORGANIZATION_SUPPORT_IDENTITY);
  assert.equal(masked.email, null);
  assert.equal(ORGANIZATION_SUPPORT_IDENTITY, "DM3Oi Sys Support");
});
