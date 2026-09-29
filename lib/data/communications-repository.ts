import "server-only";
import { cache } from "react";
import { requireInternalContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export type Notification = {
  id: string;
  organization_id: string;
  recipient_user_id: string;
  notification_type: string;
  category: string;
  title: string;
  message: string;
  source_domain: string;
  source_entity_id: string;
  source_event_id: string | null;
  destination_path: string;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
  is_personal: boolean;
  recipient_display_name: string | null;
  communication_kind: "NOTIFICATION" | "EMAIL_DELIVERY";
  delivery_status: "PENDING" | "SENT" | "FAILED" | null;
  opened_at: string | null;
};

export type NotificationFilters = {
  status?: "all" | "unread" | "read" | "archived";
  source?: "all" | "service-request" | "case" | "task" | "email" | "other";
  createdAfter?: string;
  search?: string;
};

export async function getNotifications(filters: NotificationFilters = {}): Promise<Notification[]> {
  const context = await requireInternalContext();
  const organizationWide =
    context.isSuperAdmin ||
    context.activeOrganization.role === "BUSINESS_OWNER";
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("organization_id", context.activeOrganization.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (!organizationWide) query = query.eq("recipient_user_id", context.user.id);
  query = filters.status === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.status === "unread") query = query.is("read_at", null);
  if (filters.status === "read") query = query.not("read_at", "is", null);
  if (filters.source === "service-request") query = query.eq("source_domain", "SERVICE_REQUEST");
  if (filters.source === "case") query = query.eq("source_domain", "CASE");
  if (filters.source === "task") query = query.eq("source_domain", "TASK");
  if (filters.source === "email") query = query.eq("source_domain", "EMAIL");
  if (filters.source === "other") query = query.not("source_domain", "in", '("SERVICE_REQUEST","CASE","TASK","EMAIL")');
  if (filters.createdAfter) query = query.gte("created_at", filters.createdAfter);
  const search = filters.search?.trim();
  if (search) {
    const escaped = search.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/[%_]/g, (character) => `\\${character}`);
    const pattern = `"%${escaped}%"`;
    query = query.or(`title.ilike.${pattern},message.ilike.${pattern},source_domain.ilike.${pattern},notification_type.ilike.${pattern},category.ilike.${pattern}`);
  }
  const { data, error } = await query;
  if (error) throw new Error("Communications are temporarily unavailable.");
  let newestFirst = (data ?? []).map((notification) => ({
    ...notification,
    is_personal: notification.recipient_user_id === context.user.id,
    recipient_display_name: null as string | null,
    communication_kind: "NOTIFICATION" as const,
    delivery_status: null,
    opened_at: null,
  }));
  if (organizationWide && newestFirst.length) {
    const recipientIds = [...new Set(newestFirst.map((notification) => notification.recipient_user_id))];
    const profiles = await supabase
      .from("profiles")
      .select("id,display_name,first_name,last_name")
      .in("id", recipientIds);
    if (profiles.error) throw new Error("Communications are temporarily unavailable.");
    const recipientNames = new Map(
      (profiles.data ?? []).map((profile) => [
        profile.id,
        profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Organization user",
      ]),
    );
    newestFirst = newestFirst.map((notification) => ({
      ...notification,
      recipient_display_name: recipientNames.get(notification.recipient_user_id) ?? "Organization user",
    }));
  }
  if (organizationWide) {
    const includeEmailAudit =
      (!filters.status || filters.status === "all") &&
      (!filters.source || filters.source === "all" || filters.source === "email");
    if (!includeEmailAudit) return newestFirst;
    const auditResult = await supabase.rpc(
      "get_organization_email_delivery_audit" as never,
      {
        target_organization_id: context.activeOrganization.id,
        created_after: filters.createdAfter ?? null,
        search_text: filters.search?.trim() || null,
      } as never,
    );
    if (auditResult.error)
      throw new Error("Communications are temporarily unavailable.");
    type EmailAuditRow = {
      id: string;
      organization_id: string;
      template_key: string;
      recipient_email: string;
      recipient_user_id: string | null;
      membership_id: string | null;
      customer_id: string | null;
      case_id: string | null;
      service_request_id: string | null;
      subject: string;
      delivery_status: "PENDING" | "SENT" | "FAILED";
      opened_at: string | null;
      error_summary: string | null;
      activity_at: string;
    };
    const audits = ((auditResult.data ?? []) as EmailAuditRow[]).map((delivery): Notification => ({
      id: `email:${delivery.id}`,
      organization_id: delivery.organization_id,
      recipient_user_id: delivery.recipient_user_id ?? "",
      notification_type: delivery.opened_at
        ? "EMAIL_OPENED"
        : delivery.delivery_status === "FAILED"
          ? "EMAIL_FAILED"
          : `${delivery.template_key}_${delivery.delivery_status}`,
      category: delivery.template_key,
      title: delivery.opened_at
        ? "Email opened"
        : delivery.delivery_status === "FAILED"
          ? "Email failed"
          : delivery.template_key === "ORGANIZATION_USER_INVITATION_RESEND"
            ? "Invitation resent"
            : delivery.template_key === "ORGANIZATION_USER_INVITATION"
              ? "Invitation sent"
              : delivery.template_key === "CUSTOMER_PORTAL_INVITATION"
                ? "Customer Portal invitation sent"
                : delivery.template_key === "MISSING_DOCUMENTS_NOTICE"
                  ? "Missing documents notice sent"
                  : delivery.template_key === "NEW_SERVICE_REQUEST_NOTIFICATION"
                  ? "New Service Request notification sent"
                  : "Email sent",
      message: delivery.delivery_status === "FAILED" && delivery.error_summary
        ? `${delivery.subject} — ${delivery.error_summary}`
        : delivery.subject,
      source_domain: "EMAIL",
      source_entity_id: delivery.id,
      source_event_id: null,
      destination_path: delivery.service_request_id
        ? `/service-desk/${delivery.service_request_id}`
        : delivery.case_id
          ? `/cases/${delivery.case_id}`
          : delivery.customer_id
            ? `/customers/${delivery.customer_id}`
            : delivery.membership_id
              ? `/users/${delivery.membership_id}`
              : "/communications",
      created_at: delivery.activity_at,
      read_at: null,
      archived_at: null,
      is_personal: false,
      recipient_display_name: delivery.recipient_email,
      communication_kind: "EMAIL_DELIVERY",
      delivery_status: delivery.delivery_status,
      opened_at: delivery.opened_at,
    }));
    return [...newestFirst, ...audits].sort((left, right) =>
      right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id),
    );
  }
  if (filters.status && filters.status !== "all") return newestFirst;
  return [
    ...newestFirst.filter((notification) => !notification.read_at),
    ...newestFirst.filter((notification) => notification.read_at),
  ];
}

const getUnreadNotificationCountForScope = cache(
  async (organizationId: string, userId: string): Promise<number> => {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("recipient_user_id", userId)
      .is("read_at", null)
      .is("archived_at", null);

    if (error) {
      console.error("Unread communications count failed", {
        code: error.code,
        message: error.message,
      });
      return 0;
    }

    return count ?? 0;
  },
);

export async function getUnreadNotificationCount(scope?: {
  organizationId: string;
  userId: string;
}): Promise<number> {
  const context = scope ? null : await requireInternalContext();
  const organizationId =
    scope?.organizationId ?? context!.activeOrganization.id;
  const userId = scope?.userId ?? context!.user.id;

  return getUnreadNotificationCountForScope(organizationId, userId);
}
