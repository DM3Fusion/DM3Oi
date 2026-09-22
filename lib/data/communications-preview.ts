"use server";

import { requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/data/case-repository";

export type ServiceRequestInboxPreview = {
  id: string;
  requestNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  customerName: string;
  assignedName: string;
  createdAt: string;
  updatedAt: string;
  canReply: boolean;
  messages: Array<{
    id: string;
    authorType: string;
    authorName: string;
    body: string;
    createdAt: string;
  }>;
};

export async function getServiceRequestInboxPreview(
  serviceRequestId: string,
): Promise<ServiceRequestInboxPreview | null> {
  const access = await requirePermission("VIEW_COMMUNICATIONS");

  if (!hasPermission(access, "VIEW_SERVICE_DESK")) {
    return null;
  }

  const supabase = await createClient();

  const { data: request, error } = await supabase
    .from("organization_service_requests")
    .select("*")
    .eq("organization_id", access.activeOrganization.id)
    .eq("id", serviceRequestId)
    .maybeSingle();

  if (error) {
    throw new Error("The service request preview could not be loaded.");
  }

  if (!request) {
    return null;
  }

  const [customerResult, assignedResult, messagesResult] = await Promise.all([
    supabase
      .from("organization_customers")
      .select("name")
      .eq("organization_id", access.activeOrganization.id)
      .eq("id", request.customer_id)
      .maybeSingle(),

    request.assigned_user_id
      ? supabase
          .from("profiles")
          .select("*")
          .eq("id", request.assigned_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    supabase
      .from("organization_service_request_messages")
      .select("id,author_user_id,author_display_name,author_type,body,created_at")
      .eq("organization_id", access.activeOrganization.id)
      .eq("service_request_id", request.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  if (
    customerResult.error ||
    assignedResult.error ||
    messagesResult.error
  ) {
    throw new Error("The service request preview could not be loaded.");
  }

  const assignedToCurrentUser =
    request.assigned_user_id === access.user.id;

  const canManage = hasPermission(access, "MANAGE_SERVICE_REQUEST");

  const canReply =
    hasPermission(access, "RESPOND_SERVICE_REQUEST") &&
    (canManage || assignedToCurrentUser);

  const conversation = [
    {
      id: "opening",
      authorType: "CUSTOMER",
      authorName: customerResult.data?.name ?? "Customer",
      body: request.description,
      createdAt: request.created_at,
    },
    ...(messagesResult.data ?? []).map((message) => ({
      id: message.id,
      authorType: message.author_type,
      authorName:
        message.author_type === "CUSTOMER"
          ? customerResult.data?.name ?? "Customer"
          : message.author_display_name ??
            (message.author_user_id === request.assigned_user_id
              ? displayName(assignedResult.data)
              : "Organization staff"),
      body: message.body,
      createdAt: message.created_at,
    })),
  ].sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      b.id.localeCompare(a.id),
  );

  return {
    id: request.id,
    requestNumber: request.request_number,
    subject: request.subject,
    description: request.description,
    status: request.status,
    priority: request.priority,
    customerName: customerResult.data?.name ?? "Customer",
    assignedName: displayName(assignedResult.data),
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    canReply,
    messages: conversation,
  };
}
