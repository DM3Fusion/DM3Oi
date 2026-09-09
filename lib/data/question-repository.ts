import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { loadCaseRuleEvaluation } from "@/lib/data/rule-task-synchronization";
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
  const authorizedCase = await supabase
    .from("organization_cases")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", caseId)
    .maybeSingle();
  if (authorizedCase.error) throw new Error("Case questions are temporarily unavailable.");
  if (!authorizedCase.data) throw new Error("Case questions are not available for this Case.");
  const evaluation = await loadCaseRuleEvaluation(organizationId, caseId);
  const evaluationByCaseQuestion = new Map(evaluation.questions.map((question) => [question.caseQuestionId, question]));
  return evaluation.caseQuestions.map((question): EvaluatedCaseQuestion => {
    const result = evaluationByCaseQuestion.get(question.id);
    return {
      ...question,
      applicable: result?.applicable ?? true,
      effectiveRequired: result?.required ?? question.required,
      baselineRequired: question.required,
    };
  });
}
