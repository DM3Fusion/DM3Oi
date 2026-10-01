import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260930153000_dm3oi_guided_intake_task_completion_draft_state.sql",
  "utf8",
);

test("Guided Intake Task completion accepts the authoritative unfinished draft", () => {
  assert.match(
    migration,
    /from public\.guided_case_intake_drafts draft[\s\S]*draft\.case_id=new\.case_id[\s\S]*draft\.finalized_at is null/,
  );
  assert.match(
    migration,
    /draft\.answers->new\.intake_question_definition_id::text/,
  );
  assert.match(
    migration,
    /draft_answer \? missing\.value/,
  );
});

test("Guided Intake Task completion retains durable Case-response validation", () => {
  assert.match(
    migration,
    /from public\.case_questions question[\s\S]*join public\.case_question_responses response/,
  );
  assert.match(
    migration,
    /response\.response_value \? missing\.value/,
  );
  assert.match(
    migration,
    /missing documents prevent follow-up Task completion/,
  );
});

test("Task lifecycle completion metadata remains system managed", () => {
  assert.match(migration, /new\.completed_at:=now\(\)/);
  assert.match(
    migration,
    /new\.completed_by_user_id:=\s*coalesce\(auth\.uid\(\),new\.created_by_user_id\)/,
  );
  assert.match(migration, /new\.completed_at:=null/);
  assert.match(migration, /new\.completed_by_user_id:=null/);
});
