import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  "components/cases/guided-case-intake.tsx",
  "utf8",
);

const migration = readFileSync(
  "supabase/migrations/20260930154500_dm3oi_fix_guided_intake_task_assignee_ambiguity.sql",
  "utf8",
);

test("Guided Intake Due Date picker relinquishes focus after selection", () => {
  assert.match(
    component,
    /name="dueDate"[\s\S]*onChange=\{\(event\) => event\.currentTarget\.blur\(\)\}/,
  );
});

test("Guided Intake follow-up RPC uses a non-colliding assignee variable", () => {
  assert.match(
    migration,
    /follow_up_assigned_user_id uuid/,
  );
  assert.match(
    migration,
    /assigned_user_id=follow_up_assigned_user_id/,
  );
  assert.doesNotMatch(
    migration,
    /assigned_user_id=assigned_user_id/,
  );
});

test("Guided Intake follow-up RPC retains Case edit authorization", () => {
  assert.match(
    migration,
    /'WORK_CASES'/,
  );
  assert.match(
    migration,
    /public\.can_access_case/,
  );
});
