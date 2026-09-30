"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createCustomerForCurrentOrganization } from "@/lib/data/customer-creation";
import { loadGuidedCaseIntakeConfiguration } from "@/lib/data/guided-case-intake";
import {
  buildGuidedIntakeCreationPlan,
  evaluateGuidedCaseIntake,
  getMissingRequiredOptions,
  guidedFollowUpTaskMatchesMissingOptions,
  canCompleteIntakeFollowUpTask,
  validateGuidedRequiredOptionMap,
  validateGuidedCaseDetails,
  validateGuidedCustomerStep,
  validateGuidedCaseIntake,
  type GuidedCaseIntakeDraft,
  type GuidedIntakeFollowUpTask,
} from "@/lib/guided-case-intake";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CustomerCreationValues } from "@/lib/customer-validation";
import type { GuidedIntakeNewCustomerDraft } from "@/lib/data/guided-case-intake-drafts";
import {
  portalOnboardingResolvedForIntake,
  parseGuidedIntakePortalResolution,
  type CustomerPortalOnboardingStatus,
  type GuidedIntakePortalResolution,
} from "@/lib/customer-portal-onboarding";
import {
  CustomerPortalProvisioningError,
  getCustomerPortalOnboardingStatus,
  provisionCustomerPortalAccess,
} from "@/lib/data/customer-portal-provisioning-service";
import { mapGuidedCaseFinalizationError } from "@/lib/guided-case-finalization";
import {
  MissingDocumentsNoticeError,
  sendMissingDocumentsNotice,
} from "@/lib/data/missing-documents-notice-service";

export async function createInlineIntakeCustomerAction(
  values: CustomerCreationValues,
) {
  return createCustomerForCurrentOrganization(values, "GUIDED_INTAKE");
}


export type SaveGuidedIntakeDraftInput = {
  currentStep: number;
  customerMode: "existing" | "new";
  draft: GuidedCaseIntakeDraft;
  newCustomer: GuidedIntakeNewCustomerDraft;
};

const canonicalCustomerDraftSubmissionKey = (
  organizationId: string,
  creatorId: string,
  customerId: string,
  previousCaseSubmissionKey: string,
) => {
  const bytes = createHash("sha256")
    .update(
      `guided-intake-customer-v1:${organizationId}:${creatorId}:${customerId}:${previousCaseSubmissionKey}`,
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
};

export async function saveGuidedIntakeDraftAction(
  input: SaveGuidedIntakeDraftInput,
): Promise<
  | { ok: true; draftId: string }
  | { ok: false; error: string }
> {
  const { access, configuration } = await loadGuidedCaseIntakeConfiguration();
  const organizationId = access.activeOrganization!.id;

  if (
    !Number.isInteger(input.currentStep) ||
    input.currentStep < 0 ||
    input.currentStep > 5 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.draft.submissionKey,
    )
  ) {
    return { ok: false, error: "This intake draft is invalid." };
  }
  const portalOnboarding = parseGuidedIntakePortalResolution(
    input.draft.portalOnboarding,
  );
  if (
    portalOnboarding.resolution !== "UNRESOLVED" &&
    portalOnboarding.customerId !== input.draft.customerId
  ) {
    return {
      ok: false,
      error: "Customer Portal onboarding does not match the selected Customer.",
    };
  }

  const evaluation = evaluateGuidedCaseIntake(
    configuration,
    input.draft.answers,
    input.draft.requiredOptionIds,
  );
  const unstagedMissingRequirement = getMissingRequiredOptions(
    evaluation,
    input.draft.answers,
    input.draft.requiredOptionIds,
  ).some(
    (requirement) =>
      !input.draft.followUpTasks.some(
        (task) => task.questionId === requirement.question.id,
      ),
  );
  const requiredOptionErrors = validateGuidedRequiredOptionMap(
    configuration.questions,
    input.draft.answers,
    input.draft.requiredOptionIds,
  );
  if (Object.keys(requiredOptionErrors).length) {
    return {
      ok: false,
      error: "Required and received items must use active options from their Question.",
    };
  }
  if (
    new Set(input.draft.followUpTasks.map((task) => task.questionId)).size !==
      input.draft.followUpTasks.length ||
    input.draft.followUpTasks.some(
      (task) =>
        !guidedFollowUpTaskMatchesMissingOptions(
          task,
          evaluation,
          input.draft.answers,
          input.draft.requiredOptionIds,
        ),
    )
  ) {
    return {
      ok: false,
      error:
        "A follow-up Task no longer matches the current missing required items. Review it and try again.",
    };
  }
  if (input.currentStep >= 2 && unstagedMissingRequirement) {
    return {
      ok: false,
      error:
        "Create a follow-up Task for each missing required-document group before saving this intake.",
    };
  }
  if (
    input.draft.followUpTasks.some(
      (task) => task.completed && !canCompleteIntakeFollowUpTask(task, evaluation),
    )
  ) {
    return {
      ok: false,
      error:
        "Required documents must be received before a follow-up Task can remain completed.",
    };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const [existingSession, customerDrafts, latestCustomerCase] =
    await Promise.all([
      supabase
        .from("guided_case_intake_drafts")
        .select("id,submission_key,customer_id")
        .eq("organization_id", organizationId)
        .eq("created_by_user_id", access.user.id)
        .eq("submission_key", input.draft.submissionKey)
        .is("finalized_at", null)
        .maybeSingle(),
      input.draft.customerId
        ? supabase
            .from("guided_case_intake_drafts")
            .select("id,submission_key,current_step,updated_at")
            .eq("organization_id", organizationId)
            .eq("created_by_user_id", access.user.id)
            .eq("customer_id", input.draft.customerId)
            .is("finalized_at", null)
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      input.draft.customerId
        ? admin
            .from("cases")
            .select("intake_submission_key")
            .eq("organization_id", organizationId)
            .eq("created_by_user_id", access.user.id)
            .eq("customer_id", input.draft.customerId)
            .not("intake_submission_key", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  const draftLookupError =
    existingSession.error ?? customerDrafts.error ?? latestCustomerCase.error;
  if (draftLookupError) {
    console.error("Guided Intake draft canonical lookup failed", {
      organizationId,
      code: draftLookupError.code,
      message: draftLookupError.message,
    });
    return {
      ok: false,
      error: "The intake draft could not be saved. Please try again.",
    };
  }

  const resumesCustomerDraft = (customerDrafts.data ?? []).some(
    (draft) => draft.submission_key === input.draft.submissionKey,
  );
  if ((customerDrafts.data?.length ?? 0) > 0 && !resumesCustomerDraft) {
    return {
      ok: false,
      error:
        "An unfinished intake already exists for this Customer. Resume the existing draft from Cases → Draft Intakes.",
    };
  }

  const canonicalSubmissionKey =
    input.draft.customerId && !existingSession.data
      ? canonicalCustomerDraftSubmissionKey(
          organizationId,
          access.user.id,
          input.draft.customerId,
          latestCustomerCase.data?.intake_submission_key ?? "no-prior-case",
        )
      : input.draft.submissionKey;

  const payload = {
    organization_id: organizationId,
    created_by_user_id: access.user.id,
    submission_key: canonicalSubmissionKey,
    current_step: input.currentStep,
    customer_mode: input.customerMode,
    customer_id: input.draft.customerId || null,
    new_customer: {
      type: input.newCustomer.type,
      name: input.newCustomer.name,
      firstName: input.newCustomer.firstName,
      lastName: input.newCustomer.lastName,
      email: input.newCustomer.email,
      phone: input.newCustomer.phone,
      notes: input.newCustomer.notes,
    },
    tax_year: input.draft.taxYear,
    description: input.draft.description,
    case_type_id: input.draft.caseTypeId || null,
    priority: guidedCasePriority(input.draft.priority),
    manager_user_id: input.draft.managerUserId || null,
    staff_user_ids: input.draft.staffUserIds,
    answers: input.draft.answers,
    required_option_ids: input.draft.requiredOptionIds,
    follow_up_tasks: input.draft.followUpTasks,
    portal_onboarding: portalOnboarding,
  };

  const { data, error } = existingSession.data
    ? await supabase
        .from("guided_case_intake_drafts")
        .upsert(payload, {
          onConflict: "organization_id,created_by_user_id,submission_key",
        })
        .select("id")
        .single()
    : await supabase
        .from("guided_case_intake_drafts")
        .insert(payload)
        .select("id")
        .single();

  if (error || !data) {
    if (error?.code === "23505" && input.draft.customerId) {
      return {
        ok: false,
        error:
          "An unfinished intake already exists for this Customer. Resume the existing draft from Cases → Draft Intakes.",
      };
    }
    console.error("Guided Intake draft save failed", {
      organizationId,
      code: error?.code,
      message: error?.message,
    });
    return {
      ok: false,
      error: "The intake draft could not be saved. Please try again.",
    };
  }

  if (input.draft.caseId && input.draft.followUpTasks.length) {
    const completedByFollowUpId = new Map(
      input.draft.followUpTasks.map((task) => [task.id, task.completed]),
    );

    // Temporary schema bridge until generated Supabase types include
    // Guided Intake Task provenance and lifecycle synchronization RPC.
    const { data: persistedFollowUpTasks, error: followUpTaskError } =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("case_tasks")
        .select("id,intake_follow_up_id,status")
        .eq("organization_id", organizationId)
        .eq("case_id", input.draft.caseId)
        .not("intake_follow_up_id", "is", null);

    if (followUpTaskError) {
      console.error("Guided Intake follow-up Task synchronization lookup failed", {
        organizationId,
        caseId: input.draft.caseId,
        code: followUpTaskError.code,
        message: followUpTaskError.message,
      });
      return {
        ok: false,
        error:
          "The intake was saved, but its follow-up Tasks could not be synchronized. Please try again.",
      };
    }

    for (const persistedTask of persistedFollowUpTasks ?? []) {
      const followUpId = persistedTask.intake_follow_up_id;
      if (
        typeof followUpId !== "string" ||
        !completedByFollowUpId.has(followUpId)
      ) {
        continue;
      }

      const completed = completedByFollowUpId.get(followUpId) === true;
      const targetStatus = completed
        ? "COMPLETED"
        : persistedTask.status === "COMPLETED"
          ? "IN_PROGRESS"
          : persistedTask.status;

      if (targetStatus === persistedTask.status) continue;

      // Guided Intake owns this workflow Task. Synchronize only lifecycle
      // state from the already-persisted Requirements state.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: syncError } = await (supabase as any).rpc(
        "sync_guided_intake_requirement_task_status",
        {
          target_task_id: persistedTask.id,
          target_completed: completed,
        },
      );

      if (syncError) {
        console.error("Guided Intake follow-up Task synchronization failed", {
          organizationId,
          caseId: input.draft.caseId,
          taskId: persistedTask.id,
          followUpId,
          targetStatus,
          code: syncError.code,
          message: syncError.message,
        });
        return {
          ok: false,
          error:
            "The intake was saved, but its follow-up Task status could not be synchronized. Please try again.",
        };
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/cases");
  revalidatePath("/cases/new");
  if (input.draft.caseId) {
    revalidatePath(`/cases/${input.draft.caseId}`);
  }
  return { ok: true, draftId: data.id };
}

const guidedCasePriority = (
  priority: GuidedCaseIntakeDraft["priority"],
): "LOW" | "NORMAL" | "HIGH" | "URGENT" =>
  priority === "LOW" ||
  priority === "HIGH" ||
  priority === "URGENT"
    ? priority
    : "NORMAL";

export type UpsertGuidedIntakeFollowUpTaskResult =
  | { ok: true }
  | { ok: false; error: string };

export async function upsertGuidedIntakeFollowUpTaskAction(
  draft: GuidedCaseIntakeDraft,
  task: GuidedIntakeFollowUpTask,
): Promise<UpsertGuidedIntakeFollowUpTaskResult> {
  const { access, configuration } =
    await loadGuidedCaseIntakeConfiguration();

  if (!draft.caseId) {
    return {
      ok: false,
      error: "Establish the Case before creating a follow-up Task.",
    };
  }

  const evaluation = evaluateGuidedCaseIntake(
    configuration,
    draft.answers,
    draft.requiredOptionIds,
  );

  if (
    !guidedFollowUpTaskMatchesMissingOptions(
      task,
      evaluation,
      draft.answers,
      draft.requiredOptionIds,
    )
  ) {
    return {
      ok: false,
      error: "The follow-up Task no longer matches the missing required items.",
    };
  }

  if (
    !configuration.staff.some((member) => member.id === task.assignedUserId)
  ) {
    return {
      ok: false,
      error: "Select an active Staff assignee.",
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) {
    return {
      ok: false,
      error: "Select a valid Due Date.",
    };
  }

  const supabase = await createClient();

  // Reassignment of an already-created Guided Intake follow-up Task is
  // deliberately narrower than general Case assignment authority.
  // Only a Business Owner or Staff Manager with ASSIGN_TASKS may change it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: persistedTask, error: persistedTaskError } = await (supabase as any)
    .from("case_tasks")
    .select("assigned_user_id")
    .eq("organization_id", access.activeOrganization!.id)
    .eq("case_id", draft.caseId)
    .eq("intake_follow_up_id", task.id)
    .maybeSingle();

  if (persistedTaskError) {
    console.error("Guided Intake follow-up Task assignment lookup failed", {
      organizationId: access.activeOrganization!.id,
      caseId: draft.caseId,
      followUpId: task.id,
      code: persistedTaskError.code,
      message: persistedTaskError.message,
    });
    return {
      ok: false,
      error: "The follow-up Task could not be saved. Please try again.",
    };
  }

  if (
    persistedTask &&
    persistedTask.assigned_user_id !== task.assignedUserId
  ) {
    const role = access.activeOrganization!.role;
    const mayReassign =
      !access.isSuperAdmin &&
      hasPermission(access, "ASSIGN_TASKS") &&
      (
        role === "BUSINESS_OWNER" ||
        role === "STAFF_MANAGER"
      );

    if (!mayReassign) {
      return {
        ok: false,
        error: "Only a Business Owner or Staff Manager may reassign this Task.",
      };
    }
  }

  // Temporary RPC signature bridge until generated Supabase types are refreshed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc(
    "upsert_guided_intake_follow_up_task",
    {
      target_organization_id: access.activeOrganization!.id,
      target_submission_key: draft.submissionKey,
      target_follow_up: task,
    },
  );

  if (error) {
    console.error("Guided Intake follow-up Task persistence failed", {
      organizationId: access.activeOrganization!.id,
      submissionKey: draft.submissionKey,
      caseId: draft.caseId,
      followUpId: task.id,
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      error: "The follow-up Task could not be saved. Please try again.",
    };
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/cases");
  revalidatePath("/cases/new");
  revalidatePath(`/cases/${draft.caseId}`);

  return { ok: true };
}

export type SendGuidedIntakeMissingDocumentsNoticeResult =
  | {
      ok: true;
      recipientEmail: string;
      alreadySent: boolean;
      statusUpdated: boolean;
    }
  | { ok: false; error: string };

export async function sendGuidedIntakeMissingDocumentsNoticeAction(
  caseId: string,
  followUpId: string,
): Promise<SendGuidedIntakeMissingDocumentsNoticeResult> {
  const access = await getAccessContext();
  const organization = access?.activeOrganization;

  if (
    !access?.user ||
    !organization ||
    !hasPermission(access, "WORK_TASKS")
  ) {
    return {
      ok: false,
      error: "You are not authorized to send this Customer notice.",
    };
  }

  const supabase = await createClient();

  // Temporary schema bridge until generated Supabase types include
  // Guided Intake Task provenance.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: task, error: taskError } = await (supabase as any)
    .from("case_tasks")
    .select(
      "id,case_id,status,intake_follow_up_id,intake_requirement_context,description",
    )
    .eq("organization_id", organization.id)
    .eq("case_id", caseId)
    .eq("intake_follow_up_id", followUpId)
    .maybeSingle();

  if (taskError || !task) {
    return {
      ok: false,
      error: "The Requirements Task is not available.",
    };
  }

  if (task.status === "IN_PROGRESS") {
    const { data: currentCase } = await supabase
      .from("cases")
      .select("customer_id")
      .eq("id", caseId)
      .eq("organization_id", organization.id)
      .maybeSingle();

    const { data: currentCustomer } = currentCase
      ? await supabase
          .from("customers")
          .select("email")
          .eq("id", currentCase.customer_id)
          .eq("organization_id", organization.id)
          .maybeSingle()
      : { data: null };

    return {
      ok: true,
      recipientEmail: currentCustomer?.email ?? "",
      alreadySent: true,
      statusUpdated: true,
    };
  }

  if (task.status !== "NOT_STARTED") {
    return {
      ok: false,
      error: "This Requirements Task is no longer awaiting a Customer notice.",
    };
  }

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id,case_number,customer_id")
    .eq("id", caseId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (caseError || !caseRow) {
    return {
      ok: false,
      error: "The Case is not available.",
    };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id,name,email,status")
    .eq("id", caseRow.customer_id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (customerError || !customer) {
    return {
      ok: false,
      error: "The Customer is not available.",
    };
  }

  const requirementContext = task.intake_requirement_context as
    | { missing_option_labels?: unknown }
    | null;

  const missingDocuments = Array.isArray(
    requirementContext?.missing_option_labels,
  )
    ? requirementContext.missing_option_labels
        .filter(
          (value: unknown): value is string =>
            typeof value === "string",
        )
        .join(", ")
    : String(task.description ?? "")
        .replace(/^Outstanding requirements:\s*/i, "")
        .trim();

  try {
    await sendMissingDocumentsNotice({
      organizationId: organization.id,
      organizationName: organization.name,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      caseId,
      caseNumber: caseRow.case_number,
      missingDocuments: missingDocuments || "Required documents",
      actorUserId: access.user.id,
    });
  } catch (error) {
    console.error("Guided Intake missing documents notice failed", {
      organizationId: organization.id,
      caseId,
      followUpId,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      ok: false,
      error:
        error instanceof MissingDocumentsNoticeError
          ? error.safeMessage
          : "The Customer notice could not be sent.",
    };
  }

  // The canonical RPC records successful notice delivery by moving the
  // workflow-generated Task from NOT_STARTED to IN_PROGRESS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: statusError } = await (supabase as any).rpc(
    "mark_intake_requirement_notice_sent",
    {
      target_task_id: task.id,
    },
  );

  if (statusError) {
    console.error("Guided Intake Requirements Task notice status update failed", {
      organizationId: organization.id,
      caseId,
      followUpId,
      taskId: task.id,
      code: statusError.code,
      message: statusError.message,
    });
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/cases");
  revalidatePath("/cases/new");
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/communications");

  return {
    ok: true,
    recipientEmail: customer.email ?? "",
    alreadySent: false,
    statusUpdated: !statusError,
  };
}

export type CreateGuidedCaseResult =
  | { ok: true; caseId: string; caseNumber: string }
  | {
      ok: false;
      error: string;
      fieldErrors: Record<string, string>;
      step: number;
    };

const firstInvalidStep = (fieldErrors: Record<string, string>) => {
  const keys = Object.keys(fieldErrors);
  if (keys.some((key) => key === "customerId")) return 0;
  if (keys.some((key) => !key.startsWith("question."))) return 1;
  return 2;
};

export async function materializeGuidedCaseAction(
  draft: GuidedCaseIntakeDraft,
  customerMode: "existing" | "new",
): Promise<CreateGuidedCaseResult> {
  const { access, configuration } =
    await loadGuidedCaseIntakeConfiguration();
  const fieldErrors = {
    ...validateGuidedCustomerStep(draft, configuration),
    ...validateGuidedCaseDetails(draft, configuration, customerMode),
  };

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      draft.submissionKey,
    )
  ) {
    return {
      ok: false,
      error: "This intake session is invalid. Refresh and try again.",
      fieldErrors: {},
      step: 0,
    };
  }

  if (Object.keys(fieldErrors).length) {
    return {
      ok: false,
      error: "Complete the highlighted Case details before continuing.",
      fieldErrors,
      step: firstInvalidStep(fieldErrors),
    };
  }

  const supabase = await createClient();
  // Temporary signature bridge until generated RPC types include Milestone 2.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: materialized, error } = await (supabase as any).rpc(
    "materialize_guided_case_intake",
    {
      target_organization_id: access.activeOrganization!.id,
      target_submission_key: draft.submissionKey,
      target_customer_id: draft.customerId,
      target_customer_mode: customerMode,
      target_description: draft.description.trim(),
      target_case_type_id: draft.caseTypeId,
      target_priority: guidedCasePriority(draft.priority),
      target_tax_year: draft.taxYear!,
      target_manager_user_id: draft.managerUserId || null,
      target_staff_user_ids: draft.staffUserIds,
    },
  );

  if (error || !materialized) {
    console.error("Guided Case Intake materialization failed", {
      operation: "materialize_guided_case_intake",
      organizationId: access.activeOrganization!.id,
      submissionKey: draft.submissionKey,
      customerId: draft.customerId,
      caseTypeId: draft.caseTypeId,
      taxYear: draft.taxYear,
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return {
      ok: false,
      ...mapGuidedCaseFinalizationError(error, "materialize"),
    };
  }

  revalidatePath("/");
  revalidatePath("/cases");
  revalidatePath("/cases/new");
  revalidatePath(`/cases/${materialized.id}`);
  return {
    ok: true,
    caseId: materialized.id,
    caseNumber: materialized.case_number,
  };
}

export async function finalizeGuidedCaseAction(
  draft: GuidedCaseIntakeDraft,
  customerMode: "existing" | "new",
): Promise<CreateGuidedCaseResult> {
  const { access, configuration } =
    await loadGuidedCaseIntakeConfiguration();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.submissionKey)) {
    return {
      ok: false,
      error: "This intake session is invalid. Refresh and try again.",
      fieldErrors: {},
      step: 0,
    };
  }
  if (!draft.caseId) {
    return {
      ok: false,
      error: "Return to Case Details and establish the Case before finishing intake.",
      fieldErrors: { caseTypeId: "The Case has not been established." },
      step: 1,
    };
  }
  const validation = validateGuidedCaseIntake(
    draft,
    configuration,
    customerMode,
  );
  if (!validation.valid) {
    return {
      ok: false,
      error: "Review the highlighted intake blockers.",
      fieldErrors: validation.fieldErrors,
      step: firstInvalidStep(validation.fieldErrors),
    };
  }
  const supabase = await createClient();
  const replay =
    configuration.portalOnboardingMode === "PROMPT_DURING_CASE_INTAKE"
      ? await supabase
          .from("cases")
          .select("id")
          .eq("organization_id", access.activeOrganization!.id)
          .eq("created_by_user_id", access.user.id)
          .eq("intake_submission_key", draft.submissionKey)
          .maybeSingle()
      : { data: null, error: null };
  let portalStatus: CustomerPortalOnboardingStatus | null = null;
  if (
    configuration.portalOnboardingMode === "PROMPT_DURING_CASE_INTAKE" &&
    !replay.data
  ) {
    portalStatus = await getCustomerPortalOnboardingStatus({
      organizationId: access.activeOrganization!.id,
      customerId: draft.customerId,
      actorUserId: access.user.id,
    });
    if (
      !portalOnboardingResolvedForIntake(
        configuration.portalOnboardingMode,
        draft.customerId,
        portalStatus,
        draft.portalOnboarding,
      )
    ) {
      return {
        ok: false,
        error:
          "Resolve Customer Portal access in Requirements before creating this Case.",
        fieldErrors: {
          portalOnboarding: "Customer Portal onboarding is unresolved.",
        },
        step: 3,
      };
    }
  }
  const creationPlan = buildGuidedIntakeCreationPlan(
    configuration,
    draft.answers,
    draft.requiredOptionIds,
  );
  // Temporary RPC signature bridge until generated Supabase types are refreshed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error } = await (supabase as any).rpc(
    "finalize_guided_case_intake",
    {
      target_organization_id: access.activeOrganization!.id,
      target_submission_key: draft.submissionKey,
      target_customer_id: draft.customerId,
      target_customer_mode: customerMode,
      target_description: draft.description.trim(),
      target_case_type_id: draft.caseTypeId,
      target_priority: guidedCasePriority(draft.priority),
      target_tax_year: draft.taxYear!,
      target_manager_user_id: draft.managerUserId || null,
      target_staff_user_ids: draft.staffUserIds,
      target_answers: creationPlan.answers,
      target_follow_up_tasks: draft.followUpTasks,
      target_portal_onboarding: draft.portalOnboarding,
    },
  );
  if (error || !created) {
    console.error("Guided Case Intake finalization failed", {
      operation: "finalize_guided_case_intake",
      organizationId: access.activeOrganization!.id,
      submissionKey: draft.submissionKey,
      customerId: draft.customerId,
      caseTypeId: draft.caseTypeId,
      taxYear: draft.taxYear,
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    return { ok: false, ...mapGuidedCaseFinalizationError(error) };
  }
  revalidatePath("/");
  revalidatePath("/cases");
  revalidatePath("/cases/new");
  revalidatePath("/customers");
  revalidatePath(`/cases/${created.id}`);
  return { ok: true, caseId: created.id, caseNumber: created.case_number };
}

export type GuidedIntakePortalActionResult =
  | { ok: true; status: CustomerPortalOnboardingStatus }
  | { ok: false; error: string; status?: CustomerPortalOnboardingStatus };

async function requireGuidedIntakePortalCustomer(customerId: string) {
  const { access, configuration } = await loadGuidedCaseIntakeConfiguration();
  if (configuration.portalOnboardingMode !== "PROMPT_DURING_CASE_INTAKE")
    throw new CustomerPortalProvisioningError(
      "Portal onboarding is not enabled for Guided Intake.",
    );
  if (!configuration.customers.some((customer) => customer.id === customerId))
    throw new CustomerPortalProvisioningError(
      "The selected Customer is not available to this organization.",
    );
  return { access, configuration };
}

export async function loadGuidedIntakePortalStatusAction(
  customerId: string,
): Promise<GuidedIntakePortalActionResult> {
  try {
    const { access } = await requireGuidedIntakePortalCustomer(customerId);
    return {
      ok: true,
      status: await getCustomerPortalOnboardingStatus({
        organizationId: access.activeOrganization!.id,
        customerId,
        actorUserId: access.user.id,
      }),
    };
  } catch (error) {
    console.error("Guided Intake Portal status failed", {
      operation: "loadGuidedIntakePortalStatus",
      customerId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      ok: false,
      error:
        error instanceof CustomerPortalProvisioningError
          ? error.safeMessage
          : "Customer Portal status could not be loaded.",
    };
  }
}

export async function sendGuidedIntakePortalInvitationAction(
  customerId: string,
  resend = false,
): Promise<GuidedIntakePortalActionResult> {
  try {
    const { access } = await requireGuidedIntakePortalCustomer(customerId);
    const status = await provisionCustomerPortalAccess({
      organizationId: access.activeOrganization!.id,
      organizationName: access.activeOrganization!.name,
      customerId,
      actorUserId: access.user.id,
      intent: resend ? "RESEND" : "SEND",
    });
    revalidatePath("/cases/new");
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, status };
  } catch (error) {
    console.error("Guided Intake Portal invitation failed", {
      operation: resend ? "resendInvitation" : "sendInvitation",
      customerId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      ok: false,
      error:
        error instanceof CustomerPortalProvisioningError
          ? error.safeMessage
          : "The Customer Portal invitation could not be sent.",
    };
  }
}

export async function setGuidedIntakePortalNotRequiredAction(
  customerId: string,
  notRequired: boolean,
): Promise<
  | { ok: true; resolution: GuidedIntakePortalResolution }
  | { ok: false; error: string }
> {
  try {
    await requireGuidedIntakePortalCustomer(customerId);
    return {
      ok: true,
      resolution: notRequired
        ? { resolution: "NOT_REQUIRED", customerId }
        : { resolution: "UNRESOLVED" },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof CustomerPortalProvisioningError
          ? error.safeMessage
          : "Portal onboarding could not be updated.",
    };
  }
}


export async function deleteGuidedIntakeDraftAction(
  draftId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await getAccessContext();
  const organizationId = access?.activeOrganization?.id;

  if (
    !access?.user?.id ||
    !organizationId ||
    !hasPermission(access, "DELETE_DRAFT_INTAKES")
  ) {
    return {
      ok: false,
      error: "You are not authorized to delete this draft intake.",
    };
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      draftId,
    )
  ) {
    return { ok: false, error: "This draft intake is invalid." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("guided_case_intake_drafts")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", draftId)
    .is("case_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Guided Intake draft delete failed", {
      organizationId,
      draftId,
      code: error.code,
      message: error.message,
    });

    return {
      ok: false,
      error: "The draft intake could not be deleted.",
    };
  }

  if (!data) {
    return {
      ok: false,
      error:
        "The draft intake was not found or you are not authorized to delete it.",
    };
  }

  revalidatePath("/cases");
  revalidatePath("/cases/new");
  return { ok: true };
}
