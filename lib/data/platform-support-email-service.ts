import "server-only";

import { sendApplicationEmail } from "@/lib/email/mailer";
import { createAdminClient } from "@/lib/supabase/admin";

const PLATFORM_SUPPORT_EMAIL = "dm3@pobox.com";

export async function notifyPlatformOwnerOfSupportRequest(
  request: {
    id: string;
    organizationName: string;
    submitterName: string;
    submitterEmail: string;
    category: string;
    subject: string;
    message: string;
  },
) {
  const admin = createAdminClient();

  let result:
    | Awaited<ReturnType<typeof sendApplicationEmail>>
    | null = null;

  try {
    result = await sendApplicationEmail({
      to: PLATFORM_SUPPORT_EMAIL,
      subject:
        `DM3Oi Contact — ${request.organizationName} — ` +
        request.subject,
      text: [
        "A new authenticated DM3Oi contact request was submitted.",
        "",
        `Organization: ${request.organizationName}`,
        `Submitted by: ${request.submitterName}`,
        `Email: ${request.submitterEmail}`,
        `Category: ${request.category}`,
        `Request ID: ${request.id}`,
        "",
        request.message,
        "",
        "Open Platform Inbox in DM3Oi to review and respond.",
      ].join("\n"),
      fromName: "DM3Oi™",
    });
  } catch {
    result = {
      ok: false,
      errorCode: "MAIL_SEND_FAILED",
      safeMessage:
        "Platform notification email could not be sent.",
    };
  }

  await admin.rpc(
    "finalize_platform_support_notification_server" as never,
    {
      target_request_id: request.id,
      target_sent: result.ok,
      target_error: result.ok
        ? null
        : result.safeMessage,
    } as never,
  );

  return result;
}
