import "server-only";
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
};

export type NotificationFilters = {
  status?: "all" | "unread" | "read" | "archived";
  source?: "all" | "service-request" | "case" | "task" | "other";
  createdAfter?: string;
  search?: string;
};

export async function getNotifications(filters: NotificationFilters = {}): Promise<Notification[]> {
  const context = await requireInternalContext();
  const organizationWide = !context.isSuperAdmin && context.activeOrganization.role === "BUSINESS_OWNER";
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
  if (filters.source === "other") query = query.not("source_domain", "in", '("SERVICE_REQUEST","CASE","TASK")');
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
  if (organizationWide) return newestFirst;
  if (filters.status && filters.status !== "all") return newestFirst;
  return [
    ...newestFirst.filter((notification) => !notification.read_at),
    ...newestFirst.filter((notification) => notification.read_at),
  ];
}

export async function getUnreadNotificationCount(scope?: { organizationId: string; userId: string }): Promise<number> {
  const context = scope ? null : await requireInternalContext();
  const organizationId = scope?.organizationId ?? context!.activeOrganization.id;
  const userId = scope?.userId ?? context!.user.id;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("recipient_user_id", userId)
    .is("read_at", null)
    .is("archived_at", null);
  if (error) {
    console.error("Unread communications count failed", { code: error.code, message: error.message });
    return 0;
  }
  return count ?? 0;
}
