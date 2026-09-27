import "server-only";
import { getApplicationBaseUrl } from "@/lib/config/application-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { applicationEmailProvider } from "@/lib/email/mailer";
import {
  defaultEmailTemplates,
  renderEmailTemplate,
  type EmailTemplate,
  type EmailTemplateKey,
  type EmailTemplateVariables,
} from "@/lib/email/templates";
import type { DeliveryAudit, MailResult } from "@/lib/email/delivery";

export type TrackedEmailDeliveryResult =
  | ({
      ok: true;
      transport: "SENT";
      audit: DeliveryAudit;
      auditErrorCode?: "DELIVERY_STATE_UPDATE_FAILED";
    } & Extract<MailResult, { ok: true }>)
  | ({
      transport: "NOT_SENT";
      audit: DeliveryAudit;
    } & Extract<MailResult, { ok: false }>);

export type TrackedDeliveryReferences = {
  organizationId?: string | null;
  recipientUserId?: string | null;
  membershipId?: string | null;
  customerId?: string | null;
  caseId?: string | null;
  serviceRequestId?: string | null;
};

type DeliveryRow = { id: string; tracking_token: string };

const emailTable = (admin: ReturnType<typeof createAdminClient>) =>
  admin.from("email_deliveries" as never);

export async function loadPlatformEmailTemplate(templateKey: EmailTemplateKey) {
  const admin = createAdminClient();
  const result = await admin
    .from("platform_email_templates" as never)
    .select("template_key,subject_template,opening_message,closing_message")
    .eq("template_key", templateKey)
    .maybeSingle();
  if (result.error) {
    console.error("Platform email template lookup failed", {
      operation: "loadPlatformEmailTemplate",
      templateKey,
      code: result.error.code,
      message: result.error.message,
    });
  }
  return (result.data as EmailTemplate | null) ?? defaultEmailTemplates[templateKey];
}

export async function sendTrackedTemplateEmail(input: {
  templateKey: EmailTemplateKey;
  recipientEmail: string;
  variables: EmailTemplateVariables;
  references?: TrackedDeliveryReferences;
}): Promise<TrackedEmailDeliveryResult> {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  const references = input.references ?? {};
  const admin = createAdminClient();
  let message: ReturnType<typeof renderEmailTemplate>;
  try {
    message = renderEmailTemplate(
      await loadPlatformEmailTemplate(input.templateKey),
      input.variables,
    );
  } catch {
    return {
      ok: false,
      transport: "NOT_SENT",
      audit: "FINALIZATION_FAILED",
      errorCode: "EMAIL_TEMPLATE_INVALID",
      safeMessage: "Email notification could not be prepared.",
    };
  }

  const inserted = await emailTable(admin)
    .insert({
      organization_id: references.organizationId ?? null,
      template_key: input.templateKey,
      recipient_email: recipientEmail,
      recipient_user_id: references.recipientUserId ?? null,
      membership_id: references.membershipId ?? null,
      customer_id: references.customerId ?? null,
      case_id: references.caseId ?? null,
      service_request_id: references.serviceRequestId ?? null,
      subject: message.subject,
      delivery_status: "PENDING",
    } as never)
    .select("id,tracking_token")
    .single();
  const delivery = inserted.data as DeliveryRow | null;
  if (inserted.error || !delivery) {
    console.error("Email delivery claim failed", {
      operation: "claimEmailDelivery",
      templateKey: input.templateKey,
      organizationId: references.organizationId ?? null,
      code: inserted.error?.code ?? "DELIVERY_CLAIM_FAILED",
      message: inserted.error?.message,
    });
    return {
      ok: false,
      transport: "NOT_SENT",
      audit: "FINALIZATION_FAILED",
      errorCode: "DELIVERY_CLAIM_FAILED",
      safeMessage: "Email notification could not be recorded.",
    };
  }

  const baseUrl = getApplicationBaseUrl();
  const trackingPixel = baseUrl
    ? `<img src="${baseUrl}/api/email/open/${delivery.tracking_token}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`
    : "";
  let result: MailResult;
  try {
    result = await applicationEmailProvider.send({
      to: recipientEmail,
      subject: message.subject,
      text: message.text,
      html: message.html.replace("</body>", `${trackingPixel}</body>`),
      fromName: "DM3Oi™",
    });
  } catch {
    result = {
      ok: false,
      errorCode: "MAIL_SEND_FAILED",
      safeMessage: "Email notification could not be sent.",
    };
  }

  const now = new Date().toISOString();
  const updated = await emailTable(admin)
    .update((result.ok
      ? {
          delivery_status: "SENT",
          provider_message_id: result.messageId ?? null,
          sent_at: now,
          failed_at: null,
          error_code: null,
          error_summary: null,
          updated_at: now,
        }
      : {
          delivery_status: "FAILED",
          failed_at: now,
          error_code: result.errorCode.slice(0, 100),
          error_summary: result.safeMessage.slice(0, 500),
          updated_at: now,
        }) as never)
    .eq("id", delivery.id)
    .eq("delivery_status", "PENDING")
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data) {
    console.error("Email delivery finalization failed", {
      operation: "finalizeEmailDelivery",
      deliveryId: delivery.id,
      code: updated.error?.code?.slice(0, 100) ?? "DELIVERY_NOT_PENDING",
      message: updated.error?.message?.slice(0, 500) ?? "Pending delivery was not updated.",
    });
    if (result.ok)
      return {
        ...result,
        transport: "SENT",
        audit: "FINALIZATION_FAILED",
        auditErrorCode: "DELIVERY_STATE_UPDATE_FAILED",
      };
    return {
      ...result,
      transport: "NOT_SENT",
      audit: "FINALIZATION_FAILED",
    };
  }
  return result.ok
    ? { ...result, transport: "SENT", audit: "RECORDED" }
    : { ...result, transport: "NOT_SENT", audit: "RECORDED" };
}
