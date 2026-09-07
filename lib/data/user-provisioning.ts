export const ORGANIZATION_USER_ROLES = [
  "BUSINESS_OWNER",
  "BUSINESS_ADMIN",
  "STAFF_MANAGER",
  "STAFF_USER",
] as const;

export function isOrganizationUserRole(value: string) {
  return ORGANIZATION_USER_ROLES.some((role) => role === value);
}

export type OrganizationUserRole = (typeof ORGANIZATION_USER_ROLES)[number];

export function assignableOrganizationUserRoles(
  actorRole: OrganizationUserRole,
): readonly OrganizationUserRole[] {
  return actorRole === "BUSINESS_OWNER"
    ? ORGANIZATION_USER_ROLES
    : actorRole === "BUSINESS_ADMIN"
      ? ["STAFF_MANAGER", "STAFF_USER"]
      : [];
}

export function organizationRoleLimit(role: OrganizationUserRole) {
  return role === "BUSINESS_OWNER" || role === "BUSINESS_ADMIN" ? 2 : null;
}

export function classifyAccess(input: {
  platformAdmin: boolean;
  activeOrganizationMembership: boolean;
  activePortalAccess: boolean;
}) {
  if (input.platformAdmin) return "Platform Admin" as const;
  if (input.activeOrganizationMembership) return "Organization User" as const;
  if (input.activePortalAccess) return "Customer Portal User" as const;
  return "Pending Access" as const;
}
