export const CUSTOMER_PORTAL_INVITATION_CONTEXT = "customer_portal" as const;

export function customerPortalInvitationMetadata(
  existingData: Record<string, unknown> | null | undefined,
  organizationName: string,
) {
  return {
    ...(existingData ?? {}),
    organization_name: organizationName,
    invitation_context: CUSTOMER_PORTAL_INVITATION_CONTEXT,
  };
}
