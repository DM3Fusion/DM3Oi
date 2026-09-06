import test from "node:test";
import assert from "node:assert/strict";
import type { LiveCase, TaskRow } from "../lib/data/case-repository.ts";
import { isOpenTask, matchesCaseFilter, matchesTaskFilter, normalizeCaseStatus, normalizeTaskStatus } from "../lib/operational-filters.ts";

const task = (status: TaskRow["status"], due_at: string | null = null) => ({ status, due_at }) as TaskRow;
const liveCase = (status: LiveCase["status"]) => ({ status }) as LiveCase;

test("task filters match dashboard aggregate definitions and reject invalid values", () => {
  assert.equal(isOpenTask(task("NOT_STARTED")), true);
  assert.equal(isOpenTask(task("BLOCKED")), true);
  assert.equal(isOpenTask(task("COMPLETED")), false);
  assert.equal(isOpenTask(task("NOT_APPLICABLE")), false);
  assert.equal(normalizeTaskStatus("invalid"), undefined);
  assert.equal(matchesTaskFilter(task("BLOCKED"), "blocked", undefined, "UTC"), true);
});

test("due today uses organization-local day boundaries when UTC dates differ", () => {
  const now = new Date("2026-09-06T02:00:00Z");
  assert.equal(matchesTaskFilter(task("NOT_STARTED", "2026-09-06T01:00:00Z"), undefined, "today", "America/New_York", now), true);
  assert.equal(matchesTaskFilter(task("NOT_STARTED", "2026-09-06T05:00:00Z"), undefined, "today", "America/New_York", now), false);
});

test("case aggregate filters match dashboard workflow groups and reject invalid values", () => {
  assert.equal(matchesCaseFilter(liveCase("REVIEW"), "in-progress"), true);
  assert.equal(matchesCaseFilter(liveCase("CLOSED"), "completed"), true);
  assert.equal(matchesCaseFilter(liveCase("CANCELLED"), "active"), false);
  assert.equal(normalizeCaseStatus("invalid"), undefined);
});
