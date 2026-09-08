import "server-only";
import {
  deliverCustomerPortalInvitationEmail,
  type EmailProvider,
  type MailResult,
} from "@/lib/email/delivery";
import { applicationEmailProvider } from "@/lib/email/mailer";

export async function sendCustomerPortalInvitationEmail(
  input: {
    recipientEmail: string;
    organizationName: string;
    invitationUrl: string;
  },
  provider: EmailProvider = applicationEmailProvider,
): Promise<MailResult> {
  return deliverCustomerPortalInvitationEmail(input, provider);
}
