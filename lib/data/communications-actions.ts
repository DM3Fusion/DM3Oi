"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission, requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { communicationsDestination } from "@/lib/communications-view";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const safeDestination = (path: string) =>
  path.startsWith("/") && !path.startsWith("//") ? path : "/communications";

async function setReadState(id: string, read: boolean) {
  await requirePermission("VIEW_COMMUNICATIONS");
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
  redirect(communicationsDestination(safeDestination(value(form, "destination"))));
}

export async function markNotificationReadAction(form: FormData) {
  await setReadState(value(form, "notificationId"), true);
}

export async function markNotificationUnreadAction(form: FormData) {
  await setReadState(value(form, "notificationId"), false);
}

export async function markAllNotificationsReadAction() {
  const context = await requirePermission("VIEW_COMMUNICATIONS");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read", {
    target_organization_id: context.activeOrganization.id,
  });
  if (error) throw new Error("Communications could not be marked as read.");
  revalidatePath("/communications");
  revalidatePath("/", "layout");
}


export async function deleteCommunicationAction(form: FormData) {
  const context = await requireSuperAdmin();
  const organizationId = value(form, "organizationId");
  const recordKind = value(form, "recordKind").toUpperCase();
  const recordId = value(form, "recordId");
  const reason = value(form, "reason").trim().slice(0, 500);

  if (
    !context.activeOrganization ||
    context.activeOrganization.id !== organizationId
  )
    throw new Error("The communication is outside the active organization.");

  if (
    recordKind !== "NOTIFICATION" &&
    recordKind !== "EMAIL_DELIVERY"
  )
    throw new Error("The communication type is invalid.");

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      recordId,
    )
  )
    throw new Error("The communication identifier is invalid.");

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "delete_platform_communication",
    {
      target_organization_id: organizationId,
      target_record_kind: recordKind,
      target_record_id: recordId,
      target_reason: reason || undefined,
    },
  );

  if (error) {
    console.error("SUPER_ADMIN communication deletion failed", {
      organizationId,
      recordKind,
      recordId,
      code: error.code,
      message: error.message,
    });

    if (
      error.message.includes(
        "durable Service Request delivery history",
      )
    )
      throw new Error(
        "This communication is linked to durable Service Request delivery history and cannot be deleted.",
      );

    throw new Error("The communication could not be deleted.");
  }

  revalidatePath("/communications");
  revalidatePath("/", "layout");
}
