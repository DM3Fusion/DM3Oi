"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext, requirePermission } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createCustomerForCurrentOrganization } from "@/lib/data/customer-creation";
import { isCanonicalActiveCaseStatus } from "@/lib/case-lifecycle";
import {
  MissingDocumentsNoticeError,
  sendMissingDocumentsNotice,
} from "@/lib/data/missing-documents-notice-service";
import type { Database } from "@/types/database.generated";
type CaseStatus = Database["public"]["Enums"]["case_status"];
type TaskStatus = Database["public"]["Enums"]["case_task_status"];
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (value: string) => value || undefined;
const nullableUuid = (value: string) => (value || null) as unknown as string;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const friendly = (message: string) => (message.includes("required applicable tasks") ? "Complete or mark Required, but Unavailable every required task before completing this case." : message.includes("required applicable questions") ? "Answer every required question before completing this case." : message.includes("not authorized") ? "You are not authorized to perform that action." : message.includes("invalid") ? "The selected customer or staff assignment is not valid for this organization." : "The change could not be saved. Please try again.");
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
  const status = text(data, "status") as CaseStatus;
  await requirePermission("WORK_CASES");
  if (!isCanonicalActiveCaseStatus(status)) {
    fail(`/cases/${id}`, "Select an active Case status.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_case_status", {
    target_case_id: id,
    target_status: status,
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
export async function completeCaseAction(data: FormData) {
  const id = text(data, "caseId");
  const taxOutcome = text(data, "taxOutcome");

  await requirePermission("WORK_CASES");

  if (!["REFUND", "BALANCE_DUE", "ZERO_BALANCE"].includes(taxOutcome)) {
    fail(`/cases/${id}`, "Select the final tax preparation outcome.");
  }

  const supabase = await createClient();

  // Temporary schema bridge until generated Supabase types include complete_case.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("complete_case", {
    target_case_id: id,
    target_tax_outcome: taxOutcome,
  });

  if (error) {
    console.error("Case completion failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    fail(`/cases/${id}`, friendly(error.message));
  }

  refreshCase(id);
  redirect(`/cases/${id}?message=Case%20completed.`);
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
  const dueDate = text(data, "dueDate");
  if (!text(data, "taskPurposeId") || !text(data, "title") || !validDate(dueDate))
    fail(`/cases/${id}`, "Task Purpose, Task title, and Due Date are required.");
  const supabase = await createClient();
  // Temporary RPC signature bridge until generated Supabase types are refreshed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("create_case_task", {
    target_case_id: id,
    target_task_purpose_id: text(data, "taskPurposeId"),
    target_title: text(data, "title"),
    target_description: text(data, "description"),
    target_assigned_user_id: optional(text(data, "assignedUserId")),
    target_required: data.get("required") === "on",
    target_due_date: dueDate,
    target_priority: (text(data, "priority") || "NORMAL") as Database["public"]["Enums"]["priority_level"],
    target_blocking: data.get("blocking") === "on",
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
  // Temporary schema bridge until generated Supabase types include task_purpose_id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("case_tasks")
    .select("title,description,assigned_user_id,status,required,due_at,task_purpose_id,source_rule_action_id,intake_follow_up_id")
    .eq("id", taskId)
    .eq("organization_id", context.activeOrganization.id)
    .maybeSingle();
  if (!existing) return fail(`/cases/${caseId}`, "The task was not found or is not authorized.");
  const canManage = hasPermission(context, "MANAGE_TASKS");
  const canAssign = hasPermission(context, "ASSIGN_TASKS");
  const dueDate = text(data, "dueDate");
  if (canManage && !validDate(dueDate))
    fail(`/cases/${caseId}`, "A Due Date is required when updating a Task.");

  const requestedStatus = text(data, "status") as TaskStatus;
  const staffTaskStatuses: TaskStatus[] = [
    "NOT_STARTED",
    "IN_PROGRESS",
    "WAITING_ON_CUSTOMER",
    "REQUIRED_UNAVAILABLE",
    "COMPLETED",
  ];
  const preservingSystemStatus =
    ["BLOCKED", "NOT_APPLICABLE"].includes(existing.status) &&
    requestedStatus === existing.status;

  if (
    !staffTaskStatuses.includes(requestedStatus) &&
    !preservingSystemStatus
  ) {
    fail(
      `/cases/${caseId}`,
      "That Task status is controlled by the system.",
    );
  }

  // Temporary RPC signature bridge until generated Supabase types are refreshed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("update_case_task", {
    target_task_id: taskId,
    target_task_purpose_id:
      canManage &&
      existing.source_rule_action_id === null &&
      existing.intake_follow_up_id === null
        ? (text(data, "taskPurposeId") || null)
        : existing.task_purpose_id,
    target_title: canManage ? text(data, "title") : existing.title,
    target_description: canManage ? text(data, "description") : existing.description,
    target_assigned_user_id: canAssign ? nullableUuid(text(data, "assignedUserId")) : nullableUuid(existing.assigned_user_id ?? ""),
    target_status: requestedStatus,
    target_required: existing.required,
    target_due_date: canManage ? dueDate : null,
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
export async function setDocumentRequirementReceivedAction(data: FormData) {
  const caseId = text(data, "caseId");
  const taskId = text(data, "taskId");
  const optionId = text(data, "optionId");
  const received = text(data, "received") === "true";

  await requirePermission("WORK_TASKS");

  if (!taskId || !optionId) {
    fail(`/cases/${caseId}`, "The document requirement is not available.");
  }

  const supabase = await createClient();

  // Temporary RPC bridge until generated Supabase types include this function.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc(
    "set_case_document_requirement_received",
    {
      target_task_id: taskId,
      target_option_id: optionId,
      target_received: received,
    },
  );

  if (error) {
    console.error("Document requirement receipt update failed", {
      code: error.code,
      message: error.message,
      taskId,
      optionId,
      received,
    });

    if (error.message.includes("Waiting on Customer")) {
      fail(
        `/cases/${caseId}`,
        "This Task remains Waiting on Customer until every required document is received.",
      );
    }

    fail(`/cases/${caseId}`, friendly(error.message));
  }

  refreshCase(caseId);

  redirect(
    `/cases/${caseId}?message=${encodeURIComponent(
      received
        ? "Document marked received."
        : "Document marked outstanding. Task is Waiting on Customer.",
    )}`,
  );
}

export async function sendMissingDocumentsNoticeAction(data: FormData) {
  const caseId = text(data, "caseId");
  const taskId = text(data, "taskId");
  const context = await requirePermission("WORK_TASKS");
  const organization = context.activeOrganization;
  const supabase = await createClient();

  // Temporary schema bridge until generated Supabase types include
  // Guided Intake Task provenance.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: task, error: taskError } = await (supabase as any)
    .from("case_tasks")
    .select(
      "id,case_id,status,intake_follow_up_id,intake_requirement_context,description",
    )
    .eq("id", taskId)
    .eq("organization_id", organization.id)
    .eq("case_id", caseId)
    .maybeSingle();

  if (taskError || !task?.intake_follow_up_id) {
    fail(`/cases/${caseId}`, "The Requirements Task is not available.");
  }

  if (task.status === "COMPLETED" || task.status === "NOT_APPLICABLE") {
    fail(`/cases/${caseId}`, "This Requirements Task no longer needs a notice.");
  }

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id,case_number,customer_id")
    .eq("id", caseId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (caseError || !caseRow) {
    fail(`/cases/${caseId}`, "The Case is not available.");
  }
  const currentCase = caseRow!;

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id,name,email,status")
    .eq("id", currentCase.customer_id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (customerError || !customer) {
    fail(`/cases/${caseId}`, "The Customer is not available.");
  }
  const currentCustomer = customer!;

  const requirementContext =
    task.intake_requirement_context &&
    typeof task.intake_requirement_context === "object" &&
    !Array.isArray(task.intake_requirement_context)
      ? (task.intake_requirement_context as Record<string, unknown>)
      : null;

  if (requirementContext?.kind !== "DOCUMENT_REQUIREMENT") {
    fail(
      `/cases/${caseId}`,
      "The document requirements are not available.",
    );
  }

  const documentRequirementContext = requirementContext!;

  const requiredIds = Array.isArray(documentRequirementContext.required_option_ids)
    ? documentRequirementContext.required_option_ids.filter(
        (value: unknown): value is string => typeof value === "string",
      )
    : [];

  const requiredLabels = Array.isArray(
    documentRequirementContext.required_option_labels,
  )
    ? documentRequirementContext.required_option_labels.filter(
        (value: unknown): value is string => typeof value === "string",
      )
    : [];

  const receivedIds = new Set(
    Array.isArray(documentRequirementContext.received_option_ids)
      ? documentRequirementContext.received_option_ids.filter(
          (value: unknown): value is string => typeof value === "string",
        )
      : [],
  );

  const outstandingById = new Map(
    requiredIds
      .map((id, index) => ({
        id,
        label: requiredLabels[index] ?? "Required document",
      }))
      .filter((document) => !receivedIds.has(document.id))
      .map((document) => [document.id, document.label]),
  );

  const requestedOptionIds = [
    ...new Set(
      data
        .getAll("selectedOptionId")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];

  const selectedDocuments = requestedOptionIds
    .map((id) => outstandingById.get(id))
    .filter((label): label is string => Boolean(label));

  if (!selectedDocuments.length) {
    fail(
      `/cases/${caseId}`,
      "Select at least one outstanding document to include in the Customer notice.",
    );
  }

  const missingDocuments = selectedDocuments.join(", ");

  try {
    await sendMissingDocumentsNotice({
      organizationId: organization.id,
      organizationName: organization.name,
      customerId: currentCustomer.id,
      customerName: currentCustomer.name,
      customerEmail: currentCustomer.email,
      caseId,
      caseNumber: currentCase.case_number,
      missingDocuments: missingDocuments || "Required documents",
      actorUserId: context.user.id,
    });
  } catch (error) {
    console.error("Missing documents notice failed", {
      organizationId: organization.id,
      caseId,
      taskId,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    fail(
      `/cases/${caseId}`,
      error instanceof MissingDocumentsNoticeError
        ? error.safeMessage
        : "The Customer notice could not be sent.",
    );
  }

  // Temporary RPC bridge until generated Supabase types include this function.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: statusError } = await (supabase as any).rpc(
    "mark_intake_requirement_notice_sent",
    {
      target_task_id: taskId,
    },
  );

  refreshCase(caseId);
  revalidatePath("/communications");

  if (statusError) {
    console.error("Requirements Task notice status update failed", {
      code: statusError.code,
      message: statusError.message,
      taskId,
    });

    redirect(
      `/cases/${caseId}?message=${encodeURIComponent(
        "Notice sent. Task status could not be refreshed automatically.",
      )}`,
    );
  }

  redirect(
    `/cases/${caseId}?message=${encodeURIComponent(
      `Notice sent to ${currentCustomer.email}.`,
    )}`,
  );
}

export async function deleteTaskAction(data: FormData) {
  const caseId = text(data, "caseId");
  await requirePermission("MANAGE_TASKS");

  fail(
    `/cases/${caseId}`,
    "Workflow Tasks cannot be deleted.",
  );
}

export async function moveTaskAction(data: FormData) {
  const caseId = text(data, "caseId");
  await requirePermission("MANAGE_TASKS");

  fail(
    `/cases/${caseId}`,
    "Workflow Tasks cannot be manually reordered.",
  );
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
