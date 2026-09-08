"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { recordPortalCommunication, notifyCustomerOfStaffReply } from "@/lib/data/communication-service";
import { deliverNewServiceRequestNotificationEmails } from "@/lib/data/new-service-request-email-service";
import { after } from "next/server";
const text = (data: FormData, key: string) => String(data.get(key) ?? "");
const safe = (message: string) => (message.includes("invalid customer") ? "Select a valid customer." : message.includes("assignee") ? "Select a valid active staff member." : message.includes("not authorized") ? "You are not authorized to perform that action." : "The service request could not be saved.");
export async function createServiceRequestAction(data: FormData) {
  const values = {
    customerId: text(data, "customerId"),
    subject: text(data, "subject"),
    description: text(data, "description"),
    priority: text(data, "priority") || "NORMAL",
    assignedUserId: text(data, "assignedUserId"),
  };
  const fieldErrors: Record<string, string> = {};
  if (!values.customerId) fieldErrors.customerId = "Customer is required.";
  if (!values.subject.trim()) fieldErrors.subject = "Subject is required.";
  else if (values.subject.trim().length > 240) fieldErrors.subject = "Subject must be 240 characters or fewer.";
  if (!values.description.trim()) fieldErrors.description = "Description is required.";
  if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(values.priority)) fieldErrors.priority = "Select a valid priority.";
  if (Object.keys(fieldErrors).length)
    return {
      ok: false as const,
      error: "Correct the highlighted fields.",
      fieldErrors,
      values,
    };
  const context = await requirePermission("CREATE_SERVICE_REQUEST");
  if (values.assignedUserId && !hasPermission(context, "ASSIGN_SERVICE_REQUEST"))
    return {
      ok: false as const,
      error: "You are not authorized to assign service requests.",
      fieldErrors: {},
      values,
    };
  const supabase = await createClient();
  const { data: created, error } = await supabase.rpc(
    "create_service_request" as never,
    {
      target_organization_id: context.activeOrganization.id,
      target_customer_id: values.customerId,
      target_subject: values.subject,
      target_description: values.description,
      target_priority: values.priority,
      target_assigned_user_id: values.assignedUserId || null,
    } as never,
  );
  if (error || !created) {
    console.error("Create service request failed", {
      code: error?.code,
      message: error?.message,
    });
    return {
      ok: false as const,
      error: safe(error?.message ?? ""),
      fieldErrors: {},
      values,
    };
  }
  const request = created as unknown as { id: string; organization_id: string };
  after(async () => {
    try {
      await deliverNewServiceRequestNotificationEmails({
        organizationId: request.organization_id,
        serviceRequestId: request.id,
      });
    } catch (deliveryError) {
      console.error("New internal Service Request email follow-up failed", {
        code: (deliveryError as { code?: string }).code ?? "UNKNOWN",
      });
    }
  });
  revalidatePath("/");
  revalidatePath("/service-desk");
  redirect(`/service-desk/${request.id}`);
}
type MutationResult = { ok: true } | { ok: false; error: string };
const logFailure = (label: string, error: { message?: string; code?: string; details?: string; hint?: string }) =>
  console.error(`${label} failed`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
export async function updateServiceRequestStatusAction(data: { requestId: string; status: string }): Promise<MutationResult> {
  await requirePermission("WORK_SERVICE_REQUEST");
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "update_service_request_status" as never,
    {
      target_service_request_id: data.requestId,
      target_status: data.status,
    } as never,
  );
  if (error) {
    logFailure("Service request status update", error);
    return { ok: false, error: safe(error.message ?? "") };
  }
  revalidatePath("/");
  revalidatePath("/service-desk");
  revalidatePath(`/service-desk/${data.requestId}`);
  return { ok: true };
}
export async function updateServiceRequestPriorityAction(data: { requestId: string; priority: string }): Promise<MutationResult> {
  await requirePermission("WORK_SERVICE_REQUEST");
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "update_service_request_priority" as never,
    {
      target_service_request_id: data.requestId,
      target_priority: data.priority,
    } as never,
  );
  if (error) {
    console.error("Service request priority update failed", {
      action: "updateServiceRequestPriorityAction",
      rpc: "update_service_request_priority",
      code: error.code ?? null,
      message: error.message ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
    return { ok: false, error: safe(error.message ?? "") };
  }
  revalidatePath("/");
  revalidatePath("/service-desk");
  revalidatePath(`/service-desk/${data.requestId}`);
  return { ok: true };
}
export async function setServiceRequestAssignmentAction(data: { requestId: string; assignedUserId: string | null }): Promise<MutationResult> {
  await requirePermission("ASSIGN_SERVICE_REQUEST");
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "set_service_request_assignment" as never,
    {
      target_service_request_id: data.requestId,
      target_assigned_user_id: data.assignedUserId,
    } as never,
  );
  if (error) {
    logFailure("Service request assignment update", error);
    return { ok: false, error: safe(error.message ?? "") };
  }
  revalidatePath("/");
  revalidatePath("/service-desk");
  revalidatePath(`/service-desk/${data.requestId}`);
  return { ok: true };
}
export async function setServiceRequestCaseAction(data: { requestId: string; caseId: string | null; expectedCaseId: string | null }): Promise<MutationResult> {
  const context = await requirePermission("MANAGE_SERVICE_REQUEST");
  const supabase = await createClient();
  const { data: visibleRequest, error: lookupError } = await supabase
    .from("organization_service_requests")
    .select("id")
    .eq("id", data.requestId)
    .eq("organization_id", context.activeOrganization.id)
    .maybeSingle();
  if (lookupError || !visibleRequest) {
    return { ok: false, error: "The Service Request was not found or is not authorized." };
  }
  const { error } = await supabase.rpc(
    "set_service_request_case" as never,
    {
      target_service_request_id: data.requestId,
      target_case_id: data.caseId,
      expected_case_id: data.expectedCaseId,
    } as never,
  );
  if (error) {
    logFailure("Service request Case link update", error);
    return {
      ok: false,
      error: error.message.includes("invalid target case")
        ? "The selected Case is not available for this customer."
        : error.message.includes("case link changed")
          ? "The Case link changed while you were editing. Refresh and try again."
        : safe(error.message ?? ""),
    };
  }
  revalidatePath("/");
  revalidatePath("/service-desk");
  revalidatePath(`/service-desk/${data.requestId}`);
  revalidatePath("/cases");
  if (data.caseId) revalidatePath(`/cases/${data.caseId}`);
  if (data.expectedCaseId) revalidatePath(`/cases/${data.expectedCaseId}`);
  return { ok: true };
}
export async function createInternalServiceRequestMessageAction(form: FormData): Promise<void> {
  const serviceRequestId = String(form.get("serviceRequestId") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!serviceRequestId || !body) redirect(`/service-desk/${serviceRequestId}?error=Reply%20cannot%20be%20blank.`);
  if (body.length > 4000) redirect(`/service-desk/${serviceRequestId}?error=Reply%20must%20be%204000%20characters%20or%20fewer.`);
  const context = await requirePermission("RESPOND_SERVICE_REQUEST");
  const supabase = await createClient();
  const { data: created, error } = await supabase.rpc("create_internal_service_request_message" as never, { target_service_request_id: serviceRequestId, target_body: body } as never);
  if (error || !created) {
    console.error("Create internal service request message failed", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    redirect(`/service-desk/${serviceRequestId}?error=The%20reply%20could%20not%20be%20sent.`);
  }
  const message = created as unknown as { id: string; organization_id: string };
  await recordPortalCommunication({
    organizationId: message.organization_id,
    serviceRequestId,
    messageId: message.id,
    actorUserId: context.user.id,
    direction: "OUTBOUND",
  });
  const notificationResult = await notifyCustomerOfStaffReply({
    organizationId: message.organization_id,
    serviceRequestId,
    messageId: message.id,
  });
  revalidatePath(`/service-desk/${serviceRequestId}`);
  if (!notificationResult.ok) redirect(`/service-desk/${serviceRequestId}?warning=Reply%20saved%2C%20but%20the%20customer%20email%20notification%20could%20not%20be%20sent.`);
  redirect(`/service-desk/${serviceRequestId}`);
}
