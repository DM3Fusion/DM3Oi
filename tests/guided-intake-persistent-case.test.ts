import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20260928130000_dm3oi_guided_intake_case_persistence.sql",
);
const actions = source("lib/data/guided-case-intake-actions.ts");
const component = source("components/cases/guided-case-intake.tsx");
const draftLoader = source("lib/data/guided-case-intake-drafts.ts");
const configurationLoader = source("lib/data/guided-case-intake.ts");
const lifecycle = source(
  "supabase/migrations/20260928120000_dm3oi_canonical_case_lifecycle.sql",
);

const materializeSql = migration.slice(
  migration.indexOf("create function public.materialize_guided_case_intake"),
  migration.indexOf("create function public.finalize_guided_case_intake"),
);
const finalizeSql = migration.slice(
  migration.indexOf("create function public.finalize_guided_case_intake"),
);

test("Step 1 and partial Step 2 remain non-Case client state", () => {
  assert.match(component, /if \(step === 1\)[\s\S]*materializeGuidedCaseAction/);
  assert.match(
    component,
    /const blockers = validateStep\(\);[\s\S]*if \(Object\.keys\(blockers\)\.length\)[\s\S]*return;[\s\S]*if \(step === 1\)/,
  );
  assert.doesNotMatch(component, /void materializeGuidedCaseAction|useEffect\([^)]*materializeGuidedCaseAction/);
});

test("validated Step 2 materializes one canonical active Case with real identity", () => {
  assert.match(actions, /export async function materializeGuidedCaseAction/);
  assert.match(actions, /\.rpc\(\s*"materialize_guided_case_intake"/);
  assert.match(materializeSql, /insert into public\.cases\(/);
  assert.match(materializeSql, /'IN_PROGRESS'/);
  assert.doesNotMatch(materializeSql, /'ASSIGNED'|'UNASSIGNED'/);
  assert.match(materializeSql, /at least one assigned staff member is required/);
  assert.match(materializeSql, /insert into public\.case_assignments/);
  assert.doesNotMatch(
    materializeSql.match(/insert into public\.cases\([\s\S]*?\) values\([\s\S]*?\)/)?.[0] ?? "",
    /case_number|opened_at/,
  );
});

test("database assigns and durably links Case identity at materialization", () => {
  assert.match(migration, /add column case_id uuid/);
  assert.match(
    migration,
    /foreign key \(organization_id,case_id\)[\s\S]*references public\.cases\(organization_id,id\)[\s\S]*on delete cascade/,
  );
  assert.match(migration, /guided_case_intake_drafts_case_uidx/);
  assert.match(
    materializeSql,
    /set case_id=materialized\.id,[\s\S]*current_step=greatest\(current_step,2\)/,
  );
  assert.match(component, /caseId: result\.caseId/);
  assert.match(draftLoader, /case_id[\s\S]*caseId: data\.case_id/);
  const preFunctionDdl = migration.slice(
    0,
    migration.indexOf("create function public.materialize_guided_case_intake"),
  );
  assert.doesNotMatch(preFunctionDdl, /update public\.cases|update public\.guided_case_intake_drafts/);
});

test("materialization retries and races converge without binding unrelated Cases", () => {
  assert.match(materializeSql, /pg_advisory_xact_lock/);
  assert.match(materializeSql, /cases[\s\S]*customer_id=target_customer_id[\s\S]*tax_year=target_tax_year[\s\S]*for update/);
  assert.match(materializeSql, /draft_row\.case_id is not null[\s\S]*return materialized/);
  assert.match(migration, /guided_case_intake_drafts_case_uidx/);
  assert.match(
    materializeSql,
    /materialized\.created_by_user_id<>actor[\s\S]*materialized\.intake_submission_key is distinct from target_submission_key[\s\S]*Customer already has an unrelated Case/,
  );
  assert.match(materializeSql, /Customer already has an unrelated Case for this tax year/);
  assert.match(migration, /cases_one_customer_per_tax_year|Customer\/Tax-Year key/);
});

test("materialized draft linkage and Case identity cannot be rebound", () => {
  assert.match(
    migration,
    /old\.case_id is not null[\s\S]*new\.case_id is distinct from old\.case_id[\s\S]*Materialized Guided Intake Case identity cannot change/,
  );
  assert.match(
    migration,
    /new\.customer_id is distinct from old\.customer_id[\s\S]*item\.id=old\.case_id[\s\S]*item\.customer_id=new\.customer_id/,
  );
  assert.match(migration, /Guided Intake Case linkage is server managed/);
  assert.match(migration, /Finalized Guided Intake sessions are immutable/);
  assert.match(actions, /\.delete\(\)[\s\S]*\.is\("case_id", null\)/);
});

test("Steps 3 through 6 retain one server-issued Case identity", () => {
  assert.match(component, /const identityLocked = Boolean\(draft\.caseId\) && index < 2/);
  assert.match(component, /Boolean\(draft\.caseId\) && step === 2/);
  assert.match(component, /finalizeGuidedCaseAction/);
  assert.match(actions, /if \(!draft\.caseId\)[\s\S]*Case has not been established/);
  assert.match(finalizeSql, /draft_row\.case_id is null[\s\S]*has not been materialized/);
  assert.match(
    draftLoader,
    /currentStep: data\.case_id[\s\S]*Math\.max\(2, data\.current_step\)[\s\S]*Math\.min\(1, data\.current_step\)/,
  );
});

test("Step 6 locks and populates the linked Case without inserting another", () => {
  assert.match(finalizeSql, /existing\.id=draft_row\.case_id[\s\S]*for update/);
  assert.match(finalizeSql, /item\.customer_id<>target_customer_id/);
  assert.match(finalizeSql, /item\.tax_year is distinct from target_tax_year/);
  assert.match(finalizeSql, /item\.case_type_id is distinct from target_case_type_id/);
  assert.match(finalizeSql, /insert into public\.case_questions/);
  assert.match(finalizeSql, /insert into public\.case_question_responses/);
  assert.match(finalizeSql, /insert into public\.case_tasks/);
  assert.doesNotMatch(finalizeSql, /insert into public\.cases/);
  assert.match(finalizeSql, /item\.status<>'IN_PROGRESS'/);
  assert.doesNotMatch(finalizeSql, /set status=/);
});

test("Step 6 finalization is idempotent and retires only unfinished-draft visibility", () => {
  assert.match(finalizeSql, /draft_row\.finalized_at is not null[\s\S]*return item/);
  assert.match(finalizeSql, /on conflict\(case_id,question_definition_id\) do nothing/);
  assert.match(finalizeSql, /on conflict\(case_question_id\) do update/);
  assert.match(finalizeSql, /finalized_at=now\(\)/);
  assert.doesNotMatch(finalizeSql, /delete from public\.guided_case_intake_drafts/);
  assert.match(configurationLoader, /\.is\("finalized_at", null\)/);
  assert.match(draftLoader, /\.is\("finalized_at", null\)/);
});

test("Portal onboarding remains a Step 6 gate and is absent from Step 2", () => {
  assert.doesNotMatch(materializeSql, /customer_portal_invitations|portal_onboarding/);
  assert.match(finalizeSql, /target_portal_onboarding jsonb/);
  assert.match(finalizeSql, /Customer Portal onboarding is unresolved/);
  assert.match(finalizeSql, /invitation\.status in \('SENT','ACTIVATED'\)/);
});

test("Save and Continue Later is unavailable before materialization", () => {
  assert.match(component, /\{step >= 2 \? \([\s\S]*Save and Continue Later/);
  assert.doesNotMatch(
    component.match(/\{step === 0[\s\S]*?\) : null\}/)?.[0] ?? "",
    /Save and Continue Later/,
  );
});

test("Milestone 1 lifecycle and read-only Case Questions remain intact", () => {
  assert.match(lifecycle, /target_status not in \('IN_PROGRESS', 'WAITING'\)/);
  assert.match(lifecycle, /item\.status not in \([\s\S]*'IN_PROGRESS',[\s\S]*'WAITING'/);
  const casePage = source("app/cases/[caseId]/page.tsx");
  assert.doesNotMatch(casePage, /saveCaseQuestionResponseAction|<QuestionField/);
});

test("new RPCs retain tenant authorization and least-privilege execution", () => {
  assert.match(materializeSql, /actor uuid:=auth\.uid\(\)/);
  assert.match(materializeSql, /has_effective_organization_permission\([\s\S]*'CREATE_CASE'/);
  assert.match(materializeSql, /has_effective_organization_permission\([\s\S]*'ASSIGN_CASES'/);
  assert.match(finalizeSql, /security definer[\s\S]*set search_path=''/);
  assert.match(
    finalizeSql,
    /create or replace function public\.create_guided_case_intake\([\s\S]*perform public\.materialize_guided_case_intake\([\s\S]*from public\.finalize_guided_case_intake\(/,
  );
  assert.match(finalizeSql, /grant execute on function public\.finalize_guided_case_intake\([\s\S]*to authenticated/);
  assert.match(finalizeSql, /grant select,insert,update,delete[\s\S]*to service_role/);
});
