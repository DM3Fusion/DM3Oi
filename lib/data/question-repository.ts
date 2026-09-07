import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";
type Tables = Database["public"]["Tables"];
export type QuestionDefinition = Tables["question_definitions"]["Row"] & {
  options: Tables["question_options"]["Row"][];
};
export type CaseQuestion = Tables["case_questions"]["Row"] & {
  response: Tables["case_question_responses"]["Row"] | null;
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
  const [questions, responses] = await Promise.all([
    supabase
      .from("case_questions")
      .select("*")
      .eq("organization_id", access.activeOrganization.id)
      .eq("case_id", caseId)
      .order("display_order"),
    supabase
      .from("case_question_responses")
      .select("*")
      .eq("organization_id", access.activeOrganization.id)
      .eq("case_id", caseId),
  ]);
  const error = questions.error ?? responses.error;
  if (error) throw new Error("Case questions are temporarily unavailable.");
  return (questions.data ?? []).map((q) => ({
    ...q,
    response:
      (responses.data ?? []).find((r) => r.case_question_id === q.id) ?? null,
  }));
}
