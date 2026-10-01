import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260930214500_dm3oi_repair_and_lock_guided_intake_customer_mode.sql",
  "utf8",
);

test("unfinished materialized drafts are repaired from explicit Case Type semantics", () => {
  assert.match(migration, /case_type\.customer_mode = 'NEW' then 'new'/);
  assert.match(migration, /case_type\.customer_mode = 'EXISTING' then 'existing'/);
  assert.match(migration, /case_type\.customer_mode in \('NEW','EXISTING'\)/);
  assert.match(migration, /draft\.finalized_at is null/);
});

test("ANY Case Types do not rewrite historical Guided Intake mode", () => {
  assert.doesNotMatch(migration, /case_type\.customer_mode = 'ANY' then/);
});

test("materialized Guided Intake Customer mode cannot change", () => {
  assert.match(
    migration,
    /old\.case_id is not null[\s\S]*new\.customer_mode is distinct from old\.customer_mode/,
  );
  assert.match(
    migration,
    /Materialized Guided Intake Customer mode cannot change/,
  );
});
