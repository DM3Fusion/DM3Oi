import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migration = fs.readFileSync(
  "supabase/migrations/20260926233000_dm3oi_retire_duplicate_mimms_intake_questions.sql",
  "utf8",
);

test("Mimms duplicate intake questions are retired without deleting history", () => {
  assert.match(
    migration,
    /c8e0016d-4172-4627-995c-331c78b10d14/,
  );
  assert.match(
    migration,
    /a74527d6-9cb7-4f6d-ac3c-e5a6ed259ac4/,
  );

  assert.match(migration, /active\s*=\s*false/i);
  assert.match(migration, /question_group\s*=\s*null/i);

  assert.doesNotMatch(
    migration,
    /delete\s+from\s+public\.question_definitions/i,
  );
  assert.doesNotMatch(
    migration,
    /delete\s+from\s+public\.question_options/i,
  );
});

test("Mimms duplicate intake retirement remains organization scoped", () => {
  assert.match(
    migration,
    /e5a00c5a-f028-47f8-bb34-5527219eb995/,
  );
  assert.match(
    migration,
    /where\s+organization_id\s*=\s*target_organization_id/i,
  );
});
