import type { Json } from "../types/database.generated.ts";
import {
  evaluateCaseRules,
  type EffectiveTaskAction,
  type RuleEvaluationAction,
  type RuleEvaluationDefinition,
} from "./rule-evaluator.ts";

export const guidedCaseIntakeSteps = [
  "Customer",
  "Case Details",
  "Intake Questions",
  "Requirements",
  "Review",
  "Create Case",
] as const;

export const guidedCasePriorities = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
] as const;

export type GuidedCasePriority = (typeof guidedCasePriorities)[number];

export const guidedQuestionGroups = [
  "CUSTOMER_PROFILE",
  "VERIFICATION_ELIGIBILITY",
  "REQUIRED_DOCUMENTS",
  "MISSING_INFORMATION_FOLLOW_UP",
  "READY_FOR_HANDOFF",
] as const;

export type GuidedQuestionGroup = (typeof guidedQuestionGroups)[number];

export const guidedQuestionGroupLabels: Record<GuidedQuestionGroup, string> = {
  CUSTOMER_PROFILE: "Customer Profile",
  VERIFICATION_ELIGIBILITY: "Verification & Eligibility",
  REQUIRED_DOCUMENTS: "Required Documents",
  MISSING_INFORMATION_FOLLOW_UP: "Missing Information / Follow-up",
  READY_FOR_HANDOFF: "Ready for Handoff",
};
export type GuidedQuestionResponseType =
  | "YES_NO"
  | "NUMBER"
  | "DATE"
  | "TEXT"
  | "LONG_TEXT"
  | "SINGLE_SELECT"
  | "MULTI_SELECT";

export type GuidedIntakeCustomer = {
  id: string;
  customerNumber: string;
  name: string;
};

export type GuidedIntakeOption = {
  id: string;
  questionId: string;
  label: string;
  value: string;
  displayOrder: number;
};

export type GuidedIntakeQuestion = {
  id: string;
  text: string;
  description: string;
  responseType: GuidedQuestionResponseType;
  required: boolean;
  requireAllOptions: boolean;
  group: GuidedQuestionGroup | null;
  displayOrder: number;
  options: GuidedIntakeOption[];
};

export type GuidedIntakeRule = RuleEvaluationDefinition;
export type GuidedIntakeRuleAction = RuleEvaluationAction;

export type GuidedIntakeConfiguration = {
  organizationId: string;
  customers: GuidedIntakeCustomer[];
  caseTitles: Array<{ id: string; label: string }>;
  caseTypes: Array<{ id: string; name: string }>;
  managers: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string }>;
  questions: GuidedIntakeQuestion[];
  rules: GuidedIntakeRule[];
  actions: GuidedIntakeRuleAction[];
  defaultPriority: GuidedCasePriority;
  canViewCustomers: boolean;
  canCreateCustomer: boolean;
  canAssign: boolean;
};

export type GuidedIntakeAnswers = Record<string, Json | undefined>;

export type GuidedCaseIntakeDraft = {
  submissionKey: string;
  customerId: string;
  caseTitleId: string;
  description: string;
  caseTypeId: string;
  priority: GuidedCasePriority | string;
  managerUserId: string;
  staffUserIds: string[];
  answers: GuidedIntakeAnswers;
};

export type GuidedIntakeFieldErrors = Record<string, string>;

export type GuidedIntakeEvaluation = {
  questions: Array<
    GuidedIntakeQuestion & {
      applicable: boolean;
      effectiveRequired: boolean;
      answered: boolean;
      valid: boolean;
    }
  >;
  generatedTasks: EffectiveTaskAction[];
  matchedRuleIds: string[];
};

export type GuidedIntakeCreationPlan = {
  questions: Array<{
    sourceQuestionId: string;
    text: string;
    description: string;
    responseType: GuidedQuestionResponseType;
    required: boolean;
    displayOrder: number;
    options: Array<{
      id: string;
      label: string;
      value: string;
      displayOrder: number;
    }>;
    response: Json | undefined;
  }>;
  answers: Record<string, Json>;
  generatedTaskActionIds: string[];
};

const meaningfulText = (value: Json | undefined) =>
  typeof value === "string" && value.trim().length > 0;

export function isGuidedQuestionAnswerValid(
  question: GuidedIntakeQuestion,
  value: Json | undefined,
): boolean {
  if (value === undefined || value === null) return false;
  if (question.responseType === "YES_NO") return typeof value === "boolean";
  if (question.responseType === "NUMBER")
    return typeof value === "number" && Number.isFinite(value);
  if (question.responseType === "DATE")
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    );
  if (
    question.responseType === "TEXT" ||
    question.responseType === "LONG_TEXT"
  )
    return meaningfulText(value);
  const optionIds = new Set(question.options.map((option) => option.id));
  if (question.responseType === "SINGLE_SELECT")
    return typeof value === "string" && optionIds.has(value);
  if (question.responseType !== "MULTI_SELECT") return false;
  if (!Array.isArray(value) || value.length === 0) return false;

  const selected = value.filter(
    (item): item is string => typeof item === "string",
  );

  if (
    selected.length !== value.length ||
    selected.some((item) => !optionIds.has(item))
  ) {
    return false;
  }

  if (!question.requireAllOptions) return true;

  const selectedIds = new Set(selected);
  return question.options.every((option) => selectedIds.has(option.id));
}

export function evaluateGuidedCaseIntake(
  configuration: Pick<
    GuidedIntakeConfiguration,
    "organizationId" | "questions" | "rules" | "actions"
  >,
  answers: GuidedIntakeAnswers,
): GuidedIntakeEvaluation {
  const result = evaluateCaseRules({
    organizationId: configuration.organizationId,
    questions: configuration.questions.map((question) => ({
      id: question.id,
      organization_id: configuration.organizationId,
      question_definition_id: question.id,
      response_type: question.responseType,
      required: question.required,
      response_value: answers[question.id],
    })),
    options: configuration.questions.flatMap((question) =>
      question.options.map((option) => ({
        id: option.id,
        organization_id: configuration.organizationId,
        question_id: question.id,
        option_value: option.value,
      })),
    ),
    rules: configuration.rules,
    actions: configuration.actions,
  });
  const byQuestion = new Map(
    result.questions.map((question) => [question.questionId, question]),
  );
  return {
    questions: configuration.questions.map((question) => {
      const evaluated = byQuestion.get(question.id);
      const applicable = evaluated?.applicable ?? true;
      const effectiveRequired = evaluated?.required ?? question.required;
      return {
        ...question,
        applicable,
        effectiveRequired,
        answered: answers[question.id] !== undefined,
        valid: isGuidedQuestionAnswerValid(question, answers[question.id]),
      };
    }),
    generatedTasks: result.effectiveTaskActions,
    matchedRuleIds: result.matchedRules.map((rule) => rule.id),
  };
}

export function validateGuidedCustomerStep(
  draft: Pick<GuidedCaseIntakeDraft, "customerId">,
  configuration: Pick<GuidedIntakeConfiguration, "customers">,
): GuidedIntakeFieldErrors {
  if (!draft.customerId)
    return { customerId: "Select or create a Customer before continuing." };
  if (!configuration.customers.some((customer) => customer.id === draft.customerId))
    return { customerId: "Select an active Customer from this organization." };
  return {};
}

export function validateGuidedCaseDetails(
  draft: Pick<
    GuidedCaseIntakeDraft,
    | "caseTitleId"
    | "caseTypeId"
    | "priority"
    | "managerUserId"
    | "staffUserIds"
  >,
  configuration: Pick<
    GuidedIntakeConfiguration,
    "caseTitles" | "caseTypes" | "managers" | "staff" | "canAssign"
  >,
): GuidedIntakeFieldErrors {
  const errors: GuidedIntakeFieldErrors = {};
  if (!configuration.caseTitles.some((item) => item.id === draft.caseTitleId))
    errors.caseTitleId = "Select an active configured Case Title.";
  if (!configuration.caseTypes.some((item) => item.id === draft.caseTypeId))
    errors.caseTypeId = "Select an active Case Type.";
  if (!guidedCasePriorities.some((priority) => priority === draft.priority))
    errors.priority = "Select a valid priority.";
  if (!configuration.canAssign && (draft.managerUserId || draft.staffUserIds.length))
    errors.assignments = "You do not have permission to assign this Case.";
  if (
    draft.managerUserId &&
    !configuration.managers.some((manager) => manager.id === draft.managerUserId)
  )
    errors.managerUserId = "Select an active eligible Case Manager.";
  const staffIds = new Set(configuration.staff.map((member) => member.id));
  if (draft.staffUserIds.length === 0)
    errors.staffUserIds = configuration.canAssign
      ? "Assign at least one Staff member before continuing."
      : "An Assigned Staff member is required, but you do not have assignment permission.";
  else if (draft.staffUserIds.some((id) => !staffIds.has(id)))
    errors.staffUserIds = "Assigned Staff must be active eligible members.";
  if (new Set(draft.staffUserIds).size !== draft.staffUserIds.length)
    errors.staffUserIds = "Assigned Staff cannot contain duplicates.";
  return errors;
}

export function validateGuidedIntakeQuestions(
  evaluation: GuidedIntakeEvaluation,
): GuidedIntakeFieldErrors {
  const errors: GuidedIntakeFieldErrors = {};
  for (const question of evaluation.questions) {
    if (!question.applicable) continue;
    if (question.answered && !question.valid)
      errors[`question.${question.id}`] = "Enter a valid response.";
    else if (question.effectiveRequired && !question.valid)
      errors[`question.${question.id}`] = "This question is required.";
  }
  return errors;
}

export function validateGuidedCaseIntake(
  draft: GuidedCaseIntakeDraft,
  configuration: GuidedIntakeConfiguration,
) {
  const evaluation = evaluateGuidedCaseIntake(configuration, draft.answers);
  const fieldErrors = {
    ...validateGuidedCustomerStep(draft, configuration),
    ...validateGuidedCaseDetails(draft, configuration),
    ...validateGuidedIntakeQuestions(evaluation),
  };
  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors, evaluation };
}

export function buildGuidedIntakeCreationPlan(
  configuration: Pick<
    GuidedIntakeConfiguration,
    "organizationId" | "questions" | "rules" | "actions"
  >,
  answers: GuidedIntakeAnswers,
): GuidedIntakeCreationPlan {
  const evaluation = evaluateGuidedCaseIntake(configuration, answers);
  const questions = evaluation.questions
    .filter((question) => question.applicable)
    .map((question) => ({
      sourceQuestionId: question.id,
      text: question.text,
      description: question.description,
      responseType: question.responseType,
      required: question.effectiveRequired,
      displayOrder: question.displayOrder,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        value: option.value,
        displayOrder: option.displayOrder,
      })),
      response: answers[question.id],
    }));
  return {
    questions,
    answers: Object.fromEntries(
      questions.flatMap((question) =>
        question.response === undefined
          ? []
          : [[question.sourceQuestionId, question.response] as [string, Json]],
      ),
    ),
    generatedTaskActionIds: evaluation.generatedTasks.map(
      (task) => task.actionId,
    ),
  };
}
