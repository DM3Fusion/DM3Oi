import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260930224500_dm3oi_fix_finalizer_case_question_ambiguity.sql",
  "utf8",
);

test("finalizer does not shadow case_question_id conflict column", () => {
  assert.doesNotMatch(migration, /\bcase_question_id uuid;/);
  assert.match(migration, /\bcase_question_snapshot_id uuid;/);
  assert.match(
    migration,
    /select question\.id into case_question_snapshot_id/,
  );
  assert.match(
    migration,
    /on conflict\(case_question_id\) do update/,
  );
});

test("renamed snapshot ID is used for response persistence and activity", () => {
  assert.match(
    migration,
    /target_organization_id,item\.id,case_question_snapshot_id,/,
  );
  assert.match(
    migration,
    /jsonb_build_object\('case_question_id',case_question_snapshot_id\)/,
  );
});

test("completed follow-up history and Case-worker authorization remain preserved", () => {
  assert.match(migration, /'WORK_CASES'/);
  assert.match(migration, /public\.can_access_case\(/);
  assert.match(
    migration,
    /not coalesce\(\(follow_up->>'completed'\)::boolean,false\)/,
  );
});
