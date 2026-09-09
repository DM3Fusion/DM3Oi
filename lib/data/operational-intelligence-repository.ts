import "server-only";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { isMeaningfulRuleAnswer } from "@/lib/rule-evaluator";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deriveOperationalIntelligence,
  type IntelligenceCase,
} from "@/lib/operational-intelligence";
import type { LiveOrganizationData } from "@/lib/data/case-repository";

export async function getOperationalIntelligence(
  data: LiveOrganizationData,
) {
  const access = await getAccessContext();
  if (
    !access?.activeOrganization ||
    access.activeOrganization.id !== data.organizationId ||
    !hasPermission(access, "VIEW_DASHBOARD")
  ) {
    return null;
  }

  const canViewCases = hasPermission(access, "VIEW_CASES");
  const canViewTasks = hasPermission(access, "VIEW_TASKS");
  const canViewQuestions = hasPermission(access, "VIEW_QUESTIONS");
  const canViewRules = hasPermission(access, "VIEW_RULES");
  const caseIds = data.cases.map((item) => item.id);
  const admin = createAdminClient();
  const provenance = canViewTasks && caseIds.length
    ? await admin
        .from("case_tasks")
        .select("id,organization_id,case_id,source_rule_id,source_rule_action_id")
        .eq("organization_id", data.organizationId)
        .in("case_id", caseIds)
    : { data: [], error: null };
  if (provenance.error) {
    throw new Error("Operational intelligence is temporarily unavailable.");
  }
  const provenanceByTask = new Map(
    (provenance.data ?? []).map((task) => [task.id, task]),
  );

  const cases: IntelligenceCase[] = data.cases.map((item) => ({
    id: item.id,
    organizationId: item.organization_id,
    caseNumber: item.case_number,
    title: item.title,
    customerName: item.customer?.name ?? null,
    status: item.status,
    updatedAt: item.updated_at,
    readiness: item.progress,
    questions: canViewQuestions ? item.questions.map((question) => ({
      caseQuestionId: question.id,
      questionDefinitionId: question.question_definition_id,
      label: question.question_text,
      applicable: question.applicable,
      effectiveRequired: question.effectiveRequired,
      answered: isMeaningfulRuleAnswer(
        question.response_type,
        question.response?.response_value,
      ),
    })) : [],
    tasks: canViewTasks ? item.tasks.map((task) => {
      const source = provenanceByTask.get(task.id);
      return {
        id: task.id,
        organizationId: task.organization_id,
        caseId: task.case_id,
        label: task.title,
        status: task.status,
        required: task.required,
        blocking: task.blocking,
        dueAt: task.due_at,
        sourceRuleId: source?.source_rule_id ?? null,
        sourceRuleActionId: source?.source_rule_action_id ?? null,
      };
    }) : [],
    matchedRuleIds: canViewRules ? item.ruleEvaluation.matchedRules.map((rule) => rule.id) : [],
    showRuleIds: canViewRules ? item.ruleEvaluation.questions.flatMap(
      (question) => question.showRuleIds,
    ) : [],
    requireRuleIds: canViewRules ? item.ruleEvaluation.questions.flatMap(
      (question) => question.requireRuleIds,
    ) : [],
  }));

  const intelligence = deriveOperationalIntelligence({
    organizationId: data.organizationId,
    cases,
    activeRules: canViewRules ? data.activeRules : [],
    timezone: data.timezone,
    includeRuleActivity: canViewRules,
    includeGeneratedTaskActivity: canViewTasks,
  });
  return {
    ...intelligence,
    attentionCases: canViewCases ? intelligence.attentionCases : [],
    capabilities: {
      viewCases: canViewCases,
      viewTasks: canViewTasks,
      viewQuestions: canViewQuestions,
      viewRules: canViewRules,
    },
  };
}

export type AuthorizedOperationalIntelligence = NonNullable<
  Awaited<ReturnType<typeof getOperationalIntelligence>>
>;
