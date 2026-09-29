export type GuidedCaseFinalizationError = {
  code?: string | null;
  message?: string | null;
};

export type GuidedCaseFinalizationFailure = {
  error: string;
  fieldErrors: Record<string, string>;
  step: number;
};

export function mapGuidedCaseFinalizationError(
  error: GuidedCaseFinalizationError | null,
  phase: "materialize" | "finalize" = "finalize",
): GuidedCaseFinalizationFailure {
  const message = error?.message?.toLowerCase() ?? "";

  if (
    message.includes("customer already has a case for this tax year") ||
    message.includes("customer already has an unrelated case for this tax year") ||
    message.includes("unfinished intake already exists") ||
    (error?.code === "23505" &&
      message.includes("cases_one_customer_per_tax_year"))
  ) {
    return {
      error:
        "A Case already exists for this Customer and Tax Year. Open the existing Case or resume its Guided Intake.",
      fieldErrors: {
        customerId: "Open the existing Case or resume its Guided Intake.",
      },
      step: 1,
    };
  }

  if (
    message.includes("has not been materialized") ||
    message.includes("case linkage is invalid") ||
    message.includes("case identity does not match")
  ) {
    return {
      error: "This Guided Intake is not linked to its authoritative Case.",
      fieldErrors: { caseTypeId: "Re-establish the Case from Case Details." },
      step: 1,
    };
  }

  if (message.includes("customer portal onboarding")) {
    return {
      error: "Customer Portal access must be resolved before finishing this intake.",
      fieldErrors: {
        portalOnboarding: "Customer Portal onboarding is unresolved.",
      },
      step: 3,
    };
  }

  if (
    message.includes("invalid case type") ||
    message.includes("case type is not valid")
  ) {
    return {
      error: "The selected Case Type is no longer available.",
      fieldErrors: { caseTypeId: "Select an active Case Type." },
      step: 1,
    };
  }

  if (
    message.includes("case type requires") ||
    message.includes("valid case tax year") ||
    message.includes("case tax year is immutable")
  ) {
    return {
      error: "The selected Tax Year is no longer valid for this Case Type.",
      fieldErrors: { taxYear: "Select a valid Tax Year." },
      step: 1,
    };
  }

  if (message.includes("invalid customer")) {
    return {
      error: "The selected Customer is no longer available.",
      fieldErrors: { customerId: "Select an active Customer." },
      step: 0,
    };
  }

  if (
    message.includes("invalid manager") ||
    message.includes("invalid staff") ||
    message.includes("assignment permission") ||
    message.includes("duplicate staff assignment") ||
    message.includes("assignment changed") ||
    message.includes("assigned staff member is required")
  ) {
    return {
      error: "An assignment is no longer valid.",
      fieldErrors: { staffUserIds: "Review the Case assignments." },
      step: 1,
    };
  }

  if (
    message.includes("follow-up task") ||
    message.includes("missing requirement")
  ) {
    return {
      error: "A staged follow-up Task is no longer valid.",
      fieldErrors: {},
      step: 3,
    };
  }

  if (
    message.includes("intake response") ||
    message.includes("intake question") ||
    message.includes("required option") ||
    message.includes("tracked")
  ) {
    return {
      error: "A required intake response is incomplete.",
      fieldErrors: {},
      step: 2,
    };
  }

  if (
    error?.code === "42501" ||
    message.includes("not authorized") ||
    message.includes("permission")
  ) {
    return {
      error:
        phase === "materialize"
          ? "You are no longer authorized to establish or assign this Case."
          : "You are no longer authorized to finalize this Case.",
      fieldErrors: {},
      step: phase === "materialize" ? 1 : 5,
    };
  }

  return {
    error:
      phase === "materialize"
        ? "The Case could not be established. Please try again."
        : "The Guided Intake could not be finalized. Please try again.",
    fieldErrors: {},
    step: phase === "materialize" ? 1 : 5,
  };
}
