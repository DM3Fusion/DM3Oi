import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(
  "app/cases/[caseId]/page.tsx",
  "utf8",
);

const actions = fs.readFileSync(
  "lib/data/case-actions.ts",
  "utf8",
);

const migration = fs.readFileSync(
  "supabase/migrations/20260930233000_dm3oi_complete_ready_case.sql",
  "utf8",
);

test("Complete Case appears only for ready finalized active Cases", () => {
  assert.match(page, /const canCompleteCase =/);
  assert.match(page, /canWorkCases/);
  assert.match(page, /isCanonicalActiveCaseStatus\(item\.status\)/);
  assert.match(page, /Boolean\(finalizedIntakeResult\.data\)/);
  assert.match(page, /item\.progress\.ready/);
});

test("Case readiness exposes deliberate completion confirmation", () => {
  assert.match(page, /Complete Case/);
  assert.match(page, /Confirm Case Completion/);
  assert.match(page, /all work performed outside DM3Oi/);
  assert.match(page, /action=\{completeCaseAction\}/);
});

test("server action requires WORK_CASES and uses dedicated RPC", () => {
  assert.match(actions, /export async function completeCaseAction/);
  assert.match(actions, /requirePermission\("WORK_CASES"\)/);
  assert.match(actions, /\.rpc\("complete_case"/);
});

test("database requires Case access and finalized Guided Intake", () => {
  assert.match(
    migration,
    /has_effective_organization_permission\([\s\S]*'WORK_CASES'/,
  );
  assert.match(migration, /public\.can_access_case/);
  assert.match(migration, /draft\.finalized_at is not null/);
});

test("completion remains protected by existing completion trigger", () => {
  assert.match(migration, /set status='COMPLETED'/);
  assert.match(migration, /CASE_COMPLETED/);
  assert.match(migration, /cases_completion_guard remains authoritative/);
});
