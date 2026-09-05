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
};

export async function getNotifications(): Promise<Notification[]> {
  const context = await requireInternalContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("organization_id", context.activeOrganization.id)
    .eq("recipient_user_id", context.user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error("Communications are temporarily unavailable.");
  const newestFirst = data ?? [];
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
