import "server-only";

import { getApplicationBaseUrl } from "@/lib/config/application-url";
import { createAdminClient } from "@/lib/supabase/admin";
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
  additionalInformation?: string;
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

  const hasDocuments = input.missingDocuments.trim().length > 0;
  let secureDocumentSystemUrl = "";
  let documentSubmissionInstructions = "";

  if (hasDocuments) {
    const admin = createAdminClient();
    const settingsResult = await admin
      .from("organization_settings")
      .select(
        "secure_document_system_url,document_submission_instructions",
      )
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    if (settingsResult.error) {
      console.error("Customer requirements routing settings lookup failed", {
        organizationId: input.organizationId,
        code: settingsResult.error.code,
        message: settingsResult.error.message,
      });
      throw new MissingDocumentsNoticeError(
        "Document submission settings could not be loaded.",
      );
    }

    secureDocumentSystemUrl =
      settingsResult.data?.secure_document_system_url?.trim() ?? "";
    documentSubmissionInstructions =
      settingsResult.data?.document_submission_instructions?.trim() ?? "";

    if (!secureDocumentSystemUrl || !documentSubmissionInstructions) {
      throw new MissingDocumentsNoticeError(
        "Configure the Secure Document System URL and Document Submission Instructions in Customer Portal settings before sending a document request.",
      );
    }

    let secureUrl: URL;
    try {
      secureUrl = new URL(secureDocumentSystemUrl);
    } catch {
      throw new MissingDocumentsNoticeError(
        "The configured Secure Document System URL is invalid.",
      );
    }

    if (secureUrl.protocol !== "https:") {
      throw new MissingDocumentsNoticeError(
        "The configured Secure Document System URL must use HTTPS.",
      );
    }

    secureDocumentSystemUrl = secureUrl.toString();
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
      additional_information: input.additionalInformation ?? "",
      secure_document_system_url: secureDocumentSystemUrl,
      document_submission_instructions: documentSubmissionInstructions,
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
      "Customer Portal access was prepared, but the Customer requirements notice could not be sent.",
    );
  }

  return delivery;
}
