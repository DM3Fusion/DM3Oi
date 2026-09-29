import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALL_CASE_LIFECYCLE_STATUSES,
  CANONICAL_ACTIVE_CASE_STATUSES,
  CANONICAL_COMPLETED_CASE_STATUSES,
  HISTORICAL_NON_CANONICAL_CASE_STATUSES,
  INCOMPLETE_COMPATIBILITY_CASE_STATUSES,
  LEGACY_INCOMPLETE_CASE_STATUSES,
  isCanonicalActiveCaseStatus,
  isCanonicalCompletedCaseStatus,
  isHistoricalNonCanonicalCaseStatus,
  isGenericCaseTransitionAllowed,
  isIncompleteCompatibilityCaseStatus,
  isLegacyIncompleteCaseStatus,
} from "../lib/case-lifecycle.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source(
  "supabase/migrations/20260928120000_dm3oi_canonical_case_lifecycle.sql",
);

test("canonical lifecycle distinguishes active work from explicit completion", () => {
  assert.deepEqual(CANONICAL_ACTIVE_CASE_STATUSES, ["IN_PROGRESS", "WAITING"]);
  assert.deepEqual(CANONICAL_COMPLETED_CASE_STATUSES, ["COMPLETED"]);
  assert.equal(isCanonicalActiveCaseStatus("IN_PROGRESS"), true);
  assert.equal(isCanonicalActiveCaseStatus("WAITING"), true);
  assert.equal(isCanonicalActiveCaseStatus("COMPLETED"), false);
  assert.equal(isCanonicalCompletedCaseStatus("COMPLETED"), true);
  assert.equal(isCanonicalCompletedCaseStatus("CLOSED"), false);
  assert.equal(isCanonicalCompletedCaseStatus("CANCELLED"), false);
});

test("legacy active statuses remain incomplete compatibility states", () => {
  assert.deepEqual(LEGACY_INCOMPLETE_CASE_STATUSES, [
    "NEW",
    "UNASSIGNED",
    "ASSIGNED",
    "REVIEW",
  ]);
  assert.deepEqual(INCOMPLETE_COMPATIBILITY_CASE_STATUSES, [
    "NEW",
    "UNASSIGNED",
    "ASSIGNED",
    "REVIEW",
    "IN_PROGRESS",
    "WAITING",
  ]);
  for (const status of LEGACY_INCOMPLETE_CASE_STATUSES) {
    assert.equal(isLegacyIncompleteCaseStatus(status), true);
    assert.equal(isIncompleteCompatibilityCaseStatus(status), true);
  }
  assert.deepEqual(HISTORICAL_NON_CANONICAL_CASE_STATUSES, [
    "CLOSED",
    "CANCELLED",
  ]);
  assert.equal(isHistoricalNonCanonicalCaseStatus("CLOSED"), true);
  assert.equal(isHistoricalNonCanonicalCaseStatus("CANCELLED"), true);
  assert.equal(isIncompleteCompatibilityCaseStatus("CLOSED"), false);
  assert.equal(isIncompleteCompatibilityCaseStatus("CANCELLED"), false);
});

test("the complete historical enum remains available without a destructive rewrite", () => {
  assert.deepEqual(ALL_CASE_LIFECYCLE_STATUSES, [
    "NEW",
    "UNASSIGNED",
    "ASSIGNED",
    "IN_PROGRESS",
    "WAITING",
    "REVIEW",
    "COMPLETED",
    "CLOSED",
    "CANCELLED",
  ]);
  assert.match(
    source("supabase/migrations/20260903150000_dm3iqcm_data_foundation.sql"),
    /case_status as enum \('NEW','UNASSIGNED','ASSIGNED','IN_PROGRESS','WAITING','REVIEW','COMPLETED','CLOSED','CANCELLED'\)/,
  );
  assert.doesNotMatch(migration, /alter type public\.case_status|drop type|delete from public\.cases/);
  assert.doesNotMatch(
    migration,
    /update public\.cases\s+set status\s*=\s*'IN_PROGRESS'[^;]*where status/i,
  );
});

test("new Case creation stores IN_PROGRESS independently of assignment", () => {
  assert.match(
    migration,
    /alter table public\.cases\s+alter column status set default 'IN_PROGRESS'::public\.case_status/,
  );
  assert.match(
    migration,
    /before insert on public\.cases[\s\S]*enforce_canonical_case_creation_status/,
  );
  assert.match(
    migration,
    /new\.status in \('NEW', 'UNASSIGNED', 'ASSIGNED', 'REVIEW'\)[\s\S]*new\.status := 'IN_PROGRESS'/,
  );
  assert.match(
    migration,
    /new\.status not in \('IN_PROGRESS', 'WAITING'\)[\s\S]*new Cases must start in a canonical active status/,
  );
});

test("generic status transition cannot complete a Case", () => {
  const start = migration.indexOf(
    "create or replace function public.transition_case_status(",
  );
  const end = migration.indexOf("end\n$$;", start);
  const transition = migration.slice(start, end);
  assert.match(
    transition,
    /target_status not in \('IN_PROGRESS', 'WAITING'\)/,
  );
  assert.match(
    transition,
    /item\.status not in \(\s*'NEW',\s*'UNASSIGNED',\s*'ASSIGNED',\s*'REVIEW',\s*'IN_PROGRESS',\s*'WAITING'\s*\)/,
  );
  assert.match(
    transition,
    /terminal and historical Cases require a dedicated transition workflow/,
  );
  assert.match(transition, /has_effective_organization_permission\([\s\S]*'WORK_CASES'/);
  assert.match(transition, /can_manage_case[\s\S]*can_access_case/);
  assert.doesNotMatch(transition, /target_status\s*=\s*'COMPLETED'/);
  assert.doesNotMatch(transition, /CASE_COMPLETED/);
  assert.doesNotMatch(transition, /CASE_REOPENED/);
  assert.match(
    migration,
    /guard_case_completion remains installed for historical\/direct compatibility/,
  );
});

test("generic transitions accept incomplete compatibility sources only", () => {
  for (const sourceStatus of [
    "NEW",
    "UNASSIGNED",
    "ASSIGNED",
    "REVIEW",
  ] as const) {
    assert.equal(
      isGenericCaseTransitionAllowed(sourceStatus, "IN_PROGRESS"),
      true,
      `${sourceStatus} -> IN_PROGRESS`,
    );
  }

  assert.equal(
    isGenericCaseTransitionAllowed("IN_PROGRESS", "WAITING"),
    true,
  );
  assert.equal(
    isGenericCaseTransitionAllowed("WAITING", "IN_PROGRESS"),
    true,
  );

  for (const sourceStatus of ["COMPLETED", "CLOSED", "CANCELLED"] as const) {
    assert.equal(
      isGenericCaseTransitionAllowed(sourceStatus, "IN_PROGRESS"),
      false,
      `${sourceStatus} -> IN_PROGRESS`,
    );
    assert.equal(
      isGenericCaseTransitionAllowed(sourceStatus, "WAITING"),
      false,
      `${sourceStatus} -> WAITING`,
    );
  }

  for (const sourceStatus of INCOMPLETE_COMPATIBILITY_CASE_STATUSES) {
    assert.equal(
      isGenericCaseTransitionAllowed(sourceStatus, "COMPLETED"),
      false,
      `${sourceStatus} -> COMPLETED`,
    );
  }
});

test("application transition boundaries expose only canonical active targets", () => {
  const page = source("app/cases/[caseId]/page.tsx");
  const actions = source("lib/data/case-actions.ts");
  assert.match(page, /CANONICAL_ACTIVE_CASE_STATUSES\.map/);
  assert.match(
    page,
    /canWorkCases && isIncompleteCompatibilityCaseStatus\(item\.status\)/,
  );
  assert.doesNotMatch(page, /const statuses = \[/);
  assert.match(actions, /isCanonicalActiveCaseStatus\(status\)/);
  assert.match(actions, /Select an active Case status\./);
});

test("Case Questions remain read-only outside the future canonical edit flow", () => {
  const questions = source("components/cases/case-questions.tsx");
  assert.doesNotMatch(
    questions,
    /saveCaseResponseAction|question-response-form|<form/,
  );
  assert.match(questions, /Validated response/);
});
