import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateCaseRules, type RuleEvaluationResult } from "@/lib/rule-evaluator";

export type CaseRuleEvaluation = RuleEvaluationResult & {
  caseQuestions: Awaited<ReturnType<typeof loadCaseRuleState>>["caseQuestions"];
};

async function loadCaseRuleState(organizationId: string, caseId: string) {
  const admin = createAdminClient();
  const [questions, responses, rules, actions, options] = await Promise.all([
    admin
      .from("case_questions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("case_id", caseId)
      .order("display_order"),
    admin
      .from("case_question_responses")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("case_id", caseId),
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
  const caseQuestions = (questions.data ?? []).map((question) => ({
    ...question,
    response: (responses.data ?? []).find((response) => response.case_question_id === question.id) ?? null,
  }));
  return {
    caseQuestions,
    rules: rules.data ?? [],
    actions: actions.data ?? [],
    options: options.data ?? [],
  };
}

export async function loadCaseRuleEvaluation(organizationId: string, caseId: string): Promise<CaseRuleEvaluation> {
  const state = await loadCaseRuleState(organizationId, caseId);
  return {
    ...evaluateCaseRules({
      organizationId,
      questions: state.caseQuestions.map((question) => ({
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
    caseQuestions: state.caseQuestions,
  };
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
