import type { CustomerPortalOnboardingStatus } from "./customer-portal-onboarding.ts";

export type CustomerPortalProvisioningIntent = "ENABLE" | "SEND" | "RESEND";

export const isUsableCustomerPortalEmail = (email: string) =>
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

export function canReuseCustomerPortalStatus(
  intent: CustomerPortalProvisioningIntent,
  status: CustomerPortalOnboardingStatus,
) {
  return (
    status.state === "ACTIVE" ||
    (intent === "SEND" && status.state === "INVITATION_SENT")
  );
}

export function customerPortalRelationFailureMessage(error: {
  code?: string | null;
  message?: string | null;
}) {
  if (
    error.code === "23514" &&
    error.message?.toLowerCase().includes("internal access")
  ) {
    return "This email belongs to an internal DM3Oi user and cannot be used for Customer Portal access.";
  }
  if (error.code === "23503") {
    return "The Customer Portal identity no longer matches this Customer. Refresh and try again.";
  }
  if (error.code === "42501") {
    return "Customer Portal provisioning is temporarily unavailable. Contact a platform administrator.";
  }
  return "Customer Portal access could not be linked. Refresh and try again.";
}
