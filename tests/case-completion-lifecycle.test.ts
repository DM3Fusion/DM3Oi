import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(
  "app/cases/[caseId]/page.tsx",
  "utf8",
);

const modal = fs.readFileSync(
  "components/cases/case-completion-modal.tsx",
  "utf8",
);

const actions = fs.readFileSync(
  "lib/data/case-actions.ts",
  "utf8",
);

const migration = fs.readFileSync(
  "supabase/migrations/20260930234500_dm3oi_tax_outcome_case_completion.sql",
  "utf8",
);

test("ready Case exposes Tax Prep Outcome completion modal", () => {
  assert.match(page, /canCompleteCase/);
  assert.match(page, /CaseCompletionModal/);
  assert.match(modal, /Tax Prep Outcome/);
  assert.match(modal, /REFUND/);
  assert.match(modal, /BALANCE_DUE/);
  assert.match(modal, /ZERO_BALANCE/);
});

test("completion action requires WORK_CASES and tax outcome", () => {
  assert.match(actions, /requirePermission\("WORK_CASES"\)/);
  assert.match(actions, /taxOutcome/);
  assert.match(actions, /target_tax_outcome: taxOutcome/);
  assert.match(actions, /\.rpc\("complete_case"/);
});

test("completion persists authoritative outcome and audit metadata", () => {
  assert.match(migration, /add column tax_outcome text/);
  assert.match(migration, /set[\s\S]*tax_outcome=target_tax_outcome/);
  assert.match(migration, /status='COMPLETED'/);
  assert.match(migration, /'CASE_COMPLETED'/);
  assert.match(migration, /'tax_outcome',target_tax_outcome/);
});

test("database completion enforces blocking Task readiness", () => {
  assert.match(migration, /task\.blocking/);
  assert.match(migration, /task\.status<>'COMPLETED'/);
  assert.match(
    migration,
    /All blocking Tasks must be completed before completing the Case/,
  );
});

test("completed Cases are database-enforced read-only", () => {
  assert.match(migration, /guard_completed_case_immutability/);
  assert.match(migration, /Completed Cases are read-only/);
  assert.match(migration, /case_tasks_completed_case_read_only/);
  assert.match(migration, /case_assignments_completed_case_read_only/);
  assert.match(
    migration,
    /case_question_responses_completed_case_read_only/,
  );
});

test("completed Case task editor is hidden in staff UI", () => {
  assert.match(page, /caseReadOnly = item\.status === "COMPLETED"/);
  assert.match(page, /task-record\$\{caseReadOnly \? " read-only" : ""\}/);
});
