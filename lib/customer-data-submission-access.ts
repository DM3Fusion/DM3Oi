import type { ApplicationRole } from "@/lib/auth/permissions";

export const customerDataSubmissionRoles = [
  "BUSINESS_OWNER",
  "BUSINESS_ADMIN",
] as const satisfies readonly ApplicationRole[];

type CustomerDataSubmissionAccess = {
  isSuperAdmin: boolean;
  internalAccess: boolean;
  activeOrganization?: { role: ApplicationRole } | null;
};

export function canSubmitCustomerData(
  context: CustomerDataSubmissionAccess | null,
) {
  if (!context?.internalAccess || !context.activeOrganization) return false;

  return (
    context.isSuperAdmin ||
    customerDataSubmissionRoles.some(
      (role) => role === context.activeOrganization?.role,
    )
  );
}
