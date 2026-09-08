export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromName?: string;
};

export type MailResult =
  | { ok: true }
  | { ok: false; errorCode: string; safeMessage: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<MailResult>;
}

export interface EmailDeliveryStore {
  claim(): Promise<{ id: string } | null>;
  complete(deliveryId: string, result: MailResult): Promise<void>;
}

export type EmailDeliveryResult =
  | { ok: true; status: "SENT" | "ALREADY_RECORDED" }
  | { ok: false; errorCode: string; safeMessage: string };

export async function deliverEmailOnce(
  message: EmailMessage,
  provider: EmailProvider,
  store: EmailDeliveryStore,
): Promise<EmailDeliveryResult> {
  let claim: { id: string } | null;
  try {
    claim = await store.claim();
  } catch {
    return {
      ok: false,
      errorCode: "COMMUNICATION_PERSIST_FAILED",
      safeMessage: "Email notification could not be recorded.",
    };
  }
  if (!claim) return { ok: true, status: "ALREADY_RECORDED" };

  let result: MailResult;
  try {
    result = await provider.send(message);
  } catch {
    result = {
      ok: false,
      errorCode: "MAIL_SEND_FAILED",
      safeMessage: "Email notification could not be sent.",
    };
  }

  try {
    await store.complete(claim.id, result);
  } catch {
    return {
      ok: false,
      errorCode: "DELIVERY_STATE_UPDATE_FAILED",
      safeMessage: "Email delivery status could not be updated.",
    };
  }
  return result.ok ? { ok: true, status: "SENT" } : result;
}

export function buildNewServiceRequestEmail(input: {
  to: string;
  customerName: string;
  requestNumber: string;
  requestSubject: string;
  destinationUrl: string;
}): EmailMessage {
  return {
    to: input.to,
    subject: `New service request: ${input.requestNumber}`,
    text: [
      "New service request received",
      "",
      `Customer: ${input.customerName}`,
      `Request: ${input.requestNumber}`,
      `Subject: ${input.requestSubject}`,
      "",
      "Open the request in DM3Oi:",
      input.destinationUrl,
    ].join("\n"),
  };
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export function buildCustomerPortalInvitationEmail(input: {
  to: string;
  organizationName: string;
  invitationUrl: string;
}): EmailMessage {
  const organizationName = input.organizationName.replace(/[\r\n]+/g, " ").trim();
  const safeOrganizationName = escapeHtml(organizationName);
  const safeInvitationUrl = escapeHtml(input.invitationUrl);
  const subject = `${organizationName} invited you to their Customer Portal`;

  return {
    to: input.to,
    fromName: "DM3Oi™",
    subject,
    text: [
      `You're invited to the ${organizationName} Customer Portal`,
      "",
      `${organizationName} has invited you to access their Customer Portal, powered by DM3Oi™ Operational Intelligence.`,
      "",
      `Use the portal to view your service requests, case progress, and messages with ${organizationName}.`,
      "",
      "Access Customer Portal:",
      input.invitationUrl,
      "",
      `If you weren't expecting this invitation from ${organizationName}, you can ignore this email.`,
      "",
      "DM3Oi™ — Operational Intelligence",
      "People. Work. Progress. Intelligence.",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7fb;color:#17233c;font-family:Arial,sans-serif">
    <div style="max-width:620px;margin:0 auto;padding:32px 20px">
      <div style="background:#17233c;border-radius:12px 12px 0 0;padding:24px 28px;color:#fff">
        <div style="font-size:28px;font-weight:800;letter-spacing:-1px">DM3<span style="color:#18b8d9">Oi</span>™</div>
        <div style="margin-top:5px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase">Operational Intelligence</div>
      </div>
      <div style="background:#fff;border:1px solid #d9e1ec;border-top:0;border-radius:0 0 12px 12px;padding:32px 28px">
        <h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;color:#17233c">You&#39;re invited to the ${safeOrganizationName} Customer Portal</h1>
        <p style="margin:0 0 16px;line-height:1.6">${safeOrganizationName} has invited you to access their Customer Portal, powered by DM3Oi™ Operational Intelligence.</p>
        <p style="margin:0 0 24px;line-height:1.6">Use the portal to view your service requests, case progress, and messages with ${safeOrganizationName}.</p>
        <p style="margin:0 0 28px"><a href="${safeInvitationUrl}" style="display:inline-block;border-radius:7px;background:#18b8d9;color:#102039;padding:13px 20px;font-weight:700;text-decoration:none">Access Customer Portal</a></p>
        <p style="margin:0;color:#5d687b;font-size:14px;line-height:1.5">If you weren&#39;t expecting this invitation from ${safeOrganizationName}, you can ignore this email.</p>
        <div style="border-top:1px solid #e3e8ef;margin-top:28px;padding-top:20px;color:#5d687b;font-size:13px;line-height:1.6">DM3Oi™ — Operational Intelligence<br>People. Work. Progress. Intelligence.</div>
      </div>
    </div>
  </body>
</html>`,
  };
}

export async function deliverCustomerPortalInvitationEmail(
  input: {
    recipientEmail: string;
    organizationName: string;
    invitationUrl: string;
  },
  provider: EmailProvider,
): Promise<MailResult> {
  try {
    return await provider.send(
      buildCustomerPortalInvitationEmail({
        to: input.recipientEmail,
        organizationName: input.organizationName,
        invitationUrl: input.invitationUrl,
      }),
    );
  } catch {
    return {
      ok: false,
      errorCode: "MAIL_SEND_FAILED",
      safeMessage: "Customer Portal invitation email could not be sent.",
    };
  }
}
