"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireInternalContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const safeDestination = (path: string) =>
  path.startsWith("/") && !path.startsWith("//") ? path : "/communications";

async function setReadState(id: string, read: boolean) {
  await requireInternalContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_notification_read_state", {
    target_notification_id: id,
    target_read: read,
  });
  if (error) throw new Error("The notification state could not be changed.");
  revalidatePath("/communications");
  revalidatePath("/", "layout");
}

export async function openNotificationAction(form: FormData) {
  await setReadState(value(form, "notificationId"), true);
  redirect(safeDestination(value(form, "destination")));
}

export async function markNotificationReadAction(form: FormData) {
  await setReadState(value(form, "notificationId"), true);
}

export async function markNotificationUnreadAction(form: FormData) {
  await setReadState(value(form, "notificationId"), false);
}

export async function markAllNotificationsReadAction() {
  const context = await requireInternalContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read", {
    target_organization_id: context.activeOrganization.id,
  });
  if (error) throw new Error("Communications could not be marked as read.");
  revalidatePath("/communications");
  revalidatePath("/", "layout");
}
