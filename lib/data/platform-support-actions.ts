"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  requireInternalContext,
  requireSuperAdmin,
} from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { sendApplicationEmail } from "@/lib/email/mailer";
import { notifyPlatformOwnerOfSupportRequest } from "@/lib/data/platform-support-email-service";
import {
  isPlatformSupportCategory,
  isPlatformSupportStatus,
} from "@/lib/platform-support";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value);

const value = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();

const validUuid = (input: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    input,
  );

export async function submitPlatformSupportRequestAction(
  form: FormData,
) {
  const context = await requireInternalContext();
  const category = value(form, "category").toUpperCase();
  const subject = value(form, "subject").slice(0, 240);
  const message = value(form, "message").slice(0, 5000);

  if (!isPlatformSupportCategory(category)) {
    redirect(
      "/help/contact-dm3oi?error=Select+a+valid+contact+category.",
    );
  }

  if (!subject) {
    redirect(
      "/help/contact-dm3oi?error=Enter+a+subject.",
    );
  }

  if (!message) {
    redirect(
      "/help/contact-dm3oi?error=Enter+a+message.",
    );
  }

  const supabase = await createClient();
  const result = await supabase.rpc(
    "submit_platform_support_request" as never,
    {
      target_organization_id: context.activeOrganization.id,
      target_category: category,
      target_subject: subject,
      target_message: message,
    } as never,
  );

  const rawData: unknown = result.data;

  if (result.error || !isRecord(rawData)) {
    console.error("Platform support submission failed", {
      organizationId: context.activeOrganization.id,
      userId: context.user.id,
      code: result.error?.code,
      message: result.error?.message,
    });

    redirect(
      "/help/contact-dm3oi?error=Your+message+could+not+be+submitted.",
    );
  }

  const id =
    typeof rawData.id === "string" ? rawData.id : null;
  const organizationName =
    typeof rawData.organization_name === "string"
      ? rawData.organization_name
      : null;
  const submitterName =
    typeof rawData.submitter_name === "string"
      ? rawData.submitter_name
      : null;
  const submitterEmail =
    typeof rawData.submitter_email === "string"
      ? rawData.submitter_email
      : null;
  const storedCategory =
    typeof rawData.category === "string"
      ? rawData.category
      : null;
  const storedSubject =
    typeof rawData.subject === "string"
      ? rawData.subject
      : null;
  const storedMessage =
    typeof rawData.message === "string"
      ? rawData.message
      : null;

  if (
    !id ||
    !organizationName ||
    !submitterName ||
    !submitterEmail ||
    !storedCategory ||
    !storedSubject ||
    !storedMessage
  ) {
    console.error(
      "Platform support submission returned invalid data",
      {
        organizationId: context.activeOrganization.id,
        userId: context.user.id,
      },
    );

    redirect(
      "/help/contact-dm3oi?error=Your+message+was+recorded,+but+its+confirmation+could+not+be+loaded.",
    );
  }

  // The durable database request already exists at this point.
  // Email notification failure must never erase the request.
  await notifyPlatformOwnerOfSupportRequest({
    id,
    organizationName,
    submitterName,
    submitterEmail,
    category: storedCategory,
    subject: storedSubject,
    message: storedMessage,
  });

  revalidatePath("/admin/inbox");
  revalidatePath("/", "layout");

  redirect("/help/contact-dm3oi?sent=1");
}

async function requireSupportRequestId(form: FormData) {
  await requireSuperAdmin();

  const requestId = value(form, "requestId");

  if (!validUuid(requestId)) {
    throw new Error(
      "The Platform Inbox request identifier is invalid.",
    );
  }

  return requestId;
}

export async function setPlatformSupportReadStateAction(
  form: FormData,
) {
  const requestId = await requireSupportRequestId(form);
  const read = value(form, "read") !== "false";
  const supabase = await createClient();

  const result = await supabase.rpc(
    "set_platform_support_request_read_state" as never,
    {
      target_request_id: requestId,
      target_read: read,
    } as never,
  );

  if (result.error) {
    throw new Error(
      "The Platform Inbox read state could not be changed.",
    );
  }

  revalidatePath("/admin/inbox");
  revalidatePath("/", "layout");
}

export async function markAllPlatformSupportReadAction() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const result = await supabase.rpc(
    "mark_all_platform_support_requests_read" as never,
  );

  if (result.error) {
    throw new Error(
      "Platform Inbox messages could not be marked as read.",
    );
  }

  revalidatePath("/admin/inbox");
  revalidatePath("/", "layout");
}

export async function setPlatformSupportStatusAction(
  form: FormData,
) {
  const requestId = await requireSupportRequestId(form);
  const status = value(form, "status").toUpperCase();

  if (
    !isPlatformSupportStatus(status) ||
    status === "SUBMITTED"
  ) {
    throw new Error("The Platform Inbox status is invalid.");
  }

  const supabase = await createClient();
  const result = await supabase.rpc(
    "set_platform_support_request_status" as never,
    {
      target_request_id: requestId,
      target_status: status,
    } as never,
  );

  if (result.error) {
    throw new Error(
      "The Platform Inbox status could not be changed.",
    );
  }

  revalidatePath("/admin/inbox");
  revalidatePath(`/admin/inbox/${requestId}`);
  revalidatePath("/", "layout");

  redirect(`/admin/inbox/${requestId}`);
}

export async function respondToPlatformSupportRequestAction(
  form: FormData,
) {
  const requestId = await requireSupportRequestId(form);
  const body = value(form, "message").slice(0, 5000);

  if (!body) {
    redirect(
      `/admin/inbox/${requestId}?error=Enter+a+response.`,
    );
  }

  const supabase = await createClient();

  const created = await supabase.rpc(
    "create_platform_support_response" as never,
    {
      target_request_id: requestId,
      target_body: body,
    } as never,
  );

  const rawData: unknown = created.data;

  if (created.error || !isRecord(rawData)) {
    console.error("Platform support response creation failed", {
      requestId,
      code: created.error?.code,
      message: created.error?.message,
    });

    redirect(
      `/admin/inbox/${requestId}?error=The+response+could+not+be+recorded.`,
    );
  }

  const messageId =
    typeof rawData.message_id === "string"
      ? rawData.message_id
      : null;
  const recipientEmail =
    typeof rawData.recipient_email === "string"
      ? rawData.recipient_email
      : null;
  const recipientName =
    typeof rawData.recipient_name === "string"
      ? rawData.recipient_name
      : null;
  const organizationName =
    typeof rawData.organization_name === "string"
      ? rawData.organization_name
      : null;
  const subject =
    typeof rawData.subject === "string"
      ? rawData.subject
      : null;
  const storedBody =
    typeof rawData.body === "string"
      ? rawData.body
      : null;

  if (
    !messageId ||
    !recipientEmail ||
    !recipientName ||
    !organizationName ||
    !subject ||
    !storedBody
  ) {
    redirect(
      `/admin/inbox/${requestId}?error=The+response+was+recorded,+but+email+delivery+could+not+be+prepared.`,
    );
  }

  let delivery:
    | Awaited<ReturnType<typeof sendApplicationEmail>>
    | null = null;

  try {
    delivery = await sendApplicationEmail({
      to: recipientEmail,
      subject: `Re: DM3Oi Support — ${subject}`,
      text: [
        `Hello ${recipientName},`,
        "",
        storedBody,
        "",
        `Organization: ${organizationName}`,
        "",
        "DM3Oi™ Operational Intelligence",
      ].join("\n"),
      fromName: "DM3Oi™",
    });
  } catch {
    delivery = {
      ok: false,
      errorCode: "MAIL_SEND_FAILED",
      safeMessage:
        "The support response email could not be sent.",
    };
  }

  const finalized = await supabase.rpc(
    "finalize_platform_support_response" as never,
    {
      target_message_id: messageId,
      target_sent: delivery.ok,
      target_error: delivery.ok
        ? null
        : delivery.safeMessage,
    } as never,
  );

  if (finalized.error) {
    console.error(
      "Platform support response finalization failed",
      {
        requestId,
        messageId,
        code: finalized.error.code,
        message: finalized.error.message,
      },
    );
  }

  revalidatePath("/admin/inbox");
  revalidatePath(`/admin/inbox/${requestId}`);
  revalidatePath("/", "layout");

  if (!delivery.ok) {
    redirect(
      `/admin/inbox/${requestId}?error=Response+saved,+but+the+email+could+not+be+sent.`,
    );
  }

  redirect(
    `/admin/inbox/${requestId}?sent=1`,
  );
}
