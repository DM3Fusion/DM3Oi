import "server-only";

import { getApplicationBaseUrl } from "@/lib/config/application-url";
import {
  CustomerPortalProvisioningError,
  provisionCustomerPortalAccess,
} from "@/lib/data/customer-portal-provisioning-service";
import { sendTrackedTemplateEmail } from "@/lib/email/tracked-delivery";

export class MissingDocumentsNoticeError extends Error {
  constructor(public readonly safeMessage: string) {
    super(safeMessage);
    this.name = "MissingDocumentsNoticeError";
  }
}

export async function sendMissingDocumentsNotice(input: {
  organizationId: string;
  organizationName: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  caseId: string;
  caseNumber: string;
  missingDocuments: string;
  actorUserId: string;
}) {
  let portalStatus;

  try {
    portalStatus = await provisionCustomerPortalAccess({
      organizationId: input.organizationId,
      organizationName: input.organizationName,
      customerId: input.customerId,
      actorUserId: input.actorUserId,
      intent: "SEND",
    });
  } catch (error) {
    if (error instanceof CustomerPortalProvisioningError) {
      throw new MissingDocumentsNoticeError(error.safeMessage);
    }
    throw error;
  }

  const recipientEmail =
    portalStatus.recipientEmail?.trim().toLowerCase() ??
    input.customerEmail?.trim().toLowerCase() ??
    "";

  if (!recipientEmail) {
    throw new MissingDocumentsNoticeError(
      "Add a valid Customer email before sending a notice.",
    );
  }

  const firstName =
    input.customerName.trim().split(/\s+/)[0] || "Customer";

  const baseUrl =
    getApplicationBaseUrl() || "https://dm3oi.com";

  const delivery = await sendTrackedTemplateEmail({
    templateKey: "MISSING_DOCUMENTS_NOTICE",
    recipientEmail,
    references: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      caseId: input.caseId,
    },
    variables: {
      organization_name: input.organizationName,
      recipient_first_name: firstName,
      recipient_name: input.customerName,
      recipient_email: recipientEmail,
      case_number: input.caseNumber,
      missing_documents: input.missingDocuments,
      action_url: `${baseUrl.replace(/\/$/, "")}/portal`,
    },
  });

  if (!delivery.ok) {
    console.error("Missing documents email delivery failed", {
      organizationId: input.organizationId,
      customerId: input.customerId,
      caseId: input.caseId,
      recipientEmail,
      transport: delivery.transport,
      audit: delivery.audit,
      errorCode: delivery.errorCode,
      safeMessage: delivery.safeMessage,
    });

    throw new MissingDocumentsNoticeError(
      "Customer Portal access was prepared, but the missing-documents notice could not be sent.",
    );
  }

  return delivery;
}
