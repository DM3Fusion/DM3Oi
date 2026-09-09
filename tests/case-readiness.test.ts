import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculateCaseReadiness,
  type ReadinessQuestion,
  type ReadinessTask,
} from "../lib/case-readiness.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const question = (
  id: string,
  responseValue: ReadinessQuestion["responseValue"],
  overrides: Partial<ReadinessQuestion> = {},
): ReadinessQuestion => ({
  id,
  label: id,
  responseType: "TEXT",
  responseValue,
  applicable: true,
  effectiveRequired: true,
  ...overrides,
});
const task = (
  id: string,
  status: ReadinessTask["status"],
  overrides: Partial<ReadinessTask> = {},
): ReadinessTask => ({
  id,
  label: id,
  status,
  required: true,
  blocking: false,
  ...overrides,
});

test("required Question completion reuses response-type-aware meaningful-answer semantics", () => {
  for (const [responseType, answer] of [
    ["TEXT", "answered"],
    ["NUMBER", 0],
    ["YES_NO", false],
    ["MULTI_SELECT", ["option"] as string[]],
  ] as const) {
    const result = calculateCaseReadiness({
      questions: [question("Required question", answer, { responseType })],
      tasks: [],
    });
    assert.equal(result.ready, true);
    assert.equal(result.progressPercent, 100);
  }
  const unanswered = calculateCaseReadiness({
    questions: [question("Required question", "   ")],
    tasks: [],
  });
  assert.equal(unanswered.ready, false);
  assert.equal(unanswered.progressPercent, 0);
});

test("optional and nonapplicable Questions do not contribute, including retained hidden answers", () => {
  const result = calculateCaseReadiness({
    questions: [
      question("Optional", undefined, { effectiveRequired: false }),
      question("Hidden required", "retained answer", { applicable: false }),
    ],
    tasks: [],
  });
  assert.deepEqual(
    { total: result.totalUnits, completed: result.completedUnits, ready: result.ready },
    { total: 0, completed: 0, ready: true },
  );
});

test("Rule-required Question counts only while the evaluator marks it applicable and required", () => {
  const active = calculateCaseReadiness({
    questions: [question("Field verification", undefined, { effectiveRequired: true })],
    tasks: [],
  });
  const inactive = calculateCaseReadiness({
    questions: [question("Field verification", undefined, { applicable: false, effectiveRequired: true })],
    tasks: [],
  });
  assert.equal(active.totalUnits, 1);
  assert.equal(active.ready, false);
  assert.equal(inactive.totalUnits, 0);
  assert.equal(inactive.ready, true);
});

test("required Task statuses are binary and NOT_APPLICABLE is excluded", () => {
  for (const status of ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] as const) {
    const result = calculateCaseReadiness({ questions: [], tasks: [task(status, status)] });
    assert.equal(result.progressPercent, 0);
    assert.equal(result.ready, false);
  }
  const completed = calculateCaseReadiness({ questions: [], tasks: [task("done", "COMPLETED")] });
  assert.equal(completed.progressPercent, 100);
  assert.equal(completed.ready, true);
  const excluded = calculateCaseReadiness({ questions: [], tasks: [task("n/a", "NOT_APPLICABLE")] });
  assert.equal(excluded.totalUnits, 0);
  assert.equal(excluded.ready, true);
});

test("ordinary optional Tasks do not count while manual required Tasks do", () => {
  const result = calculateCaseReadiness({
    questions: [],
    tasks: [
      task("Optional", "NOT_STARTED", { required: false, blocking: false }),
      task("Manual required", "NOT_STARTED"),
    ],
  });
  assert.equal(result.totalUnits, 1);
  assert.deepEqual(result.remainingWork.map((work) => work.label), ["Manual required"]);
});

test("optional blocking Tasks block until complete and NOT_APPLICABLE blocking Tasks are excluded", () => {
  for (const status of ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] as const) {
    const result = calculateCaseReadiness({
      questions: [],
      tasks: [task(status, status, { required: false, blocking: true })],
    });
    assert.equal(result.ready, false);
  }
  assert.equal(calculateCaseReadiness({ questions: [], tasks: [task("done", "COMPLETED", { required: false, blocking: true })] }).ready, true);
  assert.equal(calculateCaseReadiness({ questions: [], tasks: [task("n/a", "NOT_APPLICABLE", { required: false, blocking: true })] }).totalUnits, 0);
});

test("a required blocking Task is one unit and appears once in remaining work", () => {
  const result = calculateCaseReadiness({
    questions: [],
    tasks: [task("Both", "BLOCKED", { required: true, blocking: true })],
  });
  assert.equal(result.totalUnits, 1);
  assert.equal(result.incompleteRequiredTasks.length, 1);
  assert.equal(result.incompleteBlockingTasks.length, 1);
  assert.deepEqual(result.remainingWork.map((work) => work.id), ["Both"]);
});

test("progress uses equal binary units and Math.round, including zero requirements", () => {
  const half = calculateCaseReadiness({
    questions: [question("answered", "yes")],
    tasks: [task("open", "NOT_STARTED")],
  });
  assert.deepEqual([half.completedUnits, half.totalUnits, half.progressPercent], [1, 2, 50]);
  const twoThirds = calculateCaseReadiness({
    questions: [question("answered", "yes"), question("missing", undefined)],
    tasks: [task("done", "COMPLETED")],
  });
  assert.equal(twoThirds.progressPercent, 67);
  const empty = calculateCaseReadiness({ questions: [], tasks: [] });
  assert.deepEqual([empty.progressPercent, empty.ready], [100, true]);
});

test("remaining work orders Questions, blocked blockers, other blockers, then required Tasks", () => {
  const result = calculateCaseReadiness({
    questions: [question("Question", undefined)],
    tasks: [
      task("Required", "IN_PROGRESS"),
      task("Blocking", "IN_PROGRESS", { required: false, blocking: true }),
      task("Blocked", "BLOCKED", { required: false, blocking: true }),
    ],
  });
  assert.deepEqual(result.remainingWork.map((work) => work.label), [
    "Question",
    "Blocked",
    "Blocking",
    "Required",
  ]);
});

test("internal repository derives readiness in a bounded authorized organization load", () => {
  const repository = source("lib/data/case-repository.ts");
  const loader = source("lib/data/rule-task-synchronization.ts");
  assert.match(repository, /\.from\("organization_cases"\)[\s\S]*\.eq\("organization_id", organizationId\)/);
  assert.match(repository, /loadOrganizationCaseRuleEvaluations\([\s\S]*rawCases\.map\(\(item\) => item\.id\)/);
  assert.match(loader, /\.from\("case_questions"\)[\s\S]*\.eq\("organization_id", organizationId\)[\s\S]*\.in\("case_id", caseIds\)/);
  assert.match(loader, /\.from\("case_question_responses"\)[\s\S]*\.in\("case_id", caseIds\)/);
  assert.match(loader, /\.from\("rule_definitions"\)[\s\S]*\.eq\("organization_id", organizationId\)/);
  assert.match(loader, /\.from\("rule_actions"\)[\s\S]*\.eq\("organization_id", organizationId\)/);
  assert.doesNotMatch(repository, /for \([^)]*\)[\s\S]*await loadCaseRuleEvaluation/);
});

test("Case detail replaces the placeholder with accessible business-facing readiness", () => {
  const page = source("app/cases/[caseId]/page.tsx");
  const ui = source("components/ui.tsx");
  assert.match(page, /<h3>Case Readiness<\/h3>/);
  assert.match(page, /Ready for completion/);
  assert.match(page, /Not ready for completion/);
  assert.match(page, /remainingWork\.slice\(0, 5\)\.map/);
  assert.match(page, /Blocked task/);
  assert.doesNotMatch(page, /Future milestone|source_rule_id|source_rule_action_id/);
  assert.match(ui, /role="progressbar"[\s\S]*aria-valuenow=\{percentage\}/);
  assert.doesNotMatch(source("lib/case-readiness.ts"), /update\(|insert\(|\.from\("cases"\)/);
});

test("portal progress remains on its existing safe projection contract", () => {
  const portalRepository = source("lib/data/customer-portal-case-repository.ts");
  const readiness = source("lib/case-readiness.ts");
  assert.doesNotMatch(portalRepository, /case-readiness|calculateCaseReadiness|case_questions|case_tasks/);
  assert.doesNotMatch(readiness, /customer_portal|portal_case/);
});
