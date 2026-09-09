import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getEffectiveOrganizationPermissions } from "../lib/auth/permissions.ts";
import { normalizeRuleQuery, normalizeRuleStatus, ruleMatchesSearch } from "../lib/rule-filters.ts";

const source=(path:string)=>readFileSync(path,"utf8");
const migration=source("supabase/migrations/20260907150000_dm3oi_rule_builder.sql");
const normalizationMigration=source("supabase/migrations/20260908183000_dm3oi_fix_rule_action_normalization.sql");
const foundation=source("supabase/migrations/20260907143000_dm3oi_rules_data_foundation.sql");
const page=source("app/questions/page.tsx");
const builder=source("components/rule-builder.tsx");
const action=source("lib/data/rule-actions.ts");
const repository=source("lib/data/rule-repository.ts");

test("combined workspace is URL-driven and enforces distinct server permissions",()=>{
  assert.match(page,/query\.view==="rules"/);assert.match(page,/VIEW_QUESTIONS/);assert.match(page,/VIEW_RULES/);assert.match(page,/notFound\(\)/);
  assert.match(page,/href="\/questions\?view=questions"/);assert.match(page,/href="\/questions\?view=rules"/);
  assert.match(page,/hasPermission\(access,"MANAGE_RULES"\)[\s\S]*<RuleBuilder/);
  assert.equal(getEffectiveOrganizationPermissions("STAFF_MANAGER").has("VIEW_RULES"),true);
  assert.equal(getEffectiveOrganizationPermissions("STAFF_MANAGER").has("MANAGE_RULES"),false);
  assert.equal(getEffectiveOrganizationPermissions("STAFF_USER").has("VIEW_RULES"),false);
  assert.equal(getEffectiveOrganizationPermissions("PUBLIC_USER").has("VIEW_RULES"),false);
});

test("Rule search is trimmed, status-aware, partial, and case-insensitive",()=>{
  assert.equal(normalizeRuleQuery("  Lane  "),"Lane");assert.equal(normalizeRuleStatus("invalid"),"all");
  const rule={name:"Lane Closure",description:"Authorization",summary:"CREATE TASK Permit",active:true};
  assert.equal(ruleMatchesSearch(rule,"closure","all"),true);assert.equal(ruleMatchesSearch(rule,"permit","active"),true);assert.equal(ruleMatchesSearch(rule,"PERMIT","inactive"),false);
  const filters=source("components/rule-filters.tsx");assert.match(filters,/setTimeout\(\(\)=>update\(next\),300\)/);assert.match(filters,/params\.set\("view","rules"\)/);assert.match(filters,/Clear Rule search/);
});

test("builder exposes only type-compatible operators and stable option IDs",()=>{
  for(const value of ["IS_YES","IS_NO","EQUALS","NOT_EQUALS","CONTAINS","NOT_CONTAINS","IS_ANSWERED","IS_NOT_ANSWERED"])assert.match(builder,new RegExp(`value:\"${value}\"`));
  assert.match(builder,/optionOperators\.has\(operator\)/);assert.match(builder,/value=\{option\.id\}/);assert.doesNotMatch(action,/conditionOptionLabel/);
  assert.match(migration,/target_condition_option_id uuid/);assert.match(foundation,/validate_rule_condition/);
});

test("builder supports ordered multi-actions and complete task templates",()=>{
  for(const value of ["SHOW_QUESTION","REQUIRE_QUESTION","CREATE_TASK"])assert.match(builder,new RegExp(`value=\"${value}\"`));
  for(const label of ["Question to Show","Question to Require","Task Title","Task Description","Priority","Required","Blocking","＋ Add Action","Remove"])assert.match(builder,new RegExp(label));
  assert.match(migration,/jsonb_array_elements\(target_actions\) with ordinality/);assert.match(migration,/action_order-1/);assert.match(migration,/task_blocking boolean/);
  assert.match(migration,/update public\.rule_actions set task_blocking=false where action_type='CREATE_TASK'/);
  assert.doesNotMatch(migration,/insert into public\.case_tasks/);
});

test("forward-only RPC normalization keeps task fields exclusive to CREATE_TASK",()=>{
  assert.match(normalizationMigration,/create or replace function public\.save_rule_definition\(/);
  assert.match(normalizationMigration,/case when action_type in \('SHOW_QUESTION','REQUIRE_QUESTION'\) then nullif\(action->>'target_question_id',''\)::uuid else null end/);
  for(const field of ["task_title","task_description","task_priority","task_required","task_blocking"])
    assert.match(normalizationMigration,new RegExp(`case when action_type='CREATE_TASK'[\\s\\S]{0,100}action->>'${field}'`));
  assert.match(normalizationMigration,/grant execute on function public\.save_rule_definition\(uuid,uuid,text,text,uuid,public\.rule_condition_operator,uuid,boolean,integer,jsonb,timestamptz\) to authenticated/);
  const databaseTest=source("supabase/tests/rule_builder.sql");
  assert.match(databaseTest,/REQUIRE_QUESTION normalizes every task-only field to NULL/);
  assert.match(databaseTest,/SHOW_QUESTION normalizes every task-only field to NULL/);
  assert.match(databaseTest,/CREATE_TASK preserves task fields and normalizes its target Question to NULL/);
  assert.match(databaseTest,/failed Rule saves roll back definitions atomically/);
});

test("atomic RPC is tenant scoped, permission checked, and optimistic",()=>{
  assert.match(action,/requirePermission\("MANAGE_RULES"\)/);assert.match(action,/target_organization_id: access\.activeOrganization\.id/);assert.doesNotMatch(action,/form, "organizationId"/);
  assert.match(migration,/has_effective_organization_permission\(target_organization_id,'MANAGE_RULES'\)/);
  assert.match(migration,/where id=target_rule_id and organization_id=target_organization_id for update/);
  assert.match(migration,/item\.updated_at<>expected_updated_at[\s\S]*rule configuration changed/);
  assert.match(migration,/delete from public\.rule_actions[\s\S]*insert into public\.rule_actions/);
  assert.match(migration,/perform public\.assert_rule_graph_acyclic\(target_organization_id\)/);
  assert.match(migration,/revoke all on function[\s\S]*from public,anon/);assert.match(migration,/grant execute on function public\.save_rule_definition[\s\S]*to authenticated/);
});

test("source, option, target, and Rule mutations remain organization constrained",()=>{
  assert.match(migration,/q\.id=target_source_question_id and q\.organization_id=target_organization_id/);
  assert.match(migration,/q\.id=target_question and q\.organization_id=target_organization_id/);
  assert.match(migration,/id=action_id and organization_id=target_organization_id and rule_definition_id=item\.id/);
  assert.match(repository,/\.eq\("organization_id", organizationId\)/);
  assert.match(builder,/question\.id!==source/);assert.match(migration,/target_question=item\.source_question_id/);
});

test("recursive cycles are checked only across active Question actions",()=>{
  assert.match(migration,/with recursive edges/);assert.match(migration,/r\.active/);assert.match(migration,/a\.action_type in \('SHOW_QUESTION','REQUIRE_QUESTION'\)/);
  assert.match(migration,/source_question_id=target_question_id/);assert.match(migration,/active rule dependency cycle detected/);
  assert.match(migration,/deferrable initially deferred/);assert.doesNotMatch(migration,/a\.action_type[^\n]*CREATE_TASK/);
});

test("inactive references remain inspectable while new selections require active Questions",()=>{
  assert.match(builder,/q\.active\|\|q\.id===rule\?\.source_question_id/);assert.match(builder,/question\.active\|\|question\.id===current/);
  assert.match(migration,/select an active source question/);assert.match(migration,/select an active target question/);
});

test("referenced option removal returns focused guidance without weakening RESTRICT",()=>{
  const questionAction=source("lib/data/question-actions.ts");assert.match(questionAction,/rule_definitions_condition_option_fkey/);assert.match(questionAction,/option is used by a Rule/);
  assert.match(foundation,/rule_definitions_condition_option_fkey[\s\S]*on delete restrict/);
});

test("04B stays configuration-only",()=>{
  assert.doesNotMatch(action+repository+page,/case_tasks|Case Readiness|case applicability|evaluateRule|create_notification|sendEmail/);
  assert.doesNotMatch(migration,/insert into public\.case_tasks|update public\.cases|case_progress|create_notification/);
});

test("Questions heading and shared sidebar label retain the polished 04B presentation",()=>{
  const page=source("app/questions/page.tsx");
  const shell=source("components/layout/app-shell.tsx");
  const css=source("app/globals.css");
  assert.match(page,/title=\{view==="rules"\?"Rules":"Questions"\}/);
  assert.match(page,/Define the information required for new organization cases\./);
  assert.doesNotMatch(page,/Questions & Responses/);
  assert.match(shell,/label: "Questions & Rules"/);
  assert.match(css,/\.sidebar nav\{padding-inline:0\}/);
  assert.match(css,/\.sidebar nav a\{min-height:39px;gap:10px;padding:7px 8px;font-size:16px/);
  assert.match(css,/\.sidebar nav a\.active\{background:#0b3558;box-shadow:inset 3px 0 #22c1cf;color:#fff\}/);
});
