import {
  isCustomerPortalIdentityConsistent,
  isEffectiveCustomerPortalAccess,
} from "../auth/customer-portal-effectiveness.ts";
import { isIncompleteCompatibilityCaseStatus } from "../case-lifecycle.ts";
import { classifyAccess } from "./user-provisioning.ts";
import type {
  OrganizationAdminRow,
  PlatformCustomerSummary,
  PlatformSummary,
} from "./platform-repository.ts";
import type { Database } from "../../types/database.ts";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];

export type PlatformDashboardOrganization = Tables["organizations"]["Row"] & {
  avatarUrl: string | null;
  customerCount: number;
  displayName: string;
  isSandbox: boolean;
  sandboxDesignationSuppressed: boolean;
  legalState: string;
  license: Tables["organization_licenses"]["Row"] | null;
};

export type PlatformDashboardMembership = Pick<
  Tables["organization_members"]["Row"],
  "is_active" | "organization_id" | "role" | "status" | "user_id"
>;

export type PlatformDashboardProfile = Pick<
  Tables["profiles"]["Row"],
  "email" | "id" | "is_active"
>;

export type PlatformDashboardRole = Pick<
  Tables["platform_user_roles"]["Row"],
  "is_active" | "role" | "user_id"
>;

export type PlatformDashboardPortalUser = Pick<
  Tables["customer_portal_users"]["Row"],
  "customer_id" | "is_active" | "organization_id" | "user_id"
>;

export type PlatformDashboardCase = Pick<
  Views["organization_cases"]["Row"],
  "created_at" | "organization_id" | "status" | "updated_at"
>;

export type PlatformDashboardCustomer = Pick<
  Views["organization_customers"]["Row"],
  "created_at" | "email" | "id" | "organization_id" | "status" | "updated_at"
>;

export type PlatformDashboardSettings = Pick<
  Tables["organization_settings"]["Row"],
  "organization_id" | "portal_enabled"
>;

export interface PlatformDashboardAuthUser {
  email: string | null | undefined;
  id: string;
}

export interface PlatformDashboardSourceData {
  authUsers: readonly PlatformDashboardAuthUser[];
  cases: readonly PlatformDashboardCase[];
  customers: readonly PlatformDashboardCustomer[];
  memberships: readonly PlatformDashboardMembership[];
  organizations: readonly PlatformDashboardOrganization[];
  organizationSettings: readonly PlatformDashboardSettings[];
  platformRoles: readonly PlatformDashboardRole[];
  portalUsers: readonly PlatformDashboardPortalUser[];
  profiles: readonly PlatformDashboardProfile[];
}

export interface PlatformDashboardData {
  customerSummary: PlatformCustomerSummary;
  organizations: OrganizationAdminRow[];
  summary: PlatformSummary;
}

export function indexNewestLicensesByOrganization<
  License extends { organization_id: string },
>(licensesNewestFirst: readonly License[]) {
  const licenseByOrganization = new Map<string, License>();

  for (const license of licensesNewestFirst) {
    if (!licenseByOrganization.has(license.organization_id)) {
      licenseByOrganization.set(license.organization_id, license);
    }
  }

  return licenseByOrganization;
}

const addCount = (counts: Map<string, number>, key: string) => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const recordActivity = (
  activityByOrganization: Map<string, string>,
  organizationId: string | null,
  updatedAt: string | null,
  createdAt: string | null,
) => {
  if (!organizationId) return;

  const activity = updatedAt ?? createdAt;
  if (!activity) return;

  const current = activityByOrganization.get(organizationId);
  if (!current || activity > current) {
    activityByOrganization.set(organizationId, activity);
  }
};

export function buildPlatformDashboardData(
  data: PlatformDashboardSourceData,
): PlatformDashboardData {
  const organizationById = new Map(
    data.organizations.map((organization) => [organization.id, organization]),
  );
  const profileById = new Map(
    data.profiles.map((profile) => [profile.id, profile]),
  );
  const authById = new Map(data.authUsers.map((user) => [user.id, user]));
  const settingsByOrganization = new Map(
    data.organizationSettings.map((settings) => [
      settings.organization_id,
      settings,
    ]),
  );
  const customerByIdentity = new Map(
    data.customers
      .filter(
        (customer) => customer.id !== null && customer.organization_id !== null,
      )
      .map((customer) => [
        `${customer.organization_id}:${customer.id}`,
        customer,
      ]),
  );

  const activeUsersByOrganization = new Map<string, number>();
  const ownersByOrganization = new Map<string, number>();
  const adminsByOrganization = new Map<string, number>();
  const membershipsByUser = new Map<
    string,
    PlatformDashboardMembership[]
  >();

  for (const membership of data.memberships) {
    const memberships = membershipsByUser.get(membership.user_id) ?? [];
    memberships.push(membership);
    membershipsByUser.set(membership.user_id, memberships);

    if (!membership.is_active) continue;

    addCount(activeUsersByOrganization, membership.organization_id);
    if (membership.role === "BUSINESS_OWNER") {
      addCount(ownersByOrganization, membership.organization_id);
    }
    if (membership.role === "BUSINESS_ADMIN") {
      addCount(adminsByOrganization, membership.organization_id);
    }
  }

  const openCasesByOrganization = new Map<string, number>();
  const lastActivityByOrganization = new Map<string, string>();

  for (const organizationCase of data.cases) {
    if (
      organizationCase.organization_id &&
      isIncompleteCompatibilityCaseStatus(organizationCase.status)
    ) {
      addCount(openCasesByOrganization, organizationCase.organization_id);
    }
    recordActivity(
      lastActivityByOrganization,
      organizationCase.organization_id,
      organizationCase.updated_at,
      organizationCase.created_at,
    );
  }

  for (const customer of data.customers) {
    recordActivity(
      lastActivityByOrganization,
      customer.organization_id,
      customer.updated_at,
      customer.created_at,
    );
  }

  const organizations: OrganizationAdminRow[] = data.organizations.map(
    ({ customerCount, ...organization }) => ({
      ...organization,
      activeUsers: activeUsersByOrganization.get(organization.id) ?? 0,
      businessOwners: ownersByOrganization.get(organization.id) ?? 0,
      businessAdmins: adminsByOrganization.get(organization.id) ?? 0,
      openCases: openCasesByOrganization.get(organization.id) ?? 0,
      customers: customerCount,
      lastActivity: lastActivityByOrganization.get(organization.id) ?? null,
    }),
  );

  const activePlatformRoleUserIds = new Set(
    data.platformRoles
      .filter((role) => role.role === "SUPER_ADMIN" && role.is_active)
      .map((role) => role.user_id),
  );
  const portalUsersByUser = new Map<string, PlatformDashboardPortalUser[]>();

  for (const portalUser of data.portalUsers) {
    const portalUsers = portalUsersByUser.get(portalUser.user_id) ?? [];
    portalUsers.push(portalUser);
    portalUsersByUser.set(portalUser.user_id, portalUsers);
  }

  const userIds = new Set([
    ...data.authUsers.map((user) => user.id),
    ...data.profiles.map((profile) => profile.id),
    ...data.platformRoles.map((role) => role.user_id),
    ...data.memberships.map((membership) => membership.user_id),
    ...data.portalUsers.map((portalUser) => portalUser.user_id),
  ]);

  let pendingProvisioning = 0;

  for (const userId of userIds) {
    const authUser = authById.get(userId);
    const profile = profileById.get(userId);
    const memberships = membershipsByUser.get(userId) ?? [];
    const portalUsers = portalUsersByUser.get(userId) ?? [];
    const effectivePlatformAccess = Boolean(
      authUser &&
        profile?.is_active === true &&
        activePlatformRoleUserIds.has(userId),
    );
    const effectiveOrganizationAccess = Boolean(
      authUser &&
        profile?.is_active === true &&
        memberships.some((membership) => {
          const organization = organizationById.get(membership.organization_id);
          return (
            membership.status === "ACTIVE" &&
            membership.is_active &&
            organization?.status === "ACTIVE"
          );
        }),
    );
    const effectivePortalAccess = Boolean(
      authUser &&
        profile?.is_active === true &&
        portalUsers.some((portalUser) => {
          const organization = organizationById.get(portalUser.organization_id);
          const customer = customerByIdentity.get(
            `${portalUser.organization_id}:${portalUser.customer_id}`,
          );
          const settings = settingsByOrganization.get(
            portalUser.organization_id,
          );

          return isEffectiveCustomerPortalAccess({
            authAccountExists: true,
            profileActive: true,
            linkActive: portalUser.is_active,
            identityConsistent: isCustomerPortalIdentityConsistent({
              customerEmail: customer?.email,
              profileEmail: profile.email,
              authEmail: authUser.email,
            }),
            organizationFound: Boolean(organization),
            organizationStatus: organization?.status ?? null,
            customerFound: Boolean(customer),
            customerStatus: customer?.status ?? null,
            portalEnabled: settings?.portal_enabled,
          });
        }),
    );

    if (
      classifyAccess({
        platformAdmin: effectivePlatformAccess,
        activeOrganizationMembership: effectiveOrganizationAccess,
        activePortalAccess: effectivePortalAccess,
      }) === "Pending Access"
    ) {
      pendingProvisioning += 1;
    }
  }

  const byOrganization = organizations
    .filter((organization) => organization.customers > 0)
    .map((organization) => ({
      organizationId: organization.id,
      organizationName: organization.name,
      customerCount: organization.customers,
    }));

  return {
    organizations,
    customerSummary: {
      totalCustomers: byOrganization.reduce(
        (total, organization) => total + organization.customerCount,
        0,
      ),
      byOrganization,
    },
    summary: {
      organizations: organizations.length,
      activeOrganizations: organizations.filter(
        (organization) => organization.status === "ACTIVE",
      ).length,
      inactiveOrganizations: organizations.filter(
        (organization) => organization.status !== "ACTIVE",
      ).length,
      platformAdministrators: data.platformRoles.filter(
        (role) => role.role === "SUPER_ADMIN" && role.is_active,
      ).length,
      organizationUsers: new Set(
        data.memberships
          .filter((membership) => membership.is_active)
          .map((membership) => membership.user_id),
      ).size,
      pendingProvisioning,
    },
  };
}
