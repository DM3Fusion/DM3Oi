import type { TrackedEmailDeliveryResult } from "@/lib/email/tracked-delivery";

export type InvitationDeliveryClassification =
  | "ACCEPTED"
  | "CONFIRMED_NOT_SENT"
  | "UNKNOWN";

/**
 * Conservative invitation delivery classification.
 *
 * Never assume an SMTP exception proves non-delivery.
 * SMTP acceptance remains authoritative even when audit finalization fails.
 */
export function classifyInvitationDelivery(
  delivery: TrackedEmailDeliveryResult,
): InvitationDeliveryClassification {
  if (delivery.ok && delivery.transport === "SENT") {
    return "ACCEPTED";
  }

  if (!delivery.ok) {
    switch (delivery.errorCode) {
      case "EMAIL_TEMPLATE_INVALID":
      case "DELIVERY_CLAIM_FAILED":
      case "MAIL_NOT_CONFIGURED":
      case "RECIPIENT_REJECTED":
        return "CONFIRMED_NOT_SENT";

      default:
        return "UNKNOWN";
    }
  }

  return "UNKNOWN";
}
