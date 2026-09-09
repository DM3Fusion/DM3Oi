import type { Database, Json } from "@/types/database.generated";

type ResponseType = Database["public"]["Enums"]["question_response_type"];
type ConditionOperator = Database["public"]["Enums"]["rule_condition_operator"];
type ActionType = Database["public"]["Enums"]["rule_action_type"];
type Priority = Database["public"]["Enums"]["priority_level"];

export type RuleEvaluationQuestion = {
  id: string;
  organization_id: string;
  question_definition_id: string | null;
  response_type: ResponseType;
  required: boolean;
  response_value?: Json;
};

export type RuleEvaluationOption = {
  id: string;
  organization_id: string;
  question_id: string;
  option_value: string;
};

export type RuleEvaluationDefinition = {
  id: string;
  organization_id: string;
  name: string;
  source_question_id: string;
  condition_operator: ConditionOperator;
  condition_option_id: string | null;
  active: boolean;
};

export type RuleEvaluationAction = {
  id: string;
  organization_id: string;
  rule_definition_id: string;
  action_type: ActionType;
  target_question_id: string | null;
  task_title: string | null;
  task_description: string | null;
  task_priority: Priority | null;
  task_required: boolean | null;
  task_blocking: boolean | null;
};

export type EvaluatedQuestion = {
  caseQuestionId: string;
  questionId: string | null;
  applicable: boolean;
  required: boolean;
  baselineRequired: boolean;
  showRuleIds: string[];
  requireRuleIds: string[];
};

export type EffectiveTaskAction = {
  actionId: string;
  ruleId: string;
  ruleName: string;
  title: string;
  description: string;
  priority: Priority;
  required: boolean;
  blocking: boolean;
};

export type RuleEvaluationResult = {
  questions: EvaluatedQuestion[];
  matchedRules: { id: string; name: string }[];
  effectiveTaskActions: EffectiveTaskAction[];
};

export function isMeaningfulRuleAnswer(type: ResponseType, value: Json | undefined) {
  if (value === undefined || value === null) return false;
  if (type === "YES_NO") return typeof value === "boolean";
  if (type === "NUMBER") return typeof value === "number" && Number.isFinite(value);
  if (type === "MULTI_SELECT") return Array.isArray(value) && value.some((item) => typeof item === "string" && item.length > 0);
  return typeof value === "string" && value.trim().length > 0;
}

function selectedOptionIds(question: RuleEvaluationQuestion, options: RuleEvaluationOption[]) {
  if (!question.question_definition_id) return [];
  const available = options.filter((option) => option.question_id === question.question_definition_id);
  const raw = question.response_value;
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return values.flatMap((value) => {
    const option = available.find((candidate) => candidate.id === value || candidate.option_value === value);
    return option ? [option.id] : [];
  });
}

function conditionMatches(rule: RuleEvaluationDefinition, question: RuleEvaluationQuestion, options: RuleEvaluationOption[]) {
  const answered = isMeaningfulRuleAnswer(question.response_type, question.response_value);
  if (rule.condition_operator === "IS_ANSWERED") return answered;
  if (rule.condition_operator === "IS_NOT_ANSWERED") return !answered;
  if (!answered) return false;
  if (rule.condition_operator === "IS_YES") return question.response_value === true;
  if (rule.condition_operator === "IS_NO") return question.response_value === false;
  const selected = selectedOptionIds(question, options);
  if (!rule.condition_option_id) return false;
  if (rule.condition_operator === "EQUALS") return selected[0] === rule.condition_option_id;
  if (rule.condition_operator === "NOT_EQUALS") return selected.length > 0 && selected[0] !== rule.condition_option_id;
  if (rule.condition_operator === "CONTAINS") return selected.includes(rule.condition_option_id);
  // Unanswered MULTI_SELECT responses return above, so absence is never treated
  // as the negative business assertion represented by NOT_CONTAINS.
  return rule.condition_operator === "NOT_CONTAINS" && selected.length > 0 && !selected.includes(rule.condition_option_id);
}

export function evaluateCaseRules({
  organizationId,
  questions,
  options,
  rules,
  actions,
}: {
  organizationId: string;
  questions: RuleEvaluationQuestion[];
  options: RuleEvaluationOption[];
  rules: RuleEvaluationDefinition[];
  actions: RuleEvaluationAction[];
}): RuleEvaluationResult {
  const scopedQuestions = questions.filter((question) => question.organization_id === organizationId);
  const scopedOptions = options.filter((option) => option.organization_id === organizationId);
  const byDefinition = new Map(scopedQuestions.flatMap((question) => question.question_definition_id ? [[question.question_definition_id, question] as const] : []));
  const activeRules = rules.filter((rule) => rule.organization_id === organizationId && rule.active && byDefinition.has(rule.source_question_id));
  const activeRuleIds = new Set(activeRules.map((rule) => rule.id));
  const scopedActions = actions.filter((action) => action.organization_id === organizationId && activeRuleIds.has(action.rule_definition_id));
  const conditionalTargets = new Set(scopedActions.flatMap((action) => action.action_type !== "CREATE_TASK" && action.target_question_id ? [action.target_question_id] : []));
  const applicableQuestionIds = new Set(scopedQuestions.flatMap((question) =>
    question.question_definition_id && (question.required || !conditionalTargets.has(question.question_definition_id))
      ? [question.question_definition_id]
      : [],
  ));
  for (let pass = 0; pass <= activeRules.length; pass += 1) {
    let changed = false;
    const passMatchedRuleIds = new Set(activeRules
      .filter((rule) => applicableQuestionIds.has(rule.source_question_id) && conditionMatches(rule, byDefinition.get(rule.source_question_id)!, scopedOptions))
      .map((rule) => rule.id));
    for (const action of scopedActions) {
      if (action.action_type === "CREATE_TASK" || !action.target_question_id || !passMatchedRuleIds.has(action.rule_definition_id)) continue;
      if (!applicableQuestionIds.has(action.target_question_id)) {
        applicableQuestionIds.add(action.target_question_id);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const matchedRules = activeRules.filter((rule) => applicableQuestionIds.has(rule.source_question_id) && conditionMatches(rule, byDefinition.get(rule.source_question_id)!, scopedOptions));
  const matchedRuleIds = new Set(matchedRules.map((rule) => rule.id));
  const matchedActions = scopedActions.filter((action) => matchedRuleIds.has(action.rule_definition_id));

  const questionResults = scopedQuestions.map((question): EvaluatedQuestion => {
    const questionId = question.question_definition_id;
    const questionActions = questionId ? matchedActions.filter((action) => action.target_question_id === questionId) : [];
    const showRuleIds = [...new Set(questionActions.filter((action) => action.action_type === "SHOW_QUESTION").map((action) => action.rule_definition_id))];
    const requireRuleIds = [...new Set(questionActions.filter((action) => action.action_type === "REQUIRE_QUESTION").map((action) => action.rule_definition_id))];
    const baselineApplicable = !questionId || question.required || !conditionalTargets.has(questionId);
    return {
      caseQuestionId: question.id,
      questionId,
      applicable: baselineApplicable || showRuleIds.length > 0 || requireRuleIds.length > 0,
      required: question.required || requireRuleIds.length > 0,
      baselineRequired: question.required,
      showRuleIds,
      requireRuleIds,
    };
  });

  const ruleNames = new Map(matchedRules.map((rule) => [rule.id, rule.name]));
  const effectiveTaskActions = matchedActions.flatMap((action): EffectiveTaskAction[] =>
    action.action_type === "CREATE_TASK" && action.task_title && action.task_priority
      ? [{
          actionId: action.id,
          ruleId: action.rule_definition_id,
          ruleName: ruleNames.get(action.rule_definition_id) ?? "Rule",
          title: action.task_title,
          description: action.task_description ?? "",
          priority: action.task_priority,
          required: action.task_required ?? false,
          blocking: action.task_blocking ?? false,
        }]
      : [],
  );

  return {
    questions: questionResults,
    matchedRules: matchedRules.map((rule) => ({ id: rule.id, name: rule.name })),
    effectiveTaskActions,
  };
}
