import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");
const repository = source("lib/data/rule-task-synchronization.ts");
const migration = source(
  "supabase/migrations/20260909123000_dm3oi_fix_rule_evaluation_service_role_privileges.sql",
);

test("trusted Rule-state reads use explicit, scoped column contracts", () => {
  assert.doesNotMatch(repository, /\.from\("case_questions"\)\s*\.select\("\*"\)/);
  assert.doesNotMatch(repository, /\.from\("case_question_responses"\)\s*\.select\("\*"\)/);
  assert.match(repository, /\.from\("case_questions"\)[\s\S]*?\.select\("id,organization_id,case_id,question_definition_id,question_text,description,response_type,required,display_order,options_snapshot"\)[\s\S]*?\.eq\("organization_id", organizationId\)[\s\S]*?\.in\("case_id", caseIds\)/);
  assert.match(repository, /\.from\("case_question_responses"\)[\s\S]*?\.select\("case_question_id,response_value"\)[\s\S]*?\.eq\("organization_id", organizationId\)[\s\S]*?\.in\("case_id", caseIds\)/);
  assert.match(repository, /\.from\("rule_definitions"\)[\s\S]*?\.eq\("organization_id", organizationId\)[\s\S]*?\.eq\("active", true\)[\s\S]*?\.order\("display_order"\)/);
  assert.match(repository, /\.from\("rule_actions"\)[\s\S]*?\.eq\("organization_id", organizationId\)[\s\S]*?\.is\("retired_at", null\)[\s\S]*?\.order\("display_order"\)/);
  assert.match(repository, /\.from\("question_options"\)[\s\S]*?\.eq\("organization_id", organizationId\)/);
});

test("corrective migration grants only explicit Rule-evaluation columns to service_role", () => {
  for (const table of [
    "case_questions",
    "case_question_responses",
    "rule_definitions",
    "rule_actions",
    "question_options",
  ]) {
    assert.match(migration, new RegExp(`grant select \\([\\s\\S]*?\\) on table public\\.${table} to service_role`));
    assert.doesNotMatch(migration, new RegExp(`grant select on (?:table )?public\\.${table} to service_role`));
  }
  assert.doesNotMatch(migration, /to (?:authenticated|anon|public)\b/i);
  assert.doesNotMatch(migration, /grant all|grant usage on schema|create policy|alter policy|disable row level security/i);
  assert.doesNotMatch(migration, /create(?: or replace)? view|organization_rule_definitions|organization_rule_actions/);
});
