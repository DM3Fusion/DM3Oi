import "server-only";
import { sendTrackedTemplateEmail } from "@/lib/email/tracked-delivery";
import type { EmailTemplateKey } from "@/lib/email/templates";
import type { TrackedEmailDeliveryResult } from "@/lib/email/tracked-delivery";
import { resolveOrganizationDisplayName } from "@/lib/data/organization-display-name";

const roleLabel = (role: string) =>
  role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export async function sendOrganizationInvitationEmail(input: {
  resend: boolean;
  organizationId: string;
  organizationName: string;
  membershipId: string;
  recipientUserId: string;
  recipientEmail: string;
  recipientFirstName: string;
  recipientName: string;
  role: string;
  invitationUrl: string;
}): Promise<TrackedEmailDeliveryResult> {
  const templateKey: EmailTemplateKey = input.resend
    ? "ORGANIZATION_USER_INVITATION_RESEND"
    : "ORGANIZATION_USER_INVITATION";

  const organizationDisplayName =
    await resolveOrganizationDisplayName(
      input.organizationId,
      input.organizationName,
    );

  return sendTrackedTemplateEmail({
    templateKey,
    recipientEmail: input.recipientEmail,
    references: {
      organizationId: input.organizationId,
      recipientUserId: input.recipientUserId,
      membershipId: input.membershipId,
    },
    variables: {
      organization_name: organizationDisplayName,
      recipient_first_name: input.recipientFirstName,
      recipient_name: input.recipientName,
      recipient_email: input.recipientEmail,
      role: roleLabel(input.role),
      action_url: input.invitationUrl,
    },
  });
}
