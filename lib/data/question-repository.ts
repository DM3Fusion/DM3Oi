import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateCaseRules } from "@/lib/rule-evaluator";
import type { Database } from "@/types/database.generated";
type Tables = Database["public"]["Tables"];
export type QuestionDefinition = Tables["question_definitions"]["Row"] & {
  options: Tables["question_options"]["Row"][];
};
export type CaseQuestion = Tables["case_questions"]["Row"] & {
  response: Tables["case_question_responses"]["Row"] | null;
};
export type EvaluatedCaseQuestion = CaseQuestion & {
  applicable: boolean;
  effectiveRequired: boolean;
  baselineRequired: boolean;
};
export async function getQuestionDefinitions() {
  const access = await getAccessContext();
  if (!access?.activeOrganization) redirect("/");
  const supabase = await createClient();
  const [questions, options] = await Promise.all([
    supabase
      .from("organization_question_definitions")
      .select("*")
      .eq("organization_id", access.activeOrganization.id)
      .order("display_order"),
    supabase
      .from("question_options")
      .select("*")
      .eq("organization_id", access.activeOrganization.id)
      .order("display_order"),
  ]);
  const error = questions.error ?? options.error;
  if (error)
    throw new Error("Question configuration is temporarily unavailable.");
  return (questions.data ?? []).map((q) => ({
    ...q,
    options: (options.data ?? []).filter((o) => o.question_id === q.id),
  }));
}
export async function getCaseQuestions(caseId: string) {
  const access = await getAccessContext();
  if (!access?.activeOrganization) redirect("/");
  const supabase = await createClient();
  const organizationId = access.activeOrganization.id;
  const [authorizedCase, questions, responses] = await Promise.all([
    supabase
      .from("organization_cases")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", caseId)
      .maybeSingle(),
    supabase
      .from("case_questions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("case_id", caseId)
      .order("display_order"),
    supabase
      .from("case_question_responses")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("case_id", caseId),
  ]);
  const error = authorizedCase.error ?? questions.error ?? responses.error;
  if (error) throw new Error("Case questions are temporarily unavailable.");
  if (!authorizedCase.data) throw new Error("Case questions are not available for this Case.");
  const caseQuestions = (questions.data ?? []).map((q) => ({
    ...q,
    response:
      (responses.data ?? []).find((r) => r.case_question_id === q.id) ?? null,
  }));
  const admin = createAdminClient();
  const [rules, actions, options] = await Promise.all([
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
      .order("display_order"),
    admin
      .from("question_options")
      .select("id,organization_id,question_id,option_value")
      .eq("organization_id", organizationId),
  ]);
  const evaluationError = rules.error ?? actions.error ?? options.error;
  if (evaluationError) throw new Error("Case question applicability is temporarily unavailable.");
  const evaluation = evaluateCaseRules({
    organizationId,
    questions: caseQuestions.map((question) => ({
      id: question.id,
      organization_id: question.organization_id,
      question_definition_id: question.question_definition_id,
      response_type: question.response_type,
      required: question.required,
      response_value: question.response?.response_value,
    })),
    options: options.data ?? [],
    rules: rules.data ?? [],
    actions: actions.data ?? [],
  });
  const evaluationByCaseQuestion = new Map(evaluation.questions.map((question) => [question.caseQuestionId, question]));
  return caseQuestions.map((question): EvaluatedCaseQuestion => {
    const result = evaluationByCaseQuestion.get(question.id);
    return {
      ...question,
      applicable: result?.applicable ?? true,
      effectiveRequired: result?.required ?? question.required,
      baselineRequired: question.required,
    };
  });
}
