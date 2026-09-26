"use server";
import { revalidatePath } from "next/cache";
import { createCustomerForCurrentOrganization } from "@/lib/data/customer-creation";
import { loadGuidedCaseIntakeConfiguration } from "@/lib/data/guided-case-intake";
import {
  buildGuidedIntakeCreationPlan,
  validateGuidedCaseIntake,
  type GuidedCaseIntakeDraft,
} from "@/lib/guided-case-intake";
import { createClient } from "@/lib/supabase/server";
import type { CustomerCreationValues } from "@/lib/customer-validation";

export async function createInlineIntakeCustomerAction(
  values: CustomerCreationValues,
) {
  return createCustomerForCurrentOrganization(values);
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
      target_priority: draft.priority as "LOW" | "NORMAL" | "HIGH" | "URGENT",
      target_manager_user_id: draft.managerUserId || undefined,
      target_staff_user_ids: draft.staffUserIds,
      target_answers: creationPlan.answers,
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
