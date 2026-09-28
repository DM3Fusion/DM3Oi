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
): GuidedCaseFinalizationFailure {
  const message = error?.message?.toLowerCase() ?? "";

  if (
    message.includes("customer already has a case for this tax year") ||
    (error?.code === "23505" &&
      message.includes("cases_one_customer_per_tax_year"))
  ) {
    return {
      error: "A Case already exists for this Customer and Tax Year.",
      fieldErrors: {
        customerId: "Select another Customer or choose a different Tax Year.",
      },
      step: 0,
    };
  }

  if (message.includes("customer portal onboarding")) {
    return {
      error: "Customer Portal access must be resolved before creating this Case.",
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
      error: "You are no longer authorized to create or assign this Case.",
      fieldErrors: {},
      step: 5,
    };
  }

  return {
    error: "The Case could not be created. Please try again.",
    fieldErrors: {},
    step: 5,
  };
}
