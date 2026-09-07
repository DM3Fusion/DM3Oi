export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
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
