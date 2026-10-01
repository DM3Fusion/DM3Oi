import test from "node:test";
import assert from "node:assert/strict";
import type { LiveCase, TaskRow } from "../lib/data/case-repository.ts";
import { isOpenTask, matchesCaseFilter, matchesTaskFilter, normalizeCaseStatus, normalizeTaskDue, normalizeTaskStatus, taskStatuses } from "../lib/operational-filters.ts";

const task = (status: TaskRow["status"], due_at: string | null = null) => ({ status, due_at }) as TaskRow;
const liveCase = (status: LiveCase["status"]) => ({ status }) as LiveCase;

test("task filters expose customer workflow statuses while retaining system-only legacy semantics", () => {
  assert.equal(isOpenTask(task("NOT_STARTED")), true);
  assert.equal(isOpenTask(task("IN_PROGRESS")), true);
  assert.equal(isOpenTask(task("WAITING_ON_CUSTOMER")), true);
  assert.equal(isOpenTask(task("BLOCKED")), true);

  assert.equal(isOpenTask(task("COMPLETED")), false);
  assert.equal(isOpenTask(task("NOT_APPLICABLE")), false);
  assert.equal(isOpenTask(task("REQUIRED_UNAVAILABLE")), false);

  assert.equal(normalizeTaskStatus("invalid"), undefined);
  assert.equal(normalizeTaskStatus("blocked"), undefined);
  assert.equal(normalizeTaskStatus("not-applicable"), undefined);

  assert.deepEqual(taskStatuses, [
    "not-started",
    "in-progress",
    "waiting-on-customer",
    "required-unavailable",
    "completed",
  ]);

  assert.equal(matchesTaskFilter(task("NOT_STARTED"), "not-started", undefined, "UTC"), true);
  assert.equal(matchesTaskFilter(task("IN_PROGRESS"), "in-progress", undefined, "UTC"), true);
  assert.equal(matchesTaskFilter(task("WAITING_ON_CUSTOMER"), "waiting-on-customer", undefined, "UTC"), true);
  assert.equal(matchesTaskFilter(task("REQUIRED_UNAVAILABLE"), "required-unavailable", undefined, "UTC"), true);
  assert.equal(matchesTaskFilter(task("COMPLETED"), "completed", undefined, "UTC"), true);

  assert.equal(normalizeTaskStatus("overdue"), undefined);
  assert.equal(normalizeTaskDue("overdue"), "overdue");
});

test("due today uses organization-local day boundaries when UTC dates differ", () => {
  const now = new Date("2026-09-06T02:00:00Z");
  assert.equal(matchesTaskFilter(task("NOT_STARTED", "2026-09-06T01:00:00Z"), undefined, "today", "America/New_York", now), true);
  assert.equal(matchesTaskFilter(task("NOT_STARTED", "2026-09-06T05:00:00Z"), undefined, "today", "America/New_York", now), false);
  assert.equal(matchesTaskFilter(task("NOT_STARTED", "2026-09-05T01:00:00Z"), undefined, "overdue", "America/New_York", now), true);
  assert.equal(matchesTaskFilter(task("COMPLETED", "2026-09-05T01:00:00Z"), undefined, "overdue", "America/New_York", now), false);
});

test("case aggregate filters match dashboard workflow groups and reject invalid values", () => {
  assert.equal(matchesCaseFilter(liveCase("REVIEW"), "in-progress"), true);
  assert.equal(matchesCaseFilter(liveCase("COMPLETED"), "completed"), true);
  assert.equal(matchesCaseFilter(liveCase("CLOSED"), "completed"), false);
  assert.equal(matchesCaseFilter(liveCase("CANCELLED"), "active"), false);
  assert.equal(normalizeCaseStatus("invalid"), undefined);
});
