import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260927001000_dm3oi_delete_obsolete_mimms_questions.sql",
  "utf8",
);

test("obsolete Mimms Questions are deleted only through guarded organization-scoped migration", () => {
  assert.match(
    migration,
    /e5a00c5a-f028-47f8-bb34-5527219eb995/,
  );
  assert.match(
    migration,
    /name = 'Mimms'' Tax Service'/,
  );
  assert.match(
    migration,
    /target_count <> 16/,
  );
  assert.match(
    migration,
    /and q\.active/,
  );
  assert.match(
    migration,
    /delete from public\.question_definitions q[\s\S]*q\.organization_id = target_organization_id[\s\S]*q\.id = any\(target_question_ids\)/,
  );
  assert.match(
    migration,
    /deleted_count <> 16/,
  );
});

test("obsolete Mimms Question deletion fails closed on live dependencies", () => {
  assert.match(
    migration,
    /from public\.rule_definitions r[\s\S]*r\.source_question_id = any\(target_question_ids\)/,
  );
  assert.match(
    migration,
    /from public\.rule_actions a[\s\S]*a\.target_question_id = any\(target_question_ids\)/,
  );
  assert.match(
    migration,
    /from public\.case_tasks t[\s\S]*t\.intake_question_definition_id = any\(target_question_ids\)/,
  );
  assert.match(
    migration,
    /from public\.guided_case_intake_drafts d[\s\S]*d\.answers \? target_question_id::text[\s\S]*d\.required_option_ids \? target_question_id::text/,
  );
});

test("historical Case Question snapshots are explicitly preserved", () => {
  assert.match(
    migration,
    /select coalesce\(array_agg\(cq\.id\), '\{\}'::uuid\[\]\)/,
  );
  assert.match(
    migration,
    /update public\.case_questions cq[\s\S]*set question_definition_id = null[\s\S]*cq\.organization_id = target_organization_id[\s\S]*cq\.question_definition_id = any\(target_question_ids\)/,
  );
  assert.match(
    migration,
    /detached_snapshot_count <> cardinality\(snapshot_ids\)/,
  );
  assert.match(
    migration,
    /Historical Case Question snapshots were unexpectedly removed/,
  );
  assert.match(
    migration,
    /cq\.question_definition_id is not null/,
  );
  assert.match(
    migration,
    /Historical Case Question snapshots did not detach from deleted definitions/,
  );
});

test("exact obsolete Mimms Question identities are migration-owned", () => {
  const ids = [
    "c8e0016d-4172-4627-995c-331c78b10d14",
    "a74527d6-9cb7-4f6d-ac3c-e5a6ed259ac4",
    "f22f5767-9e3f-4cab-9eab-e2bf12fc89e4",
    "1f5c2dc2-d67c-475f-96af-398cf1635b2e",
    "f0d6133c-f974-41eb-8ed9-98e81f8b0123",
    "8866a609-3a86-490e-8fd0-ab153565598b",
    "87faefb5-5218-42f1-965a-0750699d8d4c",
    "68e99e88-2b12-4861-9bb3-3465bb12b5a2",
    "899e0116-dd59-4b05-b05a-76afba046c8d",
    "a6695ee1-b130-40e4-8003-e2db236b01f5",
    "b13be4e9-5e56-43cf-91ae-0a3e8e6dd537",
    "0f78f410-3735-4e26-9204-bb98a546f89b",
    "bea28c03-a676-457d-959a-8321087bae2e",
    "5b53bf52-8dd6-41f0-a210-3f22f673be0f",
    "6d43cdb6-7d3c-4a6f-98f4-c4ead152e450",
    "e5db03c9-71ba-4954-be75-51f71c9b3e34",
  ];

  assert.equal(ids.length, 16);

  for (const id of ids) {
    assert.match(migration, new RegExp(id));
  }
});
