import "server-only";
import {
  sendTrackedTemplateEmail,
  type TrackedEmailDeliveryResult,
} from "@/lib/email/tracked-delivery";

export async function sendCustomerPortalInvitationEmail(
  input: {
    recipientEmail: string;
    recipientName: string;
    recipientUserId: string;
    organizationName: string;
    organizationId: string;
    customerId: string;
    invitationUrl: string;
  },
): Promise<TrackedEmailDeliveryResult> {
  const firstName = input.recipientName.trim().split(/\s+/)[0] || "Customer";
  return sendTrackedTemplateEmail({
    templateKey: "CUSTOMER_PORTAL_INVITATION",
    recipientEmail: input.recipientEmail,
    references: {
      organizationId: input.organizationId,
      recipientUserId: input.recipientUserId,
      customerId: input.customerId,
    },
    variables: {
      organization_name: input.organizationName,
      recipient_first_name: firstName,
      recipient_name: input.recipientName,
      recipient_email: input.recipientEmail,
      action_url: input.invitationUrl,
    },
  });
}
