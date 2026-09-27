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
  guidedFollowUpTaskMatchesMissingOptions,
  canCompleteIntakeFollowUpTask,
  validateGuidedRequiredOptionMap,
  validateGuidedCaseIntake,
  type GuidedCaseIntakeDraft,
} from "@/lib/guided-case-intake";
import { createClient } from "@/lib/supabase/server";
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

  let canonicalSubmissionKey = input.draft.submissionKey;

  if (
    input.draft.customerId &&
    input.draft.taxYear !== null &&
    Number.isInteger(input.draft.taxYear)
  ) {
    const existingDraft = await supabase
      .from("guided_case_intake_drafts")
      .select("id,submission_key")
      .eq("organization_id", organizationId)
      .eq("created_by_user_id", access.user.id)
      .eq("customer_id", input.draft.customerId)
      .eq("tax_year", input.draft.taxYear)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDraft.error) {
      console.error("Guided Intake canonical draft lookup failed", {
        organizationId,
        code: existingDraft.error.code,
        message: existingDraft.error.message,
      });
      return {
        ok: false,
        error: "The intake draft could not be saved. Please try again.",
      };
    }

    if (existingDraft.data?.submission_key) {
      canonicalSubmissionKey = existingDraft.data.submission_key;
    }
  }

  const { data, error } = await supabase
    .from("guided_case_intake_drafts")
    .upsert(
      {
        ...payload,
        submission_key: canonicalSubmissionKey,
      },
      {
        onConflict: "organization_id,created_by_user_id,submission_key",
      },
    )
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
  if (keys.some((key) => key === "customerId" || key === "taxYear")) return 0;
  if (keys.some((key) => !key.startsWith("question."))) return 1;
  return 2;
};

export async function createGuidedCaseAction(
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
    "create_guided_case_intake",
    {
      target_organization_id: access.activeOrganization!.id,
      target_submission_key: draft.submissionKey,
      target_customer_id: draft.customerId,
      target_customer_mode: customerMode,
      target_description: draft.description.trim(),
      target_case_type_id: draft.caseTypeId,
      target_priority: guidedCasePriority(draft.priority),
      target_tax_year: draft.taxYear!,
      target_manager_user_id: draft.managerUserId || undefined,
      target_staff_user_ids: draft.staffUserIds,
      target_answers: creationPlan.answers,
      target_required_option_ids: draft.requiredOptionIds,
      target_follow_up_tasks: draft.followUpTasks,
      target_portal_onboarding: draft.portalOnboarding,
    },
  );
  if (error || !created) {
    console.error("Guided Case Intake creation failed", {
      organizationId: access.activeOrganization!.id,
      code: error?.code,
      message: error?.message,
    });
    const duplicateCustomerTaxYear =
      error?.message.includes("Customer already has a Case for this tax year") ||
      (error?.code === "23505" &&
        error?.message.includes("cases_one_customer_per_tax_year"));
    if (duplicateCustomerTaxYear) {
      return {
        ok: false,
        error:
          "This Customer already has a Case for the selected tax year.",
        fieldErrors: {
          customerId:
            "Select another Customer or choose a different tax year.",
        },
        step: 0,
      };
    }
    const staleConfiguration =
      error?.message.includes("invalid Case Type") ||
      error?.message.includes("Case Type requires") ||
      error?.message.includes("Case Type is not valid") ||
      error?.message.includes("invalid manager") ||
      error?.message.includes("invalid staff") ||
      error?.message.includes("intake response") ||
      error?.message.includes("intake question") ||
      error?.message.includes("required intake response") ||
      error?.message.includes("tracked") ||
      error?.message.includes("required option") ||
      error?.message.includes("missing requirements") ||
      error?.message.includes("Customer Portal onboarding");
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
