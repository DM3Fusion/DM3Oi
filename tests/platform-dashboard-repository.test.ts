import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPlatformDashboardData,
  type PlatformDashboardOrganization,
  type PlatformDashboardSourceData,
} from "../lib/data/platform-dashboard-model.ts";

const source = (path: string) => readFileSync(path, "utf8");
const repository = source("lib/data/platform-dashboard-repository.ts");
const administrationRepository = source("lib/data/platform-repository.ts");
const rootPage = source("app/page.tsx");

const organization = (
  id: string,
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED",
  customerCount: number,
  overrides: Partial<PlatformDashboardOrganization> = {},
): PlatformDashboardOrganization => ({
  id,
  name: `Organization ${id}`,
  slug: `organization-${id}`,
  status,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  avatar_path: null,
  avatar_updated_at: null,
  business_postal_code: null,
  sandbox_designation_suppressed: false,
  avatarUrl: null,
  customerCount,
  displayName: `Organization ${id}`,
  isSandbox: false,
  sandboxDesignationSuppressed: false,
  legalState: "AUTHORIZED",
  license: null,
  ...overrides,
});

const dashboardFixture = (): PlatformDashboardSourceData => ({
  organizations: [
    organization("active-org", "ACTIVE", 2, {
      avatarUrl: "https://signed.example/active-org",
      displayName: "Active Org (Sandbox)",
      isSandbox: true,
    }),
    organization("suspended-org", "SUSPENDED", 1),
  ],
  memberships: [
    {
      user_id: "organization-user",
      organization_id: "active-org",
      role: "BUSINESS_OWNER",
      status: "ACTIVE",
      is_active: true,
    },
    {
      user_id: "pending-user",
      organization_id: "active-org",
      role: "BUSINESS_ADMIN",
      status: "INVITED",
      is_active: true,
    },
  ],
  profiles: [
    { id: "platform-user", email: "platform@example.com", is_active: true },
    {
      id: "organization-user",
      email: "organization@example.com",
      is_active: true,
    },
    { id: "portal-user", email: "portal@example.com", is_active: true },
    { id: "pending-user", email: "pending@example.com", is_active: true },
    { id: "profile-only", email: "profile@example.com", is_active: true },
  ],
  platformRoles: [
    { user_id: "platform-user", role: "SUPER_ADMIN", is_active: true },
    { user_id: "profile-only", role: "SUPER_ADMIN", is_active: true },
  ],
  portalUsers: [
    {
      user_id: "portal-user",
      organization_id: "active-org",
      customer_id: "portal-customer",
      is_active: true,
    },
    {
      user_id: "pending-user",
      organization_id: "active-org",
      customer_id: "mismatched-customer",
      is_active: true,
    },
  ],
  cases: [
    {
      organization_id: "active-org",
      status: "NEW",
      created_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-02T00:00:00.000Z",
    },
    {
      organization_id: "active-org",
      status: "COMPLETED",
      created_at: "2026-02-03T00:00:00.000Z",
      updated_at: "2026-02-04T00:00:00.000Z",
    },
    {
      organization_id: "suspended-org",
      status: "WAITING",
      created_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-02T00:00:00.000Z",
    },
  ],
  customers: [
    {
      id: "portal-customer",
      organization_id: "active-org",
      email: "PORTAL@example.com",
      status: "ACTIVE",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-02T00:00:00.000Z",
    },
    {
      id: "mismatched-customer",
      organization_id: "active-org",
      email: "different@example.com",
      status: "ACTIVE",
      created_at: "2026-03-03T00:00:00.000Z",
      updated_at: "2026-03-04T00:00:00.000Z",
    },
  ],
  organizationSettings: [
    { organization_id: "active-org", portal_enabled: true },
  ],
  authUsers: [
    { id: "platform-user", email: "platform@example.com" },
    { id: "organization-user", email: "organization@example.com" },
    { id: "portal-user", email: "portal@example.com" },
    { id: "pending-user", email: "pending@example.com" },
  ],
});

test("dedicated dashboard aggregation preserves all six metric definitions", () => {
  const result = buildPlatformDashboardData(dashboardFixture());

  assert.deepEqual(result.summary, {
    organizations: 2,
    activeOrganizations: 1,
    inactiveOrganizations: 1,
    platformAdministrators: 2,
    organizationUsers: 2,
    pendingProvisioning: 2,
  });
});

test("Pending Provisioning honors effective platform, organization, and Portal access", () => {
  const fixture = dashboardFixture();
  const baseline = buildPlatformDashboardData(fixture);
  assert.equal(baseline.summary.pendingProvisioning, 2);

  const portalGateFailures: [
    string,
    PlatformDashboardSourceData,
    number,
  ][] = [
    [
      "authentication account",
      {
        ...fixture,
        authUsers: fixture.authUsers.filter((user) => user.id !== "portal-user"),
      },
      3,
    ],
    [
      "active profile",
      {
        ...fixture,
        profiles: fixture.profiles.map((profile) =>
          profile.id === "portal-user"
            ? { ...profile, is_active: false }
            : profile,
        ),
      },
      3,
    ],
    [
      "active Portal link",
      {
        ...fixture,
        portalUsers: fixture.portalUsers.map((portalUser) =>
          portalUser.user_id === "portal-user"
            ? { ...portalUser, is_active: false }
            : portalUser,
        ),
      },
      3,
    ],
    [
      "consistent customer, profile, and Auth email",
      {
        ...fixture,
        profiles: fixture.profiles.map((profile) =>
          profile.id === "portal-user"
            ? { ...profile, email: "mismatch@example.com" }
            : profile,
        ),
      },
      3,
    ],
    [
      "active organization",
      {
        ...fixture,
        organizations: fixture.organizations.map((item) =>
          item.id === "active-org"
            ? { ...item, status: "SUSPENDED" }
            : item,
        ),
      },
      4,
    ],
    [
      "active customer",
      {
        ...fixture,
        customers: fixture.customers.map((customer) =>
          customer.id === "portal-customer"
            ? { ...customer, status: "INACTIVE" }
            : customer,
        ),
      },
      3,
    ],
    [
      "enabled Customer Portal settings",
      {
        ...fixture,
        organizationSettings: [
          { organization_id: "active-org", portal_enabled: false },
        ],
      },
      3,
    ],
  ];

  for (const [gate, input, expectedPending] of portalGateFailures) {
    assert.equal(
      buildPlatformDashboardData(input).summary.pendingProvisioning,
      expectedPending,
      gate,
    );
  }
});

test("organization and customer dashboard contracts preserve complete coverage and aggregates", () => {
  const result = buildPlatformDashboardData(dashboardFixture());

  assert.deepEqual(
    result.organizations.map((item) => item.id),
    ["active-org", "suspended-org"],
  );
  assert.equal(result.organizations[0]?.displayName, "Active Org (Sandbox)");
  assert.equal(
    result.organizations[0]?.avatarUrl,
    "https://signed.example/active-org",
  );
  assert.equal(result.organizations[0]?.activeUsers, 2);
  assert.equal(result.organizations[0]?.businessOwners, 1);
  assert.equal(result.organizations[0]?.businessAdmins, 1);
  assert.equal(result.organizations[0]?.openCases, 1);
  assert.equal(result.organizations[0]?.lastActivity, "2026-03-04T00:00:00.000Z");
  assert.equal(result.organizations[1]?.openCases, 1);
  assert.deepEqual(result.customerSummary, {
    totalCustomers: 3,
    byOrganization: [
      {
        organizationId: "active-org",
        organizationName: "Organization active-org",
        customerCount: 2,
      },
      {
        organizationId: "suspended-org",
        organizationName: "Organization suspended-org",
        customerCount: 1,
      },
    ],
  });
});

test("dashboard repository authorizes first and retains parallel root loading", () => {
  assert.ok(
    repository.indexOf("await requireSuperAdmin()") <
      repository.indexOf("await createClient()"),
  );
  assert.match(rootPage, /Promise\.all\(\[/);
  assert.match(rootPage, /getPlatformDashboard\(\)/);
  assert.match(rootPage, /getPlatformAnalytics\(query\)/);
  assert.match(rootPage, /getOverviewDownloadCount\(\)/);
});

test("dashboard repository avoids user hydration and directory construction", () => {
  assert.doesNotMatch(repository, /attachAuthorizedAvatarUrls|attachAvatarUrls/);
  assert.doesNotMatch(repository, /PlatformUserRow|derivePlatformUserStatus/);
  assert.doesNotMatch(repository, /portalAccesses/);
  assert.match(repository, /\.from\("profiles"\)\.select\("id,email,is_active"\)/);
  assert.match(repository, /resolveOwnedOrganizationAvatarUrl/);
});

test("dashboard case and customer queries retrieve only narrow fields", () => {
  assert.match(
    repository,
    /\.from\("organization_cases"\)[\s\S]*?\.select\("id,organization_id,status,created_at,updated_at"\)/,
  );
  assert.match(
    repository,
    /\.from\("organization_customers"\)[\s\S]*?\.select\("id,organization_id,email,status,created_at,updated_at"\)/,
  );
  assert.doesNotMatch(
    repository,
    /\.from\("(?:organization_cases|organization_customers)"\)\s*\.select\("\*"\)/,
  );
});

test("administrative pages retain their existing full repository", () => {
  assert.match(
    administrationRepository,
    /export async function getPlatformAdministration\(\)/,
  );
  assert.doesNotMatch(
    administrationRepository,
    /getPlatformDashboard|platform-dashboard-repository/,
  );
});
