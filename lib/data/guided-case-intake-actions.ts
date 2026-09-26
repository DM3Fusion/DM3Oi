"use server";
import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createCustomerForCurrentOrganization } from "@/lib/data/customer-creation";
import { loadGuidedCaseIntakeConfiguration } from "@/lib/data/guided-case-intake";
import {
  buildGuidedIntakeCreationPlan,
  evaluateGuidedCaseIntake,
  getMissingRequiredOptions,
  canCompleteIntakeFollowUpTask,
  validateGuidedCaseIntake,
  type GuidedCaseIntakeDraft,
} from "@/lib/guided-case-intake";
import { createClient } from "@/lib/supabase/server";
import type { CustomerCreationValues } from "@/lib/customer-validation";
import type { GuidedIntakeNewCustomerDraft } from "@/lib/data/guided-case-intake-drafts";

export async function createInlineIntakeCustomerAction(
  values: CustomerCreationValues,
) {
  return createCustomerForCurrentOrganization(values);
}


export type SaveGuidedIntakeDraftInput = {
  currentStep: number;
  customerMode: "existing" | "new";
  draft: GuidedCaseIntakeDraft;
  newCustomer: GuidedIntakeNewCustomerDraft;
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

  const evaluation = evaluateGuidedCaseIntake(
    configuration,
    input.draft.answers,
  );
  const unstagedMissingRequirement = getMissingRequiredOptions(
    evaluation,
    input.draft.answers,
  ).some(
    (requirement) =>
      !input.draft.followUpTasks.some(
        (task) => task.questionId === requirement.question.id,
      ),
  );
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

  const payload = {
    organization_id: organizationId,
    created_by_user_id: access.user.id,
    submission_key: input.draft.submissionKey,
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
    case_title_id: input.draft.caseTitleId || null,
    tax_year: input.draft.taxYear,
    description: input.draft.description,
    case_type_id: input.draft.caseTypeId || null,
    priority: guidedCasePriority(input.draft.priority),
    manager_user_id: input.draft.managerUserId || null,
    staff_user_ids: input.draft.staffUserIds,
    answers: input.draft.answers,
    follow_up_tasks: input.draft.followUpTasks,
  };

  const { data, error } = await supabase
    .from("guided_case_intake_drafts")
    .upsert(payload, {
      onConflict: "organization_id,created_by_user_id,submission_key",
    })
    .select("id")
    .single();

  if (error || !data) {
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

  revalidatePath("/cases");
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

export async function createGuidedCaseAction(
  draft: GuidedCaseIntakeDraft,
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
  const validation = validateGuidedCaseIntake(draft, configuration);
  if (!validation.valid) {
    return {
      ok: false,
      error: "Review the highlighted intake blockers.",
      fieldErrors: validation.fieldErrors,
      step: firstInvalidStep(validation.fieldErrors),
    };
  }
  const creationPlan = buildGuidedIntakeCreationPlan(
    configuration,
    draft.answers,
  );
  const supabase = await createClient();
  const { data: created, error } = await supabase.rpc(
    "create_guided_case_intake",
    {
      target_organization_id: access.activeOrganization!.id,
      target_submission_key: draft.submissionKey,
      target_customer_id: draft.customerId,
      target_case_title_id: draft.caseTitleId,
      target_description: draft.description.trim(),
      target_case_type_id: draft.caseTypeId,
      target_priority: guidedCasePriority(draft.priority),
      target_tax_year: draft.taxYear!,
      target_manager_user_id: draft.managerUserId || undefined,
      target_staff_user_ids: draft.staffUserIds,
      target_answers: creationPlan.answers,
      target_follow_up_tasks: draft.followUpTasks,
    },
  );
  if (error || !created) {
    console.error("Guided Case Intake creation failed", {
      organizationId: access.activeOrganization!.id,
      code: error?.code,
      message: error?.message,
    });
    const staleConfiguration =
      error?.message.includes("invalid Case Title") ||
      error?.message.includes("invalid Case Type") ||
      error?.message.includes("invalid manager") ||
      error?.message.includes("invalid staff") ||
      error?.message.includes("intake response") ||
      error?.message.includes("intake question") ||
      error?.message.includes("required intake response");
    return {
      ok: false,
      error: staleConfiguration
        ? "Intake configuration changed. Review the affected step and try again."
        : error?.message.includes("not authorized") ||
            error?.message.includes("permission")
          ? "You are no longer authorized to create or assign this Case."
          : "The Case could not be created. Please try again.",
      fieldErrors: {},
      step: staleConfiguration ? 1 : 5,
    };
  }
  revalidatePath("/");
  revalidatePath("/cases");
  revalidatePath("/customers");
  revalidatePath(`/cases/${created.id}`);
  return { ok: true, caseId: created.id, caseNumber: created.case_number };
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
  return { ok: true };
}
