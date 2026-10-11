import "server-only";

import { requireSuperAdmin } from "@/lib/auth/context";
import {
  isPlatformSupportCategory,
  isPlatformSupportStatus,
  type PlatformSupportCategory,
  type PlatformSupportStatus,
} from "@/lib/platform-support";
import { createClient } from "@/lib/supabase/server";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value);

export type PlatformSupportInboxItem = {
  id: string;
  organizationId: string;
  organizationName: string;
  submitterName: string;
  submitterEmail: string;
  category: PlatformSupportCategory;
  subject: string;
  message: string;
  status: PlatformSupportStatus;
  notificationEmailStatus: string;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  closedAt: string | null;
  read: boolean;
};

export type PlatformSupportMessage = {
  id: string;
  senderType: "ORGANIZATION_USER" | "PLATFORM_ADMIN";
  senderName: string;
  senderEmail: string;
  body: string;
  emailStatus: string | null;
  emailSentAt: string | null;
  emailError: string | null;
  createdAt: string;
};

export type PlatformSupportRequestDetail =
  PlatformSupportInboxItem & {
    messages: PlatformSupportMessage[];
  };

const stringValue = (
  value: unknown,
): string | null =>
  typeof value === "string" ? value : null;

function parseInboxItem(
  value: unknown,
): PlatformSupportInboxItem | null {
  if (!isRecord(value)) return null;

  const id = stringValue(value.id);
  const organizationId = stringValue(value.organization_id);
  const organizationName = stringValue(value.organization_name);
  const submitterName = stringValue(value.submitter_name);
  const submitterEmail = stringValue(value.submitter_email);
  const category = stringValue(value.category);
  const subject = stringValue(value.subject);
  const message = stringValue(value.message);
  const status = stringValue(value.status);
  const notificationEmailStatus =
    stringValue(value.notification_email_status);
  const createdAt = stringValue(value.created_at);
  const updatedAt = stringValue(value.updated_at);

  if (
    !id ||
    !organizationId ||
    !organizationName ||
    !submitterName ||
    !submitterEmail ||
    !category ||
    !isPlatformSupportCategory(category) ||
    !subject ||
    !message ||
    !status ||
    !isPlatformSupportStatus(status) ||
    !notificationEmailStatus ||
    !createdAt ||
    !updatedAt ||
    typeof value.read !== "boolean"
  ) {
    return null;
  }

  return {
    id,
    organizationId,
    organizationName,
    submitterName,
    submitterEmail,
    category,
    subject,
    message,
    status,
    notificationEmailStatus,
    createdAt,
    updatedAt,
    respondedAt: stringValue(value.responded_at),
    closedAt: stringValue(value.closed_at),
    read: value.read,
  };
}

export async function getPlatformSupportInbox(input?: {
  status?: PlatformSupportStatus | null;
  category?: PlatformSupportCategory | null;
  query?: string | null;
}) {
  await requireSuperAdmin();

  const supabase = await createClient();
  const result = await supabase.rpc(
    "get_platform_support_inbox" as never,
    {
      target_status: input?.status ?? null,
      target_category: input?.category ?? null,
      target_query:
        input?.query?.trim().slice(0, 200) || null,
    } as never,
  );

  const rawData: unknown = result.data;

  if (result.error || !Array.isArray(rawData)) {
    console.error("Platform support inbox query failed", {
      code: result.error?.code,
      message: result.error?.message,
    });
    throw new Error(
      "Platform Inbox is temporarily unavailable.",
    );
  }

  return rawData
    .map(parseInboxItem)
    .filter(
      (
        item,
      ): item is PlatformSupportInboxItem =>
        item !== null,
    );
}

export async function getPlatformSupportUnreadCount() {
  await requireSuperAdmin();

  const supabase = await createClient();
  const result = await supabase.rpc(
    "get_platform_support_unread_count" as never,
  );

  const rawData: unknown = result.data;

  if (
    result.error ||
    typeof rawData !== "number"
  ) {
    console.error("Platform support unread count failed", {
      code: result.error?.code,
      message: result.error?.message,
    });
    return 0;
  }

  return rawData;
}

export async function getPlatformSupportRequest(
  requestId: string,
): Promise<PlatformSupportRequestDetail | null> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const result = await supabase.rpc(
    "get_platform_support_request" as never,
    {
      target_request_id: requestId,
    } as never,
  );

  if (result.error) {
    console.error("Platform support detail query failed", {
      requestId,
      code: result.error.code,
      message: result.error.message,
    });
    throw new Error(
      "The support request could not be loaded.",
    );
  }

  const rawData: unknown = result.data;

  if (!isRecord(rawData)) return null;

  const raw = rawData;
  const base = parseInboxItem({
    ...raw,
    read: true,
  });

  if (!base || !Array.isArray(raw.messages)) {
    return null;
  }

  const messages: PlatformSupportMessage[] = [];

  for (const value of raw.messages) {
    if (!isRecord(value)) return null;

    const id = stringValue(value.id);
    const senderType = stringValue(value.sender_type);
    const senderName = stringValue(value.sender_name);
    const senderEmail = stringValue(value.sender_email);
    const body = stringValue(value.body);
    const createdAt = stringValue(value.created_at);

    if (
      !id ||
      (senderType !== "ORGANIZATION_USER" &&
        senderType !== "PLATFORM_ADMIN") ||
      !senderName ||
      !senderEmail ||
      !body ||
      !createdAt
    ) {
      return null;
    }

    messages.push({
      id,
      senderType,
      senderName,
      senderEmail,
      body,
      emailStatus: stringValue(value.email_status),
      emailSentAt: stringValue(value.email_sent_at),
      emailError: stringValue(value.email_error),
      createdAt,
    });
  }

  return {
    ...base,
    messages,
  };
}


export type MyPlatformSupportRequestItem = {
  id: string;
  organizationId: string;
  organizationName: string;
  category: PlatformSupportCategory;
  subject: string;
  message: string;
  status: PlatformSupportStatus;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  closedAt: string | null;
};

export type MyPlatformSupportMessage = {
  id: string;
  senderType: "ORGANIZATION_USER" | "PLATFORM_ADMIN";
  senderName: string;
  body: string;
  createdAt: string;
};

export type MyPlatformSupportRequestDetail =
  MyPlatformSupportRequestItem & {
    messages: MyPlatformSupportMessage[];
  };

function parseMyPlatformSupportRequestItem(
  value: unknown,
): MyPlatformSupportRequestItem | null {
  if (!isRecord(value)) return null;

  const id = stringValue(value.id);
  const organizationId = stringValue(value.organization_id);
  const organizationName = stringValue(value.organization_name);
  const category = stringValue(value.category);
  const subject = stringValue(value.subject);
  const message = stringValue(value.message);
  const status = stringValue(value.status);
  const createdAt = stringValue(value.created_at);
  const updatedAt = stringValue(value.updated_at);

  if (
    !id ||
    !organizationId ||
    !organizationName ||
    !category ||
    !isPlatformSupportCategory(category) ||
    !subject ||
    !message ||
    !status ||
    !isPlatformSupportStatus(status) ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    organizationId,
    organizationName,
    category,
    subject,
    message,
    status,
    createdAt,
    updatedAt,
    respondedAt: stringValue(value.responded_at),
    closedAt: stringValue(value.closed_at),
  };
}

export async function getMyPlatformSupportRequests(
  organizationId: string,
): Promise<MyPlatformSupportRequestItem[]> {
  const supabase = await createClient();

  const result = await supabase.rpc(
    "get_my_platform_support_requests" as never,
    {
      target_organization_id: organizationId,
    } as never,
  );

  const rawData: unknown = result.data;

  if (result.error || !Array.isArray(rawData)) {
    console.error("My DM3Oi support requests query failed", {
      code: result.error?.code,
      message: result.error?.message,
    });

    throw new Error(
      "Your DM3Oi support requests are temporarily unavailable.",
    );
  }

  return rawData
    .map(parseMyPlatformSupportRequestItem)
    .filter(
      (
        item,
      ): item is MyPlatformSupportRequestItem =>
        item !== null,
    );
}

export async function getMyPlatformSupportRequest(
  organizationId: string,
  requestId: string,
): Promise<MyPlatformSupportRequestDetail | null> {
  const supabase = await createClient();

  const result = await supabase.rpc(
    "get_my_platform_support_request" as never,
    {
      target_organization_id: organizationId,
      target_request_id: requestId,
    } as never,
  );

  if (result.error) {
    console.error("My DM3Oi support request query failed", {
      requestId,
      code: result.error.code,
      message: result.error.message,
    });

    throw new Error(
      "The DM3Oi support request could not be loaded.",
    );
  }

  const rawData: unknown = result.data;

  if (!isRecord(rawData)) return null;

  const base = parseMyPlatformSupportRequestItem(rawData);

  if (!base || !Array.isArray(rawData.messages)) {
    return null;
  }

  const messages: MyPlatformSupportMessage[] = [];

  for (const value of rawData.messages) {
    if (!isRecord(value)) return null;

    const id = stringValue(value.id);
    const senderType = stringValue(value.sender_type);
    const senderName = stringValue(value.sender_name);
    const body = stringValue(value.body);
    const createdAt = stringValue(value.created_at);

    if (
      !id ||
      (senderType !== "ORGANIZATION_USER" &&
        senderType !== "PLATFORM_ADMIN") ||
      !senderName ||
      !body ||
      !createdAt
    ) {
      return null;
    }

    messages.push({
      id,
      senderType,
      senderName,
      body,
      createdAt,
    });
  }

  return {
    ...base,
    messages,
  };
}
