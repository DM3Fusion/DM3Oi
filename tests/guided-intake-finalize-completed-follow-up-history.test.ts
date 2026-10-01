import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260930223000_dm3oi_finalize_completed_intake_follow_up_history.sql",
  "utf8",
);

test("finalizer allows empty missing-option history only for completed follow-up Tasks", () => {
  assert.match(
    migration,
    /not coalesce\(\(follow_up->>'completed'\)::boolean,false\)[\s\S]*jsonb_array_length\(follow_up->'missingOptionIds'\)=0/,
  );

  assert.doesNotMatch(
    migration,
    /jsonb_typeof\(follow_up->'missingOptionIds'\)<>'array'\s+or jsonb_array_length\(follow_up->'missingOptionIds'\)=0\s+or jsonb_typeof\(follow_up->'missingOptionLabels'\)<>'array'/,
  );
});

test("completed follow-up Tasks require a complete intake response", () => {
  assert.match(
    migration,
    /if completed and not\([\s\S]*public\.guided_intake_response_complete\(/,
  );

  assert.match(
    migration,
    /missing documents prevent follow-up Task completion/,
  );
});

test("latest Case-worker finalization authorization is preserved", () => {
  assert.match(migration, /'WORK_CASES'/);
  assert.match(migration, /public\.can_access_case\(/);
  assert.match(migration, /item\.status not in \('IN_PROGRESS','WAITING'\)/);
});
