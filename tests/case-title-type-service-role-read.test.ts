import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260927002000_dm3oi_case_title_type_service_role_read.sql",
  "utf8",
);

const loader = readFileSync(
  "lib/data/guided-case-intake.ts",
  "utf8",
);

test("Guided Intake no longer depends on Case Title compatibility mappings", () => {
  assert.doesNotMatch(
    loader,
    /organization_case_title_type_mappings/,
  );

  assert.match(
    migration,
    /grant select\s+on table public\.organization_case_title_type_mappings\s+to service_role;/,
  );
});

test("mapping privilege hotfix remains read-only for service_role", () => {
  assert.doesNotMatch(
    migration,
    /^\s*grant\s+(?:insert|update|delete|all)/im,
  );

  assert.doesNotMatch(
    migration,
    /^\s*grant[\s\S]*?\bto\s+(?:anon|authenticated)\s*;/im,
  );
});
