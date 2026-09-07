"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ACTIVE_PORTAL_ACCESS_COOKIE, requireCustomerPortalContext } from "@/lib/auth/customer-portal";
import { createClient } from "@/lib/supabase/server";
import { recordPortalCommunication } from "@/lib/data/communication-service";
import { notifyStaffOfCustomerReply } from "@/lib/data/communication-service";
import { deliverNewServiceRequestNotificationEmails } from "@/lib/data/new-service-request-email-service";
import { after } from "next/server";

export async function selectPortalAccountAction(form: FormData) {
  const id = String(form.get("portalAccessId") ?? "");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("customer_portal_users").select("id").eq("id", id).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (!data) redirect("/portal/select-account");
  (await cookies()).set(ACTIVE_PORTAL_ACCESS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/portal");
}

export async function createCustomerServiceRequestAction(form: FormData): Promise<void> {
  const context = await requireCustomerPortalContext();
  if (context.settings?.portal_submission_enabled === false) redirect("/portal/service-requests?error=Customer%20submissions%20are%20currently%20disabled.");
  const subject = String(form.get("subject") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  if (!subject || !description) redirect("/portal/service-requests/new?error=Subject%20and%20description%20are%20required.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_customer_service_request" as never, { target_portal_access_id: context.access.id, target_subject: subject, target_description: description } as never);
  if (error || !data) redirect("/portal/service-requests/new?error=The%20service%20request%20could%20not%20be%20submitted.");
  revalidatePath("/portal");
  revalidatePath("/portal/service-requests");
  const request = data as unknown as { id: string; organization_id: string };
  after(async () => {
    try {
      await deliverNewServiceRequestNotificationEmails({
        organizationId: request.organization_id,
        serviceRequestId: request.id,
      });
    } catch (deliveryError) {
      console.error("New customer Service Request email follow-up failed", {
        code: (deliveryError as { code?: string }).code ?? "UNKNOWN",
      });
    }
  });
  redirect(`/portal/service-requests/${request.id}`);
}

export type CustomerReplyResult = { ok: true } | { ok: false; error: string };

export async function createCustomerServiceRequestMessageAction(form: FormData): Promise<CustomerReplyResult> {
  const serviceRequestId = String(form.get("serviceRequestId") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!serviceRequestId || !body) return { ok: false, error: "Reply cannot be blank." };
  if (body.length > 4000) return { ok: false, error: "Reply must be 4000 characters or fewer." };
  const context = await requireCustomerPortalContext();
  const supabase = await createClient();
  const { data: created, error } = await supabase.rpc("create_customer_service_request_message" as never, { target_service_request_id: serviceRequestId, target_body: body } as never);
  if (error || !created) {
    console.error("Customer reply submission failed", { code: error?.code, message: error?.message });
    return { ok: false, error: "The reply could not be sent." };
  }
  const message = created as unknown as { id: string; organization_id: string };
  revalidatePath(`/portal/service-requests/${serviceRequestId}`);
  after(async () => {
    try {
      await recordPortalCommunication({ organizationId: message.organization_id, serviceRequestId, messageId: message.id, actorUserId: context.user.id, direction: "INBOUND" });
      await notifyStaffOfCustomerReply({ organizationId: message.organization_id, serviceRequestId, messageId: message.id });
    } catch (deliveryError) {
      console.error("Customer reply follow-up communication failed", deliveryError);
    }
  });
  return { ok: true };
}
