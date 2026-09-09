import { startOfOrganizationDay } from "./organization-timezone.ts";
import type { CaseReadiness } from "./case-readiness.ts";
import type { Database } from "@/types/database.generated";

type CaseStatus = Database["public"]["Enums"]["case_status"];
type TaskStatus = Database["public"]["Enums"]["case_task_status"];
export type AttentionLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "NORMAL";

export type IntelligenceQuestion = {
  caseQuestionId: string;
  questionDefinitionId: string | null;
  label: string;
  applicable: boolean;
  effectiveRequired: boolean;
  answered: boolean;
};

export type IntelligenceTask = {
  id: string;
  organizationId: string;
  caseId: string;
  label: string;
  status: TaskStatus;
  required: boolean;
  blocking: boolean;
  dueAt: string | null;
  sourceRuleId: string | null;
  sourceRuleActionId: string | null;
};

export type IntelligenceCase = {
  id: string;
  organizationId: string;
  caseNumber: string;
  title: string;
  customerName: string | null;
  status: CaseStatus;
  updatedAt: string;
  readiness: CaseReadiness;
  questions: IntelligenceQuestion[];
  tasks: IntelligenceTask[];
  matchedRuleIds: string[];
  showRuleIds: string[];
  requireRuleIds: string[];
};

export type ActiveRule = { id: string; name: string };

export type QuestionBottleneck = {
  questionId: string;
  label: string;
  affectedCases: number;
  affectedPercent: number;
};

export type TaskBottleneck = {
  groupKey: string;
  label: string;
  generated: boolean;
  affectedCases: number;
  incompleteCount: number;
  blockedCount: number;
  overdueCount: number;
};

export type AttentionCase = {
  id: string;
  caseNumber: string;
  title: string;
  customerName: string | null;
  progressPercent: number;
  ready: boolean;
  level: AttentionLevel;
  reasons: string[];
  updatedAt: string;
};

const terminalCaseStatuses = new Set<CaseStatus>([
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
]);

export const isCurrentOperationalCase = (item: IntelligenceCase) =>
  !terminalCaseStatuses.has(item.status);

const normalizedManualTaskTitle = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const plural = (count: number, singular: string, pluralValue = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralValue}`;

const isApplicableRequirement = (task: IntelligenceTask) =>
  task.status !== "NOT_APPLICABLE" &&
  task.status !== "COMPLETED" &&
  (task.required || task.blocking);

const isOverdue = (task: IntelligenceTask, dayStart: Date) =>
  Boolean(task.dueAt && new Date(task.dueAt) < dayStart);

export function classifyCaseAttention(
  item: IntelligenceCase,
  timezone: string,
  now = new Date(),
): AttentionCase {
  const dayStart = startOfOrganizationDay(now, timezone);
  const incompleteTasks = item.tasks.filter(isApplicableRequirement);
  const blockedCount = incompleteTasks.filter(
    (task) => task.status === "BLOCKED",
  ).length;
  const overdueCount = incompleteTasks.filter((task) =>
    isOverdue(task, dayStart),
  ).length;
  const unansweredCount = item.readiness.unansweredRequiredQuestions.length;
  const reasons = [
    blockedCount ? plural(blockedCount, "blocked task") : null,
    overdueCount ? plural(overdueCount, "overdue required task") : null,
    unansweredCount
      ? plural(unansweredCount, "unanswered required question")
      : null,
    incompleteTasks.length
      ? plural(incompleteTasks.length, "incomplete required task")
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const outstandingUnits = item.readiness.totalUnits - item.readiness.completedUnits;
  const level: AttentionLevel =
    blockedCount > 0 || overdueCount > 1
      ? "CRITICAL"
      : overdueCount > 0 || outstandingUnits >= 3
        ? "HIGH"
        : !item.readiness.ready
          ? "MEDIUM"
          : "NORMAL";
  return {
    id: item.id,
    caseNumber: item.caseNumber,
    title: item.title,
    customerName: item.customerName,
    progressPercent: item.readiness.progressPercent,
    ready: item.readiness.ready,
    level,
    reasons,
    updatedAt: item.updatedAt,
  };
}

const attentionOrder: Record<AttentionLevel, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  NORMAL: 3,
};

export function deriveOperationalIntelligence({
  organizationId,
  cases,
  activeRules,
  timezone,
  includeRuleActivity,
  includeGeneratedTaskActivity = true,
  now = new Date(),
}: {
  organizationId: string;
  cases: IntelligenceCase[];
  activeRules: ActiveRule[];
  timezone: string;
  includeRuleActivity: boolean;
  includeGeneratedTaskActivity?: boolean;
  now?: Date;
}) {
  const scopedCases = cases.filter(
    (item) => item.organizationId === organizationId,
  );
  const currentCases = scopedCases.filter(isCurrentOperationalCase);
  const dayStart = startOfOrganizationDay(now, timezone);
  const bucketDefinitions = [
    { label: "100%", minimum: 100, maximum: 100 },
    { label: "75–99%", minimum: 75, maximum: 99 },
    { label: "50–74%", minimum: 50, maximum: 74 },
    { label: "25–49%", minimum: 25, maximum: 49 },
    { label: "0–24%", minimum: 0, maximum: 24 },
  ];
  const readinessDistribution = {
    totalCurrentCases: currentCases.length,
    completedCases: scopedCases.filter((item) => item.status === "COMPLETED").length,
    readyCases: currentCases.filter((item) => item.readiness.ready).length,
    notReadyCases: currentCases.filter((item) => !item.readiness.ready).length,
    averageProgress: currentCases.length
      ? Math.round(
          currentCases.reduce(
            (total, item) => total + item.readiness.progressPercent,
            0,
          ) / currentCases.length,
        )
      : 100,
    buckets: bucketDefinitions.map((bucket) => ({
      label: bucket.label,
      count: currentCases.filter(
        (item) =>
          item.readiness.progressPercent >= bucket.minimum &&
          item.readiness.progressPercent <= bucket.maximum,
      ).length,
    })),
  };

  const questionGroups = new Map<
    string,
    { label: string; caseIds: Set<string> }
  >();
  for (const item of currentCases) {
    for (const question of item.questions) {
      if (
        !question.applicable ||
        !question.effectiveRequired ||
        question.answered
      )
        continue;
      const key = question.questionDefinitionId ?? question.caseQuestionId;
      const group = questionGroups.get(key) ?? {
        label: question.label,
        caseIds: new Set<string>(),
      };
      group.caseIds.add(item.id);
      questionGroups.set(key, group);
    }
  }
  const questionBottlenecks: QuestionBottleneck[] = [...questionGroups].map(
    ([questionId, group]) => ({
      questionId,
      label: group.label,
      affectedCases: group.caseIds.size,
      affectedPercent: currentCases.length
        ? Math.round((group.caseIds.size / currentCases.length) * 100)
        : 0,
    }),
  );
  questionBottlenecks.sort(
    (left, right) =>
      right.affectedCases - left.affectedCases ||
      left.label.localeCompare(right.label),
  );

  const taskGroups = new Map<
    string,
    {
      label: string;
      generated: boolean;
      caseIds: Set<string>;
      incompleteCount: number;
      blockedCount: number;
      overdueCount: number;
    }
  >();
  for (const item of currentCases) {
    for (const task of item.tasks) {
      if (!isApplicableRequirement(task)) continue;
      const generated = Boolean(task.sourceRuleActionId);
      const key = generated
        ? `rule-action:${task.sourceRuleActionId}`
        : `manual:${normalizedManualTaskTitle(task.label)}`;
      const group = taskGroups.get(key) ?? {
        label: task.label,
        generated,
        caseIds: new Set<string>(),
        incompleteCount: 0,
        blockedCount: 0,
        overdueCount: 0,
      };
      group.caseIds.add(item.id);
      group.incompleteCount += 1;
      if (task.status === "BLOCKED") group.blockedCount += 1;
      if (isOverdue(task, dayStart)) group.overdueCount += 1;
      taskGroups.set(key, group);
    }
  }
  const taskBottlenecks: TaskBottleneck[] = [...taskGroups].map(
    ([groupKey, group]) => ({
      groupKey,
      label: group.label,
      generated: group.generated,
      affectedCases: group.caseIds.size,
      incompleteCount: group.incompleteCount,
      blockedCount: group.blockedCount,
      overdueCount: group.overdueCount,
    }),
  );
  taskBottlenecks.sort(
    (left, right) =>
      right.affectedCases - left.affectedCases ||
      right.blockedCount - left.blockedCount ||
      left.label.localeCompare(right.label),
  );

  const blockedCases = currentCases.filter((item) =>
    item.tasks.some(
      (task) => isApplicableRequirement(task) && task.status === "BLOCKED",
    ),
  );
  const blockedTasks = blockedCases.flatMap((item) =>
    item.tasks.filter(
      (task) => isApplicableRequirement(task) && task.status === "BLOCKED",
    ),
  );
  const blockedWork = {
    caseCount: blockedCases.length,
    taskCount: blockedTasks.length,
    overdueCount: blockedTasks.filter((task) => isOverdue(task, dayStart)).length,
    cases: blockedCases.map((item) => ({
      id: item.id,
      caseNumber: item.caseNumber,
      title: item.title,
    })),
    topTasks: taskBottlenecks
      .filter((item) => item.blockedCount > 0)
      .sort(
        (left, right) =>
          right.blockedCount - left.blockedCount ||
          left.label.localeCompare(right.label),
      )
      .slice(0, 5),
  };

  const ruleActivity = includeRuleActivity
    ? activeRules
        .map((rule) => {
          const ruleTasks = includeGeneratedTaskActivity
            ? scopedCases.flatMap((item) =>
                item.tasks.filter((task) => task.sourceRuleId === rule.id),
              )
            : null;
          const generatedByStatus = ruleTasks
            ? ruleTasks.reduce<Partial<Record<TaskStatus, number>>>(
                (counts, task) => ({
                  ...counts,
                  [task.status]: (counts[task.status] ?? 0) + 1,
                }),
                {},
              )
            : null;
          return {
            ruleId: rule.id,
            name: rule.name,
            matchingCases: currentCases.filter((item) =>
              item.matchedRuleIds.includes(rule.id),
            ).length,
            effectiveShowActions: currentCases.reduce(
              (count, item) =>
                count + item.showRuleIds.filter((id) => id === rule.id).length,
              0,
            ),
            effectiveRequireActions: currentCases.reduce(
              (count, item) =>
                count + item.requireRuleIds.filter((id) => id === rule.id).length,
              0,
            ),
            generatedTasks: ruleTasks?.length ?? null,
            generatedByStatus,
          };
        })
        .sort(
          (left, right) =>
            right.matchingCases - left.matchingCases ||
            (right.generatedTasks ?? -1) - (left.generatedTasks ?? -1) ||
            left.name.localeCompare(right.name),
        )
    : null;

  const attentionCases = currentCases
    .map((item) => classifyCaseAttention(item, timezone, now))
    .filter((item) => item.level !== "NORMAL")
    .sort(
      (left, right) =>
        attentionOrder[left.level] - attentionOrder[right.level] ||
        left.progressPercent - right.progressPercent ||
        new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime() ||
        left.caseNumber.localeCompare(right.caseNumber),
    );

  return {
    readinessDistribution,
    questionBottlenecks,
    taskBottlenecks,
    blockedWork,
    ruleActivity,
    attentionCases,
  };
}

export type OperationalIntelligence = ReturnType<
  typeof deriveOperationalIntelligence
>;
