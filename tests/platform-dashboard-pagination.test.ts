import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPlatformDashboardData,
  indexNewestLicensesByOrganization,
  type PlatformDashboardCustomer,
  type PlatformDashboardMembership,
  type PlatformDashboardOrganization,
  type PlatformDashboardPortalUser,
  type PlatformDashboardRole,
} from "../lib/data/platform-dashboard-model.ts";
import {
  fetchAllSupabaseRows,
  SupabasePaginationError,
  type SupabaseOrder,
  type SupabaseOrderedRangeQuery,
  type SupabasePageResult,
} from "../lib/data/supabase-pagination.ts";

interface ControlledCall {
  from: number;
  orderBy: SupabaseOrder[];
  to: number;
}

const compareValues = (left: unknown, right: unknown) => {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
};

class ControlledQuery<Row extends object>
  implements SupabaseOrderedRangeQuery<Row>
{
  private readonly calls: ControlledCall[];
  private readonly errorFrom: number | undefined;
  private readonly orderBy: SupabaseOrder[] = [];
  private readonly rows: readonly Row[];

  constructor(
    rows: readonly Row[],
    calls: ControlledCall[],
    errorFrom?: number,
  ) {
    this.rows = rows;
    this.calls = calls;
    this.errorFrom = errorFrom;
  }

  order(column: string, options: { ascending: boolean }) {
    this.orderBy.push({ column, ascending: options.ascending });
    return this;
  }

  async range(from: number, to: number): Promise<SupabasePageResult<Row>> {
    this.calls.push({
      from,
      orderBy: [...this.orderBy],
      to,
    });

    if (from === this.errorFrom) {
      return {
        data: null,
        error: { code: "PAGE_FAILED", message: "controlled page failure" },
      };
    }

    const ordered = [...this.rows].sort((left, right) => {
      for (const order of this.orderBy) {
        const comparison = compareValues(
          Reflect.get(left, order.column),
          Reflect.get(right, order.column),
        );
        if (comparison !== 0) return order.ascending ? comparison : -comparison;
      }
      return 0;
    });

    return {
      data: ordered.slice(from, to + 1),
      error: null,
    };
  }
}

const controlledFactory = <Row extends object>(
  rows: readonly Row[],
  calls: ControlledCall[],
  errorFrom?: number,
) => () => new ControlledQuery(rows, calls, errorFrom);

const organization = (
  id: string,
  customerCount = 0,
): PlatformDashboardOrganization => ({
  id,
  name: `Organization ${id}`,
  slug: `organization-${id}`,
  status: "ACTIVE",
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
});

const emptyDashboardData = () => ({
  authUsers: [],
  cases: [],
  customers: [],
  memberships: [],
  organizations: [],
  organizationSettings: [],
  platformRoles: [],
  portalUsers: [],
  profiles: [],
});

test("pagination exhausts collections below, at, and above 1000 rows", async () => {
  for (const size of [7, 1000, 1001, 2505]) {
    const rows = Array.from({ length: size }, (_, index) => ({
      id: `row-${String(size - index - 1).padStart(4, "0")}`,
    }));
    const calls: ControlledCall[] = [];
    const result = await fetchAllSupabaseRows(
      controlledFactory(rows, calls),
      {
        collection: `controlled-${size}`,
        orderBy: [{ column: "id", ascending: true }],
      },
    );

    const expected = [...rows].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    assert.deepEqual(result, expected, `complete ordered result for ${size}`);
    assert.equal(new Set(result.map((row) => row.id)).size, size);

    const expectedRanges =
      size === 7
        ? [[0, 999]]
        : size === 1000
          ? [
              [0, 999],
              [1000, 1999],
            ]
          : size === 1001
            ? [
                [0, 999],
                [1000, 1999],
              ]
            : [
                [0, 999],
                [1000, 1999],
                [2000, 2999],
              ];
    assert.deepEqual(
      calls.map(({ from, to }) => [from, to]),
      expectedRanges,
      `inclusive ranges for ${size}`,
    );
  }
});

test("pagination applies stable composite ordering to every page", async () => {
  const rows = [
    { id: "c", name: "Beta" },
    { id: "b", name: "Alpha" },
    { id: "a", name: "Alpha" },
  ];
  const calls: ControlledCall[] = [];
  const result = await fetchAllSupabaseRows(
    controlledFactory(rows, calls),
    {
      collection: "stable rows",
      orderBy: [
        { column: "name", ascending: true },
        { column: "id", ascending: true },
      ],
      pageSize: 2,
    },
  );

  assert.deepEqual(
    result.map((row) => row.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    calls.map((call) => call.orderBy),
    [
      [
        { column: "name", ascending: true },
        { column: "id", ascending: true },
      ],
      [
        { column: "name", ascending: true },
        { column: "id", ascending: true },
      ],
    ],
  );
});

test("a subsequent-page query error rejects instead of returning partial rows", async () => {
  const rows = Array.from({ length: 1500 }, (_, index) => ({ id: index }));
  const calls: ControlledCall[] = [];

  await assert.rejects(
    fetchAllSupabaseRows(controlledFactory(rows, calls, 1000), {
      collection: "failing rows",
      orderBy: [{ column: "id", ascending: true }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof SupabasePaginationError);
      assert.equal(error.collection, "failing rows");
      assert.equal(error.from, 1000);
      assert.equal(error.to, 1999);
      assert.equal(error.queryError.code, "PAGE_FAILED");
      return true;
    },
  );
  assert.deepEqual(
    calls.map(({ from, to }) => [from, to]),
    [
      [0, 999],
      [1000, 1999],
    ],
  );
});

test("pagination refuses page sizes above the Supabase maximum", async () => {
  await assert.rejects(
    fetchAllSupabaseRows(controlledFactory([], []), {
      collection: "oversized page",
      orderBy: [{ column: "id", ascending: true }],
      pageSize: 1001,
    }),
    /between 1 and 1000/,
  );
});

test("pagination preserves complete organization, membership, and role metrics", async () => {
  const organizationRows = Array.from({ length: 1001 }, (_, index) =>
    organization(`org-${String(index).padStart(4, "0")}`),
  );
  const memberships: (PlatformDashboardMembership & { id: string })[] =
    Array.from({ length: 1001 }, (_, index) => ({
      id: `membership-${String(index).padStart(4, "0")}`,
      user_id: `user-${String(index).padStart(4, "0")}`,
      organization_id: "org-0000",
      role: "STAFF_USER",
      status: "ACTIVE",
      is_active: true,
    }));
  const roles: (PlatformDashboardRole & { id: string })[] = Array.from(
    { length: 1001 },
    (_, index) => ({
      id: `role-${String(index).padStart(4, "0")}`,
      user_id: `user-${String(index).padStart(4, "0")}`,
      role: "SUPER_ADMIN",
      is_active: index === 1000,
    }),
  );

  const [completeOrganizations, completeMemberships, completeRoles] =
    await Promise.all([
      fetchAllSupabaseRows(controlledFactory(organizationRows, []), {
        collection: "organizations",
        orderBy: [{ column: "id", ascending: true }],
      }),
      fetchAllSupabaseRows(controlledFactory(memberships, []), {
        collection: "memberships",
        orderBy: [{ column: "id", ascending: true }],
      }),
      fetchAllSupabaseRows(controlledFactory(roles, []), {
        collection: "roles",
        orderBy: [{ column: "id", ascending: true }],
      }),
    ]);
  const result = buildPlatformDashboardData({
    ...emptyDashboardData(),
    organizations: completeOrganizations,
    memberships: completeMemberships,
    platformRoles: completeRoles,
  });

  assert.equal(result.organizations.length, 1001);
  assert.equal(result.summary.organizations, 1001);
  assert.equal(result.summary.activeOrganizations, 1001);
  assert.equal(result.summary.organizationUsers, 1001);
  assert.equal(result.summary.platformAdministrators, 1);
  assert.equal(result.organizations[0]?.activeUsers, 1001);
});

test("Portal eligibility can depend on links and Customers after row 1000", async () => {
  const portalLinks: (PlatformDashboardPortalUser & { id: string })[] =
    Array.from({ length: 1001 }, (_, index) => ({
      id: `link-${String(index).padStart(4, "0")}`,
      user_id: "portal-user",
      organization_id: "portal-org",
      customer_id: `customer-${String(index).padStart(4, "0")}`,
      is_active: index === 1000,
    }));
  const customers: PlatformDashboardCustomer[] = Array.from(
    { length: 1001 },
    (_, index) => ({
      id: `customer-${String(index).padStart(4, "0")}`,
      organization_id: "portal-org",
      email: "portal@example.com",
      status: "ACTIVE",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }),
  );
  const [completeLinks, completeCustomers] = await Promise.all([
    fetchAllSupabaseRows(controlledFactory(portalLinks, []), {
      collection: "Portal links",
      orderBy: [{ column: "id", ascending: true }],
    }),
    fetchAllSupabaseRows(controlledFactory(customers, []), {
      collection: "Customers",
      orderBy: [{ column: "id", ascending: true }],
    }),
  ]);
  const result = buildPlatformDashboardData({
    ...emptyDashboardData(),
    organizations: [organization("portal-org", 1001)],
    profiles: [
      { id: "portal-user", email: "portal@example.com", is_active: true },
    ],
    authUsers: [{ id: "portal-user", email: "portal@example.com" }],
    portalUsers: completeLinks,
    customers: completeCustomers,
    organizationSettings: [
      { organization_id: "portal-org", portal_enabled: true },
    ],
  });

  assert.equal(completeLinks.length, 1001);
  assert.equal(completeCustomers.length, 1001);
  assert.equal(result.summary.pendingProvisioning, 0);
});

test("newest current license selection survives a page boundary", async () => {
  const licenses = [
    ...Array.from({ length: 999 }, (_, index) => ({
      id: `distractor-${String(index).padStart(4, "0")}`,
      organization_id: `other-${String(index).padStart(4, "0")}`,
      created_at: "2027-01-01T00:00:00.000Z",
    })),
    {
      id: "target-newest",
      organization_id: "target-org",
      created_at: "2026-02-02T00:00:00.000Z",
    },
    {
      id: "target-older",
      organization_id: "target-org",
      created_at: "2026-02-01T00:00:00.000Z",
    },
  ];
  const completeLicenses = await fetchAllSupabaseRows(
    controlledFactory(licenses, []),
    {
      collection: "licenses",
      orderBy: [
        { column: "created_at", ascending: false },
        { column: "id", ascending: true },
      ],
    },
  );
  const byOrganization =
    indexNewestLicensesByOrganization(completeLicenses);

  assert.equal(completeLicenses[999]?.id, "target-newest");
  assert.equal(completeLicenses[1000]?.id, "target-older");
  assert.equal(byOrganization.get("target-org")?.id, "target-newest");
});

test("repository pagination declares a unique deterministic key per collection", () => {
  const repository = readFileSync(
    "lib/data/platform-dashboard-repository.ts",
    "utf8",
  );

  for (const collection of [
    "organizations",
    "organization memberships",
    "profiles",
    "platform roles",
    "Customer Portal links",
    "organization Cases",
    "organization Customers",
    "organization settings",
    "organization licenses",
  ]) {
    assert.match(repository, new RegExp(`collection: "${collection}"`));
  }
  for (const [collection, uniqueColumn] of [
    ["organization memberships", "id"],
    ["profiles", "id"],
    ["platform roles", "id"],
    ["Customer Portal links", "id"],
    ["organization Cases", "id"],
    ["organization Customers", "id"],
    ["organization settings", "organization_id"],
  ]) {
    assert.match(
      repository,
      new RegExp(
        `collection: "${collection}",\\s*orderBy: \\[\\{ column: "${uniqueColumn}", ascending: true \\}\\]`,
      ),
    );
  }
  assert.match(
    repository,
    /collection: "organizations"[\s\S]*?column: "name"[\s\S]*?column: "id"/,
  );
  assert.match(
    repository,
    /collection: "organization licenses"[\s\S]*?column: "created_at", ascending: false[\s\S]*?column: "id"/,
  );
});
