"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import {
  emailTemplateDefinitions,
  isEmailTemplateKey,
  validateEmailTemplateContent,
} from "@/lib/email/templates";
import { sendTrackedTemplateEmail } from "@/lib/email/tracked-delivery";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const destination = (templateKey: string, status: string) =>
  `/admin/email-templates?template=${encodeURIComponent(templateKey)}&${status}`;

export async function updateEmailTemplateAction(form: FormData) {
  await requireSuperAdmin();
  const templateKey = field(form, "templateKey");
  const subject = field(form, "subject");
  const opening = field(form, "openingMessage");
  const closing = field(form, "closingMessage");
  if (
    !isEmailTemplateKey(templateKey) ||
    !subject ||
    subject.length > 200 ||
    !opening ||
    opening.length > 2000 ||
    !closing ||
    closing.length > 2000 ||
    !validateEmailTemplateContent(templateKey, {
      subject_template: subject,
      opening_message: opening,
      closing_message: closing,
    }).ok
  )
    redirect(destination(templateKey, "error=invalid"));

  const supabase = await createClient();
  const result = await supabase.rpc("update_platform_email_template", {
    target_template_key: templateKey,
    target_subject_template: subject,
    target_opening_message: opening,
    target_closing_message: closing,
  });
  if (result.error || result.data !== true) {
    console.error("Platform email template update failed", {
      operation: "updatePlatformEmailTemplate",
      templateKey,
      code: result.error?.code,
      message: result.error?.message,
    });
    redirect(destination(templateKey, "error=save"));
  }
  revalidatePath("/admin/email-templates");
  redirect(destination(templateKey, "saved=1"));
}

export async function sendEmailTemplateTestAction(form: FormData) {
  const context = await requireSuperAdmin();
  const templateKey = field(form, "templateKey");
  if (!isEmailTemplateKey(templateKey) || !context.user.email)
    redirect(destination(templateKey, "error=test"));
  const definition = emailTemplateDefinitions.find((item) => item.key === templateKey)!;
  const recipientName = context.displayName || "Platform Operationsistrator";
  const result = await sendTrackedTemplateEmail({
    templateKey,
    recipientEmail: context.user.email,
    variables: {
      ...definition.sampleVariables,
      recipient_first_name: recipientName.split(/\s+/)[0],
      recipient_name: recipientName,
      recipient_email: context.user.email,
    },
  });
  if (!result.ok) {
    console.error("Platform email template test failed", {
      operation: "sendEmailTemplateTest",
      templateKey,
      code: result.errorCode,
    });
    redirect(destination(templateKey, "error=test"));
  }
  redirect(destination(templateKey, "testSent=1"));
}
