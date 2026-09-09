import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyCaseAttention,
  deriveOperationalIntelligence,
  type IntelligenceCase,
  type IntelligenceQuestion,
  type IntelligenceTask,
} from "../lib/operational-intelligence.ts";
import type { CaseReadiness } from "../lib/case-readiness.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const readiness = ({
  progress = 100,
  ready = progress === 100,
  unanswered = 0,
  total = ready ? 0 : Math.max(1, unanswered),
}: {
  progress?: number;
  ready?: boolean;
  unanswered?: number;
  total?: number;
} = {}): CaseReadiness => ({
  progressPercent: progress,
  ready,
  completedUnits: Math.round((progress / 100) * total),
  totalUnits: total,
  unansweredRequiredQuestions: Array.from({ length: unanswered }, (_, index) => ({
    kind: "QUESTION",
    id: `unanswered-${index}`,
    label: `Unanswered ${index}`,
  })),
  incompleteRequiredTasks: [],
  incompleteBlockingTasks: [],
  remainingWork: [],
});

const question = (
  id: string,
  overrides: Partial<IntelligenceQuestion> = {},
): IntelligenceQuestion => ({
  caseQuestionId: `snapshot-${id}`,
  questionDefinitionId: id,
  label: `Question ${id}`,
  applicable: true,
  effectiveRequired: true,
  answered: false,
  ...overrides,
});

const task = (
  id: string,
  overrides: Partial<IntelligenceTask> = {},
): IntelligenceTask => ({
  id,
  organizationId: "org-a",
  caseId: "case-1",
  label: "Verify installation site",
  status: "NOT_STARTED",
  required: true,
  blocking: false,
  dueAt: null,
  sourceRuleId: null,
  sourceRuleActionId: null,
  ...overrides,
});

const caseItem = (
  id: string,
  overrides: Partial<IntelligenceCase> = {},
): IntelligenceCase => ({
  id,
  organizationId: "org-a",
  caseNumber: `CASE-${id}`,
  title: `Case ${id}`,
  customerName: `Customer ${id}`,
  status: "IN_PROGRESS",
  updatedAt: "2026-09-08T12:00:00.000Z",
  readiness: readiness(),
  questions: [],
  tasks: [],
  matchedRuleIds: [],
  showRuleIds: [],
  requireRuleIds: [],
  ...overrides,
});

const derive = (
  cases: IntelligenceCase[],
  includeRuleActivity = true,
) =>
  deriveOperationalIntelligence({
    organizationId: "org-a",
    cases,
    activeRules: [
      { id: "rule-active", name: "Regulatory field verification" },
    ],
    timezone: "UTC",
    includeRuleActivity,
    now: new Date("2026-09-09T12:00:00.000Z"),
  });

test("readiness distribution uses current authoritative readiness and excludes terminal Cases", () => {
  const result = derive([
    caseItem("100", { readiness: readiness({ progress: 100 }) }),
    caseItem("80", { readiness: readiness({ progress: 80, ready: false, total: 5 }) }),
    caseItem("60", { readiness: readiness({ progress: 60, ready: false, total: 5 }) }),
    caseItem("30", { readiness: readiness({ progress: 30, ready: false, total: 10 }) }),
    caseItem("10", { readiness: readiness({ progress: 10, ready: false, total: 10 }) }),
    caseItem("complete", { status: "COMPLETED", readiness: readiness({ progress: 100 }) }),
    caseItem("closed", { status: "CLOSED", readiness: readiness({ progress: 20, ready: false }) }),
    caseItem("cancelled", { status: "CANCELLED", readiness: readiness({ progress: 0, ready: false }) }),
  ]);
  assert.deepEqual(result.readinessDistribution, {
    totalCurrentCases: 5,
    completedCases: 1,
    readyCases: 1,
    notReadyCases: 4,
    averageProgress: 56,
    buckets: [
      { label: "100%", count: 1 },
      { label: "75–99%", count: 1 },
      { label: "50–74%", count: 1 },
      { label: "25–49%", count: 1 },
      { label: "0–24%", count: 1 },
    ],
  });
});

test("Question bottlenecks use stable identity and ignore answered, optional, nonapplicable, terminal, and cross-tenant data", () => {
  const result = derive([
    caseItem("one", { questions: [question("location", { label: "Field verified?" })] }),
    caseItem("two", { questions: [question("location", { caseQuestionId: "another-snapshot", label: "Field verified?" })] }),
    caseItem("answered", { questions: [question("location", { answered: true })] }),
    caseItem("optional", { questions: [question("optional", { effectiveRequired: false })] }),
    caseItem("hidden", { questions: [question("hidden", { applicable: false })] }),
    caseItem("done", { status: "COMPLETED", questions: [question("location")] }),
    caseItem("foreign", { organizationId: "org-b", questions: [question("location")] }),
  ]);
  assert.deepEqual(result.questionBottlenecks, [{
    questionId: "location",
    label: "Field verified?",
    affectedCases: 2,
    affectedPercent: 40,
  }]);
});

test("Task bottlenecks deduplicate requirements and group generated and manual Tasks safely", () => {
  const result = derive([
    caseItem("one", {
      tasks: [
        task("both", { caseId: "one", required: true, blocking: true, status: "BLOCKED", dueAt: "2026-09-08T12:00:00.000Z", sourceRuleActionId: "action-a", sourceRuleId: "rule-active" }),
        task("manual-a", { caseId: "one", label: "  Confirm   hardware " }),
        task("complete", { caseId: "one", label: "Ignore complete", status: "COMPLETED" }),
        task("na", { caseId: "one", label: "Ignore N/A", status: "NOT_APPLICABLE" }),
      ],
    }),
    caseItem("two", {
      tasks: [
        task("generated-two", { caseId: "two", label: "Template renamed", sourceRuleActionId: "action-a", sourceRuleId: "rule-active" }),
        task("manual-b", { caseId: "two", label: "confirm hardware", blocking: true, required: false }),
        task("optional", { caseId: "two", label: "Optional", required: false, blocking: false }),
      ],
    }),
    caseItem("foreign", { organizationId: "org-b", tasks: [task("foreign", { organizationId: "org-b", caseId: "foreign" })] }),
  ]);
  const generated = result.taskBottlenecks.find((item) => item.groupKey === "rule-action:action-a");
  const manual = result.taskBottlenecks.find((item) => item.groupKey === "manual:confirm hardware");
  assert.deepEqual(generated, {
    groupKey: "rule-action:action-a",
    label: "Verify installation site",
    generated: true,
    affectedCases: 2,
    incompleteCount: 2,
    blockedCount: 1,
    overdueCount: 1,
  });
  assert.deepEqual(manual, {
    groupKey: "manual:confirm hardware",
    label: "  Confirm   hardware ",
    generated: false,
    affectedCases: 2,
    incompleteCount: 2,
    blockedCount: 0,
    overdueCount: 0,
  });
  assert.equal(result.taskBottlenecks.some((item) => item.label.includes("Ignore")), false);
});

test("blocked work counts each Case once and uses authoritative applicable Task status", () => {
  const result = derive([
    caseItem("one", { tasks: [
      task("blocked-one", { caseId: "one", status: "BLOCKED", blocking: true, dueAt: "2026-09-08T12:00:00.000Z" }),
      task("blocked-two", { caseId: "one", status: "BLOCKED", required: true }),
    ] }),
    caseItem("two", { tasks: [task("not-applicable", { caseId: "two", status: "NOT_APPLICABLE", blocking: true })] }),
  ]);
  assert.deepEqual(
    { cases: result.blockedWork.caseCount, tasks: result.blockedWork.taskCount, overdue: result.blockedWork.overdueCount },
    { cases: 1, tasks: 2, overdue: 1 },
  );
  assert.deepEqual(result.blockedWork.cases.map((item) => item.id), ["one"]);
});

test("Rule activity separates current matches and effects from durable generated Task history", () => {
  const result = derive([
    caseItem("current", {
      matchedRuleIds: ["rule-active"],
      showRuleIds: ["rule-active"],
      requireRuleIds: ["rule-active", "rule-active"],
      tasks: [task("current-generated", { caseId: "current", sourceRuleId: "rule-active", sourceRuleActionId: "action-a" })],
    }),
    caseItem("historical", {
      status: "COMPLETED",
      tasks: [task("historical-generated", { caseId: "historical", status: "COMPLETED", sourceRuleId: "rule-active", sourceRuleActionId: "retired-action" })],
    }),
  ]);
  assert.deepEqual(result.ruleActivity?.[0], {
    ruleId: "rule-active",
    name: "Regulatory field verification",
    matchingCases: 1,
    effectiveShowActions: 1,
    effectiveRequireActions: 2,
    generatedTasks: 2,
    generatedByStatus: { NOT_STARTED: 1, COMPLETED: 1 },
  });
  assert.equal(derive([caseItem("one")], false).ruleActivity, null);
  const taskRestricted = deriveOperationalIntelligence({
    organizationId: "org-a",
    cases: [caseItem("restricted", { matchedRuleIds: ["rule-active"] })],
    activeRules: [{ id: "rule-active", name: "Regulatory field verification" }],
    timezone: "UTC",
    includeRuleActivity: true,
    includeGeneratedTaskActivity: false,
  });
  assert.equal(taskRestricted.ruleActivity?.[0].matchingCases, 1);
  assert.equal(taskRestricted.ruleActivity?.[0].generatedTasks, null);
  assert.equal(taskRestricted.ruleActivity?.[0].generatedByStatus, null);
});

test("attention levels and reasons are deterministic and ignore optional or nonapplicable Tasks", () => {
  const blocked = caseItem("blocked", { readiness: readiness({ progress: 40, ready: false, total: 5 }), tasks: [task("blocked", { status: "BLOCKED", blocking: true })] });
  const overdue = caseItem("overdue", { readiness: readiness({ progress: 50, ready: false, total: 2 }), tasks: [task("overdue", { dueAt: "2026-09-08T12:00:00.000Z" })] });
  const unanswered = caseItem("unanswered", { readiness: readiness({ progress: 50, ready: false, unanswered: 1, total: 2 }) });
  const ready = caseItem("ready", { tasks: [task("optional", { required: false }), task("na", { status: "NOT_APPLICABLE", blocking: true })] });
  assert.equal(classifyCaseAttention(blocked, "UTC", new Date("2026-09-09T12:00:00Z")).level, "CRITICAL");
  assert.equal(classifyCaseAttention(overdue, "UTC", new Date("2026-09-09T12:00:00Z")).level, "HIGH");
  assert.deepEqual(classifyCaseAttention(unanswered, "UTC").reasons, ["1 unanswered required question"]);
  assert.equal(classifyCaseAttention(unanswered, "UTC").level, "MEDIUM");
  assert.equal(classifyCaseAttention(ready, "UTC").level, "NORMAL");
  assert.deepEqual(derive([unanswered, overdue, blocked, ready]).attentionCases.map((item) => item.id), ["blocked", "overdue", "unanswered"]);
});

test("repository constrains provenance to already authorized Case IDs and gates Rule names", () => {
  const repository = source("lib/data/operational-intelligence-repository.ts");
  const caseRepository = source("lib/data/case-repository.ts");
  assert.match(repository, /hasPermission\(access, "VIEW_DASHBOARD"\)/);
  assert.match(repository, /const caseIds = data\.cases\.map\(\(item\) => item\.id\)/);
  assert.match(repository, /\.from\("case_tasks"\)[\s\S]*\.eq\("organization_id", data\.organizationId\)[\s\S]*\.in\("case_id", caseIds\)/);
  assert.match(repository, /const canViewRules = hasPermission\(access, "VIEW_RULES"\)/);
  assert.match(repository, /activeRules: canViewRules \? data\.activeRules : \[\]/);
  assert.match(repository, /includeGeneratedTaskActivity: canViewTasks/);
  assert.match(repository, /attentionCases: canViewCases \? intelligence\.attentionCases : \[\]/);
  assert.match(caseRepository, /\.from\("organization_cases"\)[\s\S]*\.eq\("organization_id", organizationId\)/);
  assert.doesNotMatch(repository, /\.from\("cases"\)/);
});

test("Dashboard renders compact actionable intelligence without exposing it to Customer Portal", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const component = source("components/dashboard/operational-intelligence.tsx");
  const page = source("app/page.tsx");
  const portal = source("lib/data/customer-portal-case-repository.ts");
  assert.match(page, /getOperationalIntelligence\(data\)/);
  assert.match(dashboard, /<OperationalIntelligenceSection intelligence=\{intelligence\}/);
  for (const text of ["Operational Intelligence", "Readiness Distribution", "Top Bottlenecks", "Cases Needing Attention", "Rule Activity"]) assert.match(component, new RegExp(text));
  for (const emptyState of ["All currently required work is complete.", "No Cases currently have blocked required work.", "No current Cases need completion attention", "No active Rules are currently affecting Cases."]) assert.match(component, new RegExp(emptyState));
  assert.match(component, /\/tasks\?status=blocked/);
  assert.match(component, /`\/cases\/\$\{item\.id\}`/);
  assert.match(component, /\/questions\?view=rules/);
  assert.doesNotMatch(component, />\{rule\.ruleId\}</);
  assert.doesNotMatch(portal, /operational-intelligence|OperationalIntelligence/);
});
