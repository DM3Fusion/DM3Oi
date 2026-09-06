export interface AccessRoutingState {
  isSuperAdmin: boolean;
  internalAccess: boolean;
  provisioned: boolean;
  hasActiveOrganization: boolean;
  customerPortalCount?: number;
}

export type RootExperience = "PLATFORM" | "ORGANIZATION" | "PORTAL" | "UNPROVISIONED";

export function resolveRootExperience(access: AccessRoutingState): RootExperience {
  if (access.isSuperAdmin && !access.hasActiveOrganization) return "PLATFORM";
  if (access.internalAccess && access.hasActiveOrganization) return "ORGANIZATION";
  if ((access.customerPortalCount ?? 0) > 0) return "PORTAL";
  return "UNPROVISIONED";
}

export function hasTenantInternalAccess(access: { internalAccess: boolean; activeOrganization?: unknown; isSuperAdmin?: boolean; license?: { workspaceAllowed: boolean } | null } | null): boolean {
  return Boolean(access?.internalAccess && access.activeOrganization && (access.isSuperAdmin || !access.license || access.license.workspaceAllowed));
}
