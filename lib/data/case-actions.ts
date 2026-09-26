"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext, requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createCustomerForCurrentOrganization } from "@/lib/data/customer-creation";
import type { Database } from "@/types/database.generated";
type CaseStatus = Database["public"]["Enums"]["case_status"];
type TaskStatus = Database["public"]["Enums"]["case_task_status"];
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (value: string) => value || undefined;
const nullableUuid = (value: string) => (value || null) as unknown as string;
const endOfDay = (value: string) => (value ? `${value}T23:59:59.000Z` : undefined);
const friendly = (message: string) => (message.includes("required applicable tasks") ? "Complete or mark not applicable every required task before completing this case." : message.includes("required applicable questions") ? "Answer every required question before completing this case." : message.includes("not authorized") ? "You are not authorized to perform that action." : message.includes("invalid") ? "The selected customer or staff assignment is not valid for this organization." : "The change could not be saved. Please try again.");
const fail = (path: string, message: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
const refreshCase = (id?: string) => {
  revalidatePath("/");
  revalidatePath("/cases");
  revalidatePath("/customers");
  if (id) revalidatePath(`/cases/${id}`);
};

type ReassignCaseCustomerResult =
  | { ok: true }
  | { ok: false; error: string };

export async function reassignCaseCustomerAction(input: {
  caseId: string;
  targetCustomerId: string;
}): Promise<ReassignCaseCustomerResult> {
  const access = await getAccessContext();
  const organization = access?.activeOrganization;
  if (!organization || !hasPermission(access, "REASSIGN_CASE_CUSTOMER")) {
    return { ok: false, error: "You are not authorized to perform that action." };
  }
  const supabase = await createClient();
  const { data: visibleCase, error: caseError } = await supabase
    .from("organization_cases")
    .select("id")
    .eq("id", input.caseId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (caseError || !visibleCase) {
    return { ok: false, error: "The Case was not found or is not authorized." };
  }
  const { error } = await supabase.rpc("reassign_case_customer", {
    target_case_id: input.caseId,
    target_customer_id: input.targetCustomerId,
  });
  if (error) {
    console.error("Case customer reassignment failed", {
      code: error.code,
      message: error.message,
    });
    if (error.message.includes("customer history prevents reassignment")) {
      return {
        ok: false,
        error:
          "This Case contains customer activity associated with the current Customer and cannot be reassigned safely. Create a new Case for the correct Customer instead.",
      };
    }
    return { ok: false, error: friendly(error.message) };
  }
  refreshCase(input.caseId);
  return { ok: true };
}

export async function transitionCaseStatusAction(data: FormData) {
  const id = text(data, "caseId");
  await requirePermission("WORK_CASES");
  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_case_status", {
    target_case_id: id,
    target_status: text(data, "status") as CaseStatus,
  });
  if (error) {
    console.error("Case status update failed", {
      code: error.code,
      message: error.message,
    });
    fail(`/cases/${id}`, friendly(error.message));
  }
  refreshCase(id);
  redirect(`/cases/${id}?message=Case%20status%20updated.`);
}
export async function setCaseAssignmentAction(data: FormData) {
  const id = text(data, "caseId");
  await requirePermission("ASSIGN_CASES");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_case_assignment", {
    target_case_id: id,
    target_user_id: text(data, "userId"),
    target_assignment_role: text(data, "assignmentRole") as "MANAGER" | "STAFF",
    target_active: text(data, "active") !== "false",
  });
  if (error) {
    console.error("Case assignment failed", {
      code: error.code,
      message: error.message,
    });
    fail(`/cases/${id}`, friendly(error.message));
  }
  refreshCase(id);
  redirect(`/cases/${id}?message=Assignment%20updated.`);
}
export async function createTaskAction(data: FormData) {
  const id = text(data, "caseId");
  await requirePermission("MANAGE_TASKS");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_case_task", {
    target_case_id: id,
    target_title: text(data, "title"),
    target_description: text(data, "description"),
    target_assigned_user_id: optional(text(data, "assignedUserId")),
    target_required: data.get("required") === "on",
    target_due_at: endOfDay(text(data, "dueAt")),
  });
  if (error) {
    console.error("Create task failed", {
      code: error.code,
      message: error.message,
    });
    fail(`/cases/${id}`, friendly(error.message));
  }
  refreshCase(id);
  redirect(`/cases/${id}?message=Task%20created.`);
}
export async function updateTaskAction(data: FormData) {
  const caseId = text(data, "caseId");
  const context = await requirePermission("WORK_TASKS");
  const supabase = await createClient();
  const taskId = text(data, "taskId");
  const { data: existing } = await supabase
    .from("case_tasks")
    .select("title,description,assigned_user_id,required,due_at")
    .eq("id", taskId)
    .eq("organization_id", context.activeOrganization.id)
    .maybeSingle();
  if (!existing) return fail(`/cases/${caseId}`, "The task was not found or is not authorized.");
  const canManage = hasPermission(context, "MANAGE_TASKS");
  const canAssign = hasPermission(context, "ASSIGN_TASKS");
  const { error } = await supabase.rpc("update_case_task", {
    target_task_id: taskId,
    target_title: canManage ? text(data, "title") : existing.title,
    target_description: canManage ? text(data, "description") : existing.description,
    target_assigned_user_id: canAssign ? nullableUuid(text(data, "assignedUserId")) : nullableUuid(existing.assigned_user_id ?? ""),
    target_status: text(data, "status") as TaskStatus,
    target_required: canManage ? data.get("requiredCheck") === "on" : existing.required,
    target_due_at: canManage ? nullableUuid(text(data, "dueAt")) : nullableUuid(existing.due_at ?? ""),
  });
  if (error) {
    console.error("Update task failed", {
      code: error.code,
      message: error.message,
    });
    fail(`/cases/${caseId}`, friendly(error.message));
  }
  refreshCase(caseId);
  redirect(`/cases/${caseId}?message=Task%20updated.`);
}
export async function deleteTaskAction(data: FormData) {
  const caseId = text(data, "caseId");
  await requirePermission("MANAGE_TASKS");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_case_task", {
    target_task_id: text(data, "taskId"),
  });
  if (error) {
    console.error("Delete task failed", {
      code: error.code,
      message: error.message,
    });
    fail(`/cases/${caseId}`, friendly(error.message));
  }
  refreshCase(caseId);
  redirect(`/cases/${caseId}?message=Task%20deleted.`);
}
export async function moveTaskAction(data: FormData) {
  const caseId = text(data, "caseId");
  await requirePermission("MANAGE_TASKS");
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_case_task", {
    target_task_id: text(data, "taskId"),
    target_direction: text(data, "direction"),
  });
  if (error) {
    console.error("Move task failed", {
      code: error.code,
      message: error.message,
    });
    fail(`/cases/${caseId}`, friendly(error.message));
  }
  refreshCase(caseId);
  redirect(`/cases/${caseId}`);
}
export async function createCustomerAction(data: FormData) {
  const values = {
    type: String(data.get("type") ?? ""),
    name: String(data.get("name") ?? ""),
    firstName: String(data.get("firstName") ?? ""),
    lastName: String(data.get("lastName") ?? ""),
    streetAddress: String(data.get("streetAddress") ?? ""),
    city: String(data.get("city") ?? ""),
    state: String(data.get("state") ?? ""),
    postalCode: String(data.get("postalCode") ?? ""),
    email: String(data.get("email") ?? ""),
    phone: String(data.get("phone") ?? ""),
    notes: String(data.get("notes") ?? ""),
  };
  const result = await createCustomerForCurrentOrganization(values);
  if (!result.ok) return result;
  redirect(
    `/customers?message=${encodeURIComponent(`Customer ${result.customer.customerNumber} created.`)}`,
  );
}
