import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getCustomerPortalAccessReason,
  isCustomerPortalIdentityConsistent,
  resolveCustomerPortalAccesses,
} from "../lib/auth/customer-portal-effectiveness.ts";
import { getSupersededCustomerPortalUserIds } from "../lib/customer-portal-provisioning.ts";

const source = (path: string) => readFileSync(path, "utf8");
const organizationId = "organization-a";
const customerId = "customer-a";
const replacementUserId = "user-current";
const link = (
  userId: string,
  overrides: Partial<{
    organization_id: string;
    customer_id: string;
  }> = {},
) => ({
  organization_id: organizationId,
  customer_id: customerId,
  user_id: userId,
  ...overrides,
});

test("unchanged Customer Portal identity has no superseded user", () => {
  assert.deepEqual(
    getSupersededCustomerPortalUserIds([link(replacementUserId)], {
      organizationId,
      customerId,
      replacementUserId,
    }),
    [],
  );
});

test("replacement retires the old identity before activating the current identity", () => {
  assert.deepEqual(
    getSupersededCustomerPortalUserIds(
      [link("user-old"), link(replacementUserId)],
      { organizationId, customerId, replacementUserId },
    ),
    ["user-old"],
  );

  const service = source("lib/data/customer-portal-provisioning-service.ts");
  const provision = service.slice(
    service.indexOf("export async function provisionCustomerPortalAccess"),
    service.indexOf("export async function disableCustomerPortalAccess"),
  );
  assert.ok(
    provision.indexOf("await retireSupersededCustomerPortalIdentities") <
      provision.indexOf('const relation = await admin.from("customer_portal_users").upsert'),
  );
  assert.match(
    provision,
    /user_id: authUser\.id,[\s\S]*is_active: true/,
  );
});

test("every historical identity is selected for retirement exactly once", () => {
  assert.deepEqual(
    getSupersededCustomerPortalUserIds(
      [
        link("user-old-a"),
        link("user-old-b"),
        link("user-old-a"),
        link(replacementUserId),
      ],
      { organizationId, customerId, replacementUserId },
    ),
    ["user-old-a", "user-old-b"],
  );
});

test("replacement planning and writes cannot cross organization/customer scope", () => {
  assert.deepEqual(
    getSupersededCustomerPortalUserIds(
      [
        link("user-old"),
        link("other-organization-user", {
          organization_id: "organization-b",
        }),
        link("other-customer-user", { customer_id: "customer-b" }),
      ],
      { organizationId, customerId, replacementUserId },
    ),
    ["user-old"],
  );

  const service = source("lib/data/customer-portal-provisioning-service.ts");
  const retirement =
    service.match(
      /async function retireSupersededCustomerPortalIdentities[\s\S]*?\n}\n\nconst unavailable/,
    )?.[0] ?? "";
  assert.match(
    retirement,
    /from\("customer_portal_users"\)[\s\S]*\.eq\("organization_id", input\.organizationId\)[\s\S]*\.eq\("customer_id", input\.customerId\)[\s\S]*\.neq\("user_id", input\.replacementUserId\)/,
  );
  assert.match(
    retirement,
    /from\("customer_portal_invitations"\)[\s\S]*status: "CANCELLED"[\s\S]*\.eq\("organization_id", input\.organizationId\)[\s\S]*\.eq\("customer_id", input\.customerId\)[\s\S]*\.in\("user_id", supersededUserIds\)[\s\S]*\.in\("status", \["PENDING", "SENT"\]\)/,
  );
});

const validAccess = {
  authAccountExists: true,
  profileActive: true,
  linkActive: true,
  identityConsistent: true,
  organizationStatus: "ACTIVE",
  customerStatus: "ACTIVE",
  portalEnabled: true,
};

const resolveIdentity = async (identity: {
  customerEmail: string | null;
  profileEmail: string | null;
  authEmail: string | null;
}) => {
  const rows: Record<string, unknown[]> = {
    organizations: [{ id: organizationId, status: "ACTIVE" }],
    customers: [
      {
        id: customerId,
        organization_id: organizationId,
        email: identity.customerEmail,
        status: "ACTIVE",
      },
    ],
    organization_settings: [
      { organization_id: organizationId, portal_enabled: true },
    ],
    profiles: [
      {
        id: replacementUserId,
        email: identity.profileEmail,
        is_active: true,
      },
    ],
  };
  const admin = {
    from: (table: string) => ({
      select: () => ({
        in: async () => ({ data: rows[table] ?? [], error: null }),
      }),
    }),
    auth: {
      admin: {
        getUserById: async () => ({
          data: {
            user: identity.authEmail
              ? { id: replacementUserId, email: identity.authEmail }
              : null,
          },
          error: null,
        }),
      },
    },
  } as unknown as Parameters<typeof resolveCustomerPortalAccesses>[0];
  const links = [
    {
      id: "portal-link-current",
      organization_id: organizationId,
      customer_id: customerId,
      user_id: replacementUserId,
      is_active: true,
      created_at: "2026-10-03T00:00:00Z",
      updated_at: "2026-10-03T00:00:00Z",
    },
  ];
  return resolveCustomerPortalAccesses(admin, links, {
    authAccountExists: true,
    profileActive: true,
  });
};

test("portal resolver rejects a stale linked identity", async () => {
  assert.equal(
    isCustomerPortalIdentityConsistent({
      customerEmail: "current@example.com",
      profileEmail: "former@example.com",
      authEmail: "former@example.com",
    }),
    false,
  );
  assert.equal(
    getCustomerPortalAccessReason({
      ...validAccess,
      identityConsistent: false,
    }),
    "PORTAL_IDENTITY_MISMATCH",
  );
  const [resolved] = await resolveIdentity({
    customerEmail: "current@example.com",
    profileEmail: "former@example.com",
    authEmail: "former@example.com",
  });
  assert.equal(resolved.effective, false);
  assert.equal(resolved.reason, "PORTAL_IDENTITY_MISMATCH");
});

test("portal resolver accepts a current identity with normalized matching emails", async () => {
  assert.equal(
    isCustomerPortalIdentityConsistent({
      customerEmail: " Current@Example.com ",
      profileEmail: "current@example.com",
      authEmail: "CURRENT@example.com",
    }),
    true,
  );
  assert.equal(getCustomerPortalAccessReason(validAccess), "VALID");
  const [resolved] = await resolveIdentity({
    customerEmail: " Current@Example.com ",
    profileEmail: "current@example.com",
    authEmail: "CURRENT@example.com",
  });
  assert.equal(resolved.effective, true);
  assert.equal(resolved.reason, "VALID");
});

test("missing Customer email or inconsistent identity fails closed", async () => {
  for (const identity of [
    {
      customerEmail: null,
      profileEmail: "current@example.com",
      authEmail: "current@example.com",
    },
    {
      customerEmail: "current@example.com",
      profileEmail: null,
      authEmail: "current@example.com",
    },
    {
      customerEmail: "current@example.com",
      profileEmail: "current@example.com",
      authEmail: undefined,
    },
  ])
    assert.equal(isCustomerPortalIdentityConsistent(identity), false);

  const [resolved] = await resolveIdentity({
    customerEmail: null,
    profileEmail: "current@example.com",
    authEmail: "current@example.com",
  });
  assert.equal(resolved.effective, false);
  assert.equal(resolved.reason, "PORTAL_IDENTITY_MISMATCH");
});
