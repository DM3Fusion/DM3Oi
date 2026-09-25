import type { RoleConfiguration } from "./models";

/** Role caps describe policy for the application layer. A future database milestone
 * must enforce constrained counts transactionally to prevent concurrent over-allocation. */
export const ROLE_CONFIGURATIONS: readonly RoleConfiguration[] = [
  { key: "SUPER_ADMIN", displayName: "Super Administrator", scope: "PLATFORM", maximumAllowed: 1, description: "Full platform-level administration." },
  { key: "BUSINESS_ADMIN", displayName: "Business Administrator", scope: "ORGANIZATION", maximumAllowed: 2, description: "Organization configuration and user administration." },
  { key: "BUSINESS_OWNER", displayName: "Business Owner", scope: "ORGANIZATION", maximumAllowed: 2, description: "Executive ownership and organization oversight." },
  { key: "STAFF_MANAGER", displayName: "Staff Manager", scope: "ORGANIZATION", description: "Manages case assignment, review, and staff workload." },
  { key: "STAFF_USER", displayName: "Staff User", scope: "ORGANIZATION", description: "Completes operational case work and tasks." },
] as const;
