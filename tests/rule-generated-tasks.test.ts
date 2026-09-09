import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/20260908190000_dm3oi_rule_generated_tasks.sql");

test("Rule-generated Task provenance is tenant-bound, restrictive, and unique per Case and action", () => {
  assert.match(migration, /foreign key\(organization_id,source_rule_id,source_rule_action_id\)[\s\S]*references public\.rule_actions\(organization_id,rule_definition_id,id\)[\s\S]*on delete restrict/);
  assert.match(migration, /unique index case_tasks_rule_action_lineage_uidx[\s\S]*\(organization_id,case_id,source_rule_action_id\)[\s\S]*where source_rule_action_id is not null/);
  assert.match(migration, /where id=target_case_id and organization_id=target_organization_id for update/);
  assert.match(migration, /on conflict\(organization_id,case_id,source_rule_action_id\)[\s\S]*do nothing/);
});

test("Rule Action identities survive edits while removals retain historical provenance", () => {
  assert.match(migration, /add column retired_at timestamptz/);
  assert.match(migration, /update public\.rule_actions current_action set retired_at=now\(\)/);
  assert.match(migration, /if existing_action\.id is not null then[\s\S]*update public\.rule_actions set[\s\S]*where id=action_id/);
  assert.match(migration, /where a\.retired_at is null/);
  assert.match(migration, /submitted->>'action_type'\)::public\.rule_action_type=current_action\.action_type/);
});

test("Task lifecycle is idempotent, restores unfinished work, and preserves completed and manual Tasks", () => {
  assert.match(migration, /status=coalesce\(prior_actionable_status,'NOT_STARTED'\),prior_actionable_status=null/);
  assert.match(migration, /set prior_actionable_status=status,status='NOT_APPLICABLE'/);
  assert.match(migration, /status in \('NOT_STARTED','IN_PROGRESS','BLOCKED'\)/);
  assert.match(migration, /source_rule_action_id is not null/);
  assert.doesNotMatch(migration, /status in \([^)]*COMPLETED[^)]*\)/);
  assert.match(migration, /if existing\.source_rule_action_id is not null then raise exception 'rule-generated tasks retain history'/);
});

test("trusted synchronization reads templates from the database and is service-role-only", () => {
  assert.match(migration, /create function public\.synchronize_case_rule_tasks\(/);
  assert.match(migration, /from public\.rule_actions a[\s\S]*join public\.rule_definitions r on r\.organization_id=a\.organization_id and r\.id=a\.rule_definition_id/);
  assert.match(migration, /a\.task_title,a\.task_description,a\.task_priority,a\.task_required,a\.task_blocking/);
  assert.match(migration, /revoke all on function public\.synchronize_case_rule_tasks\(uuid,uuid,uuid\[\],uuid\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.synchronize_case_rule_tasks\(uuid,uuid,uuid\[\],uuid\) to service_role/);
});

test("authoritative response and Rule mutations synchronize Tasks while Case rendering remains read-only", () => {
  const responseActions = source("lib/data/question-actions.ts");
  const ruleActions = source("lib/data/rule-actions.ts");
  const caseActions = source("lib/data/case-actions.ts");
  const repository = source("lib/data/question-repository.ts");
  const page = source("app/cases/[caseId]/page.tsx");
  assert.match(responseActions, /save_case_question_response[\s\S]*synchronizeCaseRuleTasks/);
  assert.match(responseActions, /organizationId: saved\.organization_id[\s\S]*caseId: saved\.case_id/);
  assert.match(ruleActions, /save_rule_definition[\s\S]*synchronizeOrganizationRuleTasks/);
  assert.match(caseActions, /create_case_workflow[\s\S]*organizationId: createdCase\.organization_id[\s\S]*caseId: createdCase\.id/);
  assert.doesNotMatch(repository + page, /synchronizeCaseRuleTasks|synchronizeOrganizationRuleTasks|synchronize_case_rule_tasks/);
});

test("Rule lifecycle activity is transition-only and business-facing labels expose no Rule UUID", () => {
  const activity = source("lib/activity-format.ts");
  assert.match(migration, /returning \* into changed;[\s\S]*if changed\.id is not null then[\s\S]*'RULE_TASK_CREATED'/);
  assert.match(migration, /update public\.case_tasks set status=coalesce[\s\S]*returning \*[\s\S]*'RULE_TASK_REACTIVATED'/);
  assert.match(migration, /update public\.case_tasks set prior_actionable_status=status[\s\S]*returning \*[\s\S]*'RULE_TASK_NOT_APPLICABLE'/);
  assert.match(activity, /RULE_TASK_CREATED:"Rule-generated task created"/);
  assert.match(activity, /RULE_TASK_NOT_APPLICABLE:"Rule-generated task became not applicable"/);
  assert.match(activity, /RULE_TASK_REACTIVATED:"Rule-generated task reactivated"/);
  assert.doesNotMatch(activity, /source_rule_id|source_rule_action_id/);
});

test("Case UI identifies generated Tasks without exposing their provenance IDs", () => {
  const page = source("app/cases/[caseId]/page.tsx");
  assert.match(page, /task\.generated_by_rule[\s\S]*Generated by Rule/);
  assert.doesNotMatch(page, /source_rule_id|source_rule_action_id/);
});
