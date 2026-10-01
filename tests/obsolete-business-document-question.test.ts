import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261002006000_dm3oi_retire_obsolete_business_document_question.sql",
  "utf8",
);

test("obsolete business document receipt Question is retired, not deleted", () => {
  assert.match(
    migration,
    /7668caec-7f75-46c2-8349-cd2611bcbf2b/,
  );
  assert.match(
    migration,
    /Have required business income and expense records been received\?/,
  );
  assert.match(
    migration,
    /active = false/,
  );
  assert.doesNotMatch(
    migration,
    /delete\s+from\s+public\.question_definitions/i,
  );
});

test("obsolete business receipt Rule path is retired", () => {
  assert.match(
    migration,
    /Require business records when business income is involved/,
  );
  assert.match(
    migration,
    /action\.retired_at is null/,
  );
  assert.match(
    migration,
    /set active = false/,
  );
});

test("corrective migration preserves the self-employment source Question", () => {
  assert.doesNotMatch(
    migration,
    /update public\.question_definitions[\s\S]*9a13d83d-f731-4dd2-8d59-b5ba63cb243c[\s\S]*active = false/,
  );
});
