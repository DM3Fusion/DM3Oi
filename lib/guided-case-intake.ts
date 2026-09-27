import type { Json } from "../types/database.generated.ts";
import {
  evaluateCaseRules,
  type EffectiveTaskAction,
  type RuleEvaluationAction,
  type RuleEvaluationDefinition,
} from "./rule-evaluator.ts";
import type {
  GuidedIntakePortalResolution,
  PortalOnboardingMode,
} from "./customer-portal-onboarding.ts";

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
  email?: string | null;
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
  trackRequiredOptions: boolean;
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
  caseTitleTypeMappings?: Array<{
    caseTitleId: string;
    caseTypeId: string;
  }>;
  managers: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string }>;
  questions: GuidedIntakeQuestion[];
  rules: GuidedIntakeRule[];
  actions: GuidedIntakeRuleAction[];
  defaultPriority: GuidedCasePriority;
  portalOnboardingMode?: PortalOnboardingMode;
  canViewCustomers: boolean;
  canCreateCustomer: boolean;
  canAssign: boolean;
};

export type GuidedIntakeAnswers = Record<string, Json | undefined>;
export type GuidedIntakeRequiredOptionIds = Record<string, string[]>;

export type GuidedIntakeFollowUpTask = {
  id: string;
  questionId: string;
  title: string;
  description: string;
  missingOptionIds: string[];
  missingOptionLabels: string[];
  assignedUserId: string;
  dueDate: string;
  completed: boolean;
};

export type GuidedCaseIntakeDraft = {
  submissionKey: string;
  customerId: string;
  taxYear: number | null;
  caseTitleId: string;
  description: string;
  caseTypeId: string;
  priority: GuidedCasePriority | string;
  managerUserId: string;
  staffUserIds: string[];
  answers: GuidedIntakeAnswers;
  requiredOptionIds: GuidedIntakeRequiredOptionIds;
  followUpTasks: GuidedIntakeFollowUpTask[];
  portalOnboarding: GuidedIntakePortalResolution;
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
  requiredOptionIds: string[] = [],
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

  if (question.trackRequiredOptions) {
    if (
      requiredOptionIds.length === 0 ||
      new Set(requiredOptionIds).size !== requiredOptionIds.length ||
      requiredOptionIds.some((item) => !optionIds.has(item))
    ) {
      return false;
    }

    const selectedIds = new Set(selected);
    return (
      selectedIds.size === selected.length &&
      selected.every((item) => requiredOptionIds.includes(item)) &&
      requiredOptionIds.every((item) => selectedIds.has(item))
    );
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
  requiredOptionIds: GuidedIntakeRequiredOptionIds = {},
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
        valid: isGuidedQuestionAnswerValid(
          question,
          answers[question.id],
          requiredOptionIds[question.id],
        ),
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

export function isCaseTitleTypeCompatible(
  configuration: Pick<
    GuidedIntakeConfiguration,
    "caseTitleTypeMappings"
  >,
  caseTitleId: string,
  caseTypeId: string,
): boolean {
  if (!caseTitleId || !caseTypeId) return false;
  if (configuration.caseTitleTypeMappings === undefined) return true;
  return configuration.caseTitleTypeMappings.some(
    (mapping) =>
      mapping.caseTitleId === caseTitleId &&
      mapping.caseTypeId === caseTypeId,
  );
}

export function validateGuidedCaseDetails(
  draft: Pick<
    GuidedCaseIntakeDraft,
    | "caseTitleId"
    | "taxYear"
    | "caseTypeId"
    | "priority"
    | "managerUserId"
    | "staffUserIds"
  >,
  configuration: Pick<
    GuidedIntakeConfiguration,
    | "caseTitles"
    | "caseTypes"
    | "caseTitleTypeMappings"
    | "managers"
    | "staff"
    | "canAssign"
  >,
): GuidedIntakeFieldErrors {
  const errors: GuidedIntakeFieldErrors = {};
  if (
    !Number.isInteger(draft.taxYear) ||
    (draft.taxYear ?? 0) < 1900 ||
    (draft.taxYear ?? 0) > 2200
  )
    errors.taxYear = "Enter a valid tax year from 1900 through 2200.";
  if (!configuration.caseTitles.some((item) => item.id === draft.caseTitleId))
    errors.caseTitleId = "Select an active configured Case Title.";
  if (!configuration.caseTypes.some((item) => item.id === draft.caseTypeId))
    errors.caseTypeId = "Select an active Case Type.";
  if (
    !errors.caseTitleId &&
    !errors.caseTypeId &&
    !isCaseTitleTypeCompatible(
      configuration,
      draft.caseTitleId,
      draft.caseTypeId,
    )
  )
    errors.caseTitleId =
      "Select a Case Title compatible with the selected Case Type.";
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

export function getMissingRequiredOptions(
  evaluation: GuidedIntakeEvaluation,
  answers: GuidedIntakeAnswers,
  requiredOptionIds: GuidedIntakeRequiredOptionIds = {},
) {
  return evaluation.questions.flatMap((question) => {
    if (
      !question.applicable ||
      !question.effectiveRequired ||
      question.responseType !== "MULTI_SELECT" ||
      (!question.requireAllOptions && !question.trackRequiredOptions)
    )
      return [];
    const answer = answers[question.id];
    const selected = new Set(
      Array.isArray(answer)
        ? answer.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    );
    const requiredIds = question.trackRequiredOptions
      ? new Set(requiredOptionIds[question.id] ?? [])
      : new Set(question.options.map((option) => option.id));
    const missingOptions = question.options.filter(
      (option) =>
        requiredIds.has(option.id) &&
        !selected.has(option.id),
    );
    if (!missingOptions.length) return [];
    return [{ question, missingOptions }];
  });
}

export function reconcileGuidedIntakeFollowUpTasks(
  tasks: GuidedIntakeFollowUpTask[],
  evaluation: GuidedIntakeEvaluation,
  answers: GuidedIntakeAnswers,
  requiredOptionIds: GuidedIntakeRequiredOptionIds,
) {
  const missingByQuestion = new Map(
    getMissingRequiredOptions(evaluation, answers, requiredOptionIds).map(
      ({ question, missingOptions }) => [question.id, missingOptions],
    ),
  );
  return tasks.flatMap((task) => {
    const question = evaluation.questions.find(
      (item) => item.id === task.questionId,
    );
    if (!question?.applicable || !question.effectiveRequired) return [];
    const missingOptions = missingByQuestion.get(task.questionId) ?? [];
    return [{
      ...task,
      missingOptionIds: missingOptions.map((option) => option.id),
      missingOptionLabels: missingOptions.map((option) => option.label),
      description: missingOptions.length
        ? `Outstanding requirements: ${missingOptions.map((option) => option.label).join(", ")}`
        : "All required documents have been received.",
      completed:
        missingOptions.length || !question?.valid ? false : task.completed,
    }];
  });
}

export function getTrackedRequiredOptionError(
  question: GuidedIntakeQuestion,
  requiredOptionIds: string[] | undefined,
) {
  if (!question.trackRequiredOptions) return null;
  const optionIds = new Set(question.options.map((option) => option.id));
  if (!Array.isArray(requiredOptionIds) || requiredOptionIds.length === 0)
    return "Mark at least one displayed item as Required.";
  if (
    new Set(requiredOptionIds).size !== requiredOptionIds.length ||
    requiredOptionIds.some((id) => !optionIds.has(id))
  )
    return "The required item selection is invalid.";
  return null;
}

export function trackedReceivedOptionsAreValid(
  question: GuidedIntakeQuestion,
  answers: GuidedIntakeAnswers,
  requiredOptionIds: GuidedIntakeRequiredOptionIds,
) {
  if (!question.trackRequiredOptions) return true;
  const answer = answers[question.id];
  if (answer === undefined) return true;
  if (!Array.isArray(answer)) return false;
  const received = answer.filter(
    (option): option is string => typeof option === "string",
  );
  const required = new Set(requiredOptionIds[question.id] ?? []);
  return (
    received.length === answer.length &&
    new Set(received).size === received.length &&
    received.every((option) => required.has(option))
  );
}

export function validateGuidedRequiredOptionMap(
  questions: GuidedIntakeQuestion[],
  answers: GuidedIntakeAnswers,
  requiredOptionIds: GuidedIntakeRequiredOptionIds,
): GuidedIntakeFieldErrors {
  const errors: GuidedIntakeFieldErrors = {};
  for (const [questionId, ids] of Object.entries(requiredOptionIds)) {
    const question = questions.find((item) => item.id === questionId);
    if (
      !question ||
      !question.trackRequiredOptions ||
      question.responseType !== "MULTI_SELECT"
    ) {
      errors[`question.${questionId}`] =
        "The required item selection is invalid.";
      continue;
    }
    const optionIds = new Set(question.options.map((option) => option.id));
    if (
      !Array.isArray(ids) ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !optionIds.has(id)) ||
      !trackedReceivedOptionsAreValid(question, answers, requiredOptionIds)
    )
      errors[`question.${questionId}`] =
        "Required and received items must use active options from this question.";
  }
  for (const question of questions) {
    if (
      question.trackRequiredOptions &&
      answers[question.id] !== undefined &&
      !trackedReceivedOptionsAreValid(question, answers, requiredOptionIds) &&
      !errors[`question.${question.id}`]
    )
      errors[`question.${question.id}`] =
        "Received items must also be marked Required.";
  }
  return errors;
}

export function guidedFollowUpTaskMatchesMissingOptions(
  task: GuidedIntakeFollowUpTask,
  evaluation: GuidedIntakeEvaluation,
  answers: GuidedIntakeAnswers,
  requiredOptionIds: GuidedIntakeRequiredOptionIds,
) {
  const question = evaluation.questions.find(
    (item) => item.id === task.questionId,
  );
  if (
    !question ||
    !question.applicable ||
    !question.effectiveRequired ||
    question.responseType !== "MULTI_SELECT" ||
    (!question.requireAllOptions && !question.trackRequiredOptions) ||
    task.title !== "Obtain missing required documents"
  )
    return false;
  const missing = getMissingRequiredOptions(
    evaluation,
    answers,
    requiredOptionIds,
  ).find((item) => item.question.id === task.questionId)?.missingOptions ?? [];
  return (
    task.missingOptionIds.length === missing.length &&
    task.missingOptionLabels.length === missing.length &&
    missing.every(
      (option, index) =>
        task.missingOptionIds[index] === option.id &&
        task.missingOptionLabels[index] === option.label,
    )
  );
}

export function canCompleteIntakeFollowUpTask(
  task: GuidedIntakeFollowUpTask,
  evaluation: GuidedIntakeEvaluation,
) {
  return Boolean(
    evaluation.questions.find(
      (question) => question.id === task.questionId && question.valid,
    ),
  );
}

export function validateGuidedIntakeQuestions(
  evaluation: GuidedIntakeEvaluation,
  requiredOptionIds: GuidedIntakeRequiredOptionIds = {},
): GuidedIntakeFieldErrors {
  const errors: GuidedIntakeFieldErrors = {};
  for (const question of evaluation.questions) {
    if (!question.applicable) continue;
    const trackedError = question.effectiveRequired
      ? getTrackedRequiredOptionError(
          question,
          requiredOptionIds[question.id],
        )
      : null;
    if (trackedError) {
      errors[`question.${question.id}`] = trackedError;
      continue;
    }
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
  const evaluation = evaluateGuidedCaseIntake(
    configuration,
    draft.answers,
    draft.requiredOptionIds,
  );
  const fieldErrors: GuidedIntakeFieldErrors = {
    ...validateGuidedCustomerStep(draft, configuration),
    ...validateGuidedCaseDetails(draft, configuration),
    ...validateGuidedIntakeQuestions(evaluation, draft.requiredOptionIds),
    ...validateGuidedRequiredOptionMap(
      configuration.questions,
      draft.answers,
      draft.requiredOptionIds,
    ),
  };
  const staffIds = new Set(configuration.staff.map((member) => member.id));
  const followUpQuestionIds = new Set<string>();
  for (const task of draft.followUpTasks) {
    if (followUpQuestionIds.has(task.questionId))
      fieldErrors[`followUp.${task.id}`] =
        "Only one follow-up Task may be staged for each Question.";
    else if (
      !guidedFollowUpTaskMatchesMissingOptions(
        task,
        evaluation,
        draft.answers,
        draft.requiredOptionIds,
      )
    )
      fieldErrors[`followUp.${task.id}`] =
        "The follow-up Task does not match the current missing items.";
    else if (!staffIds.has(task.assignedUserId))
      fieldErrors[`followUp.${task.id}`] = "Select an active Staff assignee.";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate))
      fieldErrors[`followUp.${task.id}`] = "Select a valid due date.";
    else if (task.completed && !canCompleteIntakeFollowUpTask(task, evaluation))
      fieldErrors[`followUp.${task.id}`] =
        "Required documents must be received before completing this Task.";
    followUpQuestionIds.add(task.questionId);
  }
  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors, evaluation };
}

export function buildGuidedIntakeCreationPlan(
  configuration: Pick<
    GuidedIntakeConfiguration,
    "organizationId" | "questions" | "rules" | "actions"
  >,
  answers: GuidedIntakeAnswers,
  requiredOptionIds: GuidedIntakeRequiredOptionIds = {},
): GuidedIntakeCreationPlan {
  const evaluation = evaluateGuidedCaseIntake(
    configuration,
    answers,
    requiredOptionIds,
  );
  const questions = evaluation.questions
    .filter((question) => question.applicable)
    .map((question) => ({
      sourceQuestionId: question.id,
      text: question.text,
      description: question.description,
      responseType: question.responseType,
      required: question.effectiveRequired,
      displayOrder: question.displayOrder,
      options: question.options
        .filter(
          (option) =>
            !question.trackRequiredOptions ||
            (requiredOptionIds[question.id] ?? []).includes(option.id),
        )
        .map((option) => ({
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
