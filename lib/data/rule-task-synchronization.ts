import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateCaseRules, type RuleEvaluationResult } from "@/lib/rule-evaluator";

export type CaseRuleEvaluation = RuleEvaluationResult & {
  caseQuestions: Array<
    Awaited<ReturnType<typeof loadOrganizationRuleState>>["questions"][number] & {
      response:
        | Awaited<ReturnType<typeof loadOrganizationRuleState>>["responses"][number]
        | null;
    }
  >;
};

async function loadOrganizationRuleState(organizationId: string, caseIds: string[]) {
  if (!caseIds.length) {
    return { questions: [], responses: [], rules: [], actions: [], options: [] };
  }
  const admin = createAdminClient();
  const [questions, responses, rules, actions, options] = await Promise.all([
    admin
      .from("case_questions")
      .select("*")
      .eq("organization_id", organizationId)
      .in("case_id", caseIds)
      .order("display_order"),
    admin
      .from("case_question_responses")
      .select("*")
      .eq("organization_id", organizationId)
      .in("case_id", caseIds),
    admin
      .from("rule_definitions")
      .select("id,organization_id,name,source_question_id,condition_operator,condition_option_id,active")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("display_order"),
    admin
      .from("rule_actions")
      .select("id,organization_id,rule_definition_id,action_type,target_question_id,task_title,task_description,task_priority,task_required,task_blocking")
      .eq("organization_id", organizationId)
      .is("retired_at", null)
      .order("display_order"),
    admin
      .from("question_options")
      .select("id,organization_id,question_id,option_value")
      .eq("organization_id", organizationId),
  ]);
  const error = questions.error ?? responses.error ?? rules.error ?? actions.error ?? options.error;
  if (error) throw new Error("Case Rule evaluation is temporarily unavailable.");
  return {
    questions: questions.data ?? [],
    responses: responses.data ?? [],
    rules: rules.data ?? [],
    actions: actions.data ?? [],
    options: options.data ?? [],
  };
}

function evaluateCaseState(
  organizationId: string,
  caseQuestions: CaseRuleEvaluation["caseQuestions"],
  state: Awaited<ReturnType<typeof loadOrganizationRuleState>>,
): CaseRuleEvaluation {
  return {
    ...evaluateCaseRules({
      organizationId,
      questions: caseQuestions.map((question) => ({
        id: question.id,
        organization_id: question.organization_id,
        question_definition_id: question.question_definition_id,
        response_type: question.response_type,
        required: question.required,
        response_value: question.response?.response_value,
      })),
      options: state.options,
      rules: state.rules,
      actions: state.actions,
    }),
    caseQuestions,
  };
}

export async function loadOrganizationCaseRuleEvaluations(
  organizationId: string,
  caseIds: string[],
) {
  const state = await loadOrganizationRuleState(organizationId, caseIds);
  const responseByQuestion = new Map(
    state.responses.map((response) => [response.case_question_id, response]),
  );
  const questionsByCase = new Map<string, CaseRuleEvaluation["caseQuestions"]>();
  for (const question of state.questions) {
    const questions = questionsByCase.get(question.case_id) ?? [];
    questions.push({
      ...question,
      response: responseByQuestion.get(question.id) ?? null,
    });
    questionsByCase.set(question.case_id, questions);
  }
  return new Map(
    caseIds.map((caseId) => [
      caseId,
      evaluateCaseState(
        organizationId,
        questionsByCase.get(caseId) ?? [],
        state,
      ),
    ]),
  );
}

export async function loadCaseRuleEvaluation(
  organizationId: string,
  caseId: string,
): Promise<CaseRuleEvaluation> {
  const evaluations = await loadOrganizationCaseRuleEvaluations(organizationId, [caseId]);
  return evaluations.get(caseId)!;
}

export async function synchronizeCaseRuleTasks({
  organizationId,
  caseId,
  actorUserId,
}: {
  organizationId: string;
  caseId: string;
  actorUserId: string;
}) {
  const evaluation = await loadCaseRuleEvaluation(organizationId, caseId);
  const admin = createAdminClient();
  const { error } = await admin.rpc("synchronize_case_rule_tasks", {
    target_organization_id: organizationId,
    target_case_id: caseId,
    target_effective_action_ids: evaluation.effectiveTaskActions.map((action) => action.actionId),
    target_actor_user_id: actorUserId,
  });
  if (error) throw new Error("Rule-generated Tasks could not be synchronized.");
}

export async function synchronizeOrganizationRuleTasks(organizationId: string, actorUserId: string) {
  const admin = createAdminClient();
  const cases = await admin.from("cases").select("id").eq("organization_id", organizationId).order("id");
  if (cases.error) throw new Error("Organization Rule-generated Tasks could not be synchronized.");
  for (const item of cases.data ?? []) {
    await synchronizeCaseRuleTasks({ organizationId, caseId: item.id, actorUserId });
  }
}
