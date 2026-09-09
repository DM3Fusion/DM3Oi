import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];
export type RuleDefinition = Views["organization_rule_definitions"]["Row"] & {
  actions: Views["organization_rule_actions"]["Row"][];
};
export type RuleQuestion = Views["organization_question_definitions"]["Row"] & {
  options: Tables["question_options"]["Row"][];
};

export async function getRuleBuilderData() {
  const access = await getAccessContext();
  if (!access?.activeOrganization || !hasPermission(access, "VIEW_RULES"))
    redirect("/questions");
  const db = await createClient();
  const organizationId = access.activeOrganization.id;
  const [rules, actions, questions, options] = await Promise.all([
    db.from("organization_rule_definitions").select("*").eq("organization_id", organizationId).order("display_order"),
    db.from("organization_rule_actions").select("*").eq("organization_id", organizationId).order("display_order"),
    db.from("organization_question_definitions").select("*").eq("organization_id", organizationId).order("display_order"),
    db.from("question_options").select("*").eq("organization_id", organizationId).order("display_order"),
  ]);
  const error = rules.error ?? actions.error ?? questions.error ?? options.error;
  if (error) throw new Error("Rule configuration is temporarily unavailable.");
  const questionRows = (questions.data ?? []).map((question) => ({
    ...question,
    options: (options.data ?? []).filter((option) => option.question_id === question.id),
  })) as RuleQuestion[];
  return {
    rules: (rules.data ?? []).map((rule) => ({
      ...rule,
      actions: (actions.data ?? []).filter((action) => action.rule_definition_id === rule.id),
    })) as RuleDefinition[],
    questions: questionRows,
  };
}
