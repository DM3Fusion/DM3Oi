export const platformUserRoles = [
  "SUPER_ADMIN",
  "BUSINESS_OWNER",
  "BUSINESS_ADMIN",
  "STAFF_MANAGER",
  "STAFF_USER",
  "PUBLIC_USER",
] as const;

export type PlatformUserRoleFilter = "ALL" | (typeof platformUserRoles)[number];

export const platformUserStatuses = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "VERIFIED",
  "INVITED",
  "REVOKED",
  "PENDING_ACCESS",
  "AUTH_ONLY",
] as const;

export type PlatformUserStatus = (typeof platformUserStatuses)[number];
export type PlatformUserStatusFilter = "ALL" | PlatformUserStatus;

export const platformRoleLabels: Record<(typeof platformUserRoles)[number], string> = {
  SUPER_ADMIN: "Super Admin",
  BUSINESS_OWNER: "Business Owner",
  BUSINESS_ADMIN: "Business Admin",
  STAFF_MANAGER: "Staff Manager",
  STAFF_USER: "Staff User",
  PUBLIC_USER: "Public User",
};

export const platformStatusLabels: Record<PlatformUserStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
  VERIFIED: "Verified",
  INVITED: "Invited",
  REVOKED: "Revoked",
  PENDING_ACCESS: "Pending Access",
  AUTH_ONLY: "Auth Only",
};

type MembershipLifecycle = "INVITED" | "VERIFIED" | "ACTIVE" | "SUSPENDED" | "REVOKED";

export type PlatformUserStatusInput = {
  authAccountExists: boolean;
  profileExists: boolean;
  profileActive: boolean | null;
  hasApplicationAssignment: boolean;
  effectivePlatformAccess: boolean;
  effectiveOrganizationAccess: boolean;
  effectivePortalAccess: boolean;
  membershipStatuses: readonly MembershipLifecycle[];
};

export function derivePlatformUserStatus(input: PlatformUserStatusInput): PlatformUserStatus {
  if (input.profileExists && input.profileActive === false) return "INACTIVE";

  if (
    input.authAccountExists &&
    (input.effectivePlatformAccess ||
      input.effectiveOrganizationAccess ||
      input.effectivePortalAccess)
  ) {
    return "ACTIVE";
  }

  for (const status of ["SUSPENDED", "VERIFIED", "INVITED", "REVOKED"] as const) {
    if (input.membershipStatuses.includes(status)) return status;
  }

  if (input.authAccountExists && !input.profileExists && !input.hasApplicationAssignment) {
    return "AUTH_ONLY";
  }

  return "PENDING_ACCESS";
}

type SearchablePlatformMembership = {
  organizationName: string;
  role: string;
  status: string;
};

type SearchablePortalAccess = {
  organizationName: string;
  customerName: string;
};

export type FilterablePlatformUser = {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  accessState: string;
  status: PlatformUserStatus;
  platformRoleAssigned: boolean;
  memberships: SearchablePlatformMembership[];
  portalAccesses: SearchablePortalAccess[];
};

export const normalizePlatformUserQuery = (value?: string) =>
  (value ?? "").trim().slice(0, 200);

export function platformUserMatchesSearch(
  user: FilterablePlatformUser,
  query: string,
) {
  const term = normalizePlatformUserQuery(query).toLowerCase();
  if (!term) return true;

  const membershipFields = user.memberships.flatMap((membership) => [
    membership.organizationName,
    membership.role,
    membership.role.replaceAll("_", " "),
    platformRoleLabels[membership.role as keyof typeof platformRoleLabels],
    membership.status,
    membership.status.replaceAll("_", " "),
  ]);
  const portalFields = user.portalAccesses.flatMap((access) => [
    access.organizationName,
    access.customerName,
    "PUBLIC_USER",
    "Public User",
  ]);
  const fields = [
    user.display_name,
    user.first_name,
    user.last_name,
    [user.first_name, user.last_name].filter(Boolean).join(" "),
    user.email,
    user.accessState,
    user.status,
    platformStatusLabels[user.status],
    user.platformRoleAssigned ? "SUPER_ADMIN" : null,
    user.platformRoleAssigned ? "Super Admin" : null,
    ...membershipFields,
    ...portalFields,
  ];

  return fields.some((value) => value?.toLowerCase().includes(term));
}

export function normalizePlatformUserRole(value?: string): PlatformUserRoleFilter {
  const normalized = (value ?? "").toUpperCase();
  return platformUserRoles.includes(normalized as (typeof platformUserRoles)[number])
    ? (normalized as PlatformUserRoleFilter)
    : "ALL";
}

export function normalizePlatformUserStatus(value?: string): PlatformUserStatusFilter {
  const normalized = (value ?? "").toUpperCase();
  return platformUserStatuses.includes(normalized as PlatformUserStatus)
    ? (normalized as PlatformUserStatusFilter)
    : "ALL";
}

export function platformUserMatchesFilters(
  user: FilterablePlatformUser,
  query: string,
  role: PlatformUserRoleFilter,
  status: PlatformUserStatusFilter,
) {
  if (status !== "ALL" && user.status !== status) return false;
  if (role === "SUPER_ADMIN" && !user.platformRoleAssigned) return false;
  if (role === "PUBLIC_USER" && !user.portalAccesses.length) return false;
  if (
    role !== "ALL" &&
    role !== "SUPER_ADMIN" &&
    role !== "PUBLIC_USER" &&
    !user.memberships.some((membership) => membership.role === role)
  ) {
    return false;
  }
  return platformUserMatchesSearch(user, query);
}
