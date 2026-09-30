import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const casesPage = fs.readFileSync("app/cases/page.tsx", "utf8");
const caseDetail = fs.readFileSync(
  "app/cases/[caseId]/page.tsx",
  "utf8",
);
const intakePage = fs.readFileSync("app/cases/new/page.tsx", "utf8");
const intakeData = fs.readFileSync(
  "lib/data/guided-case-intake.ts",
  "utf8",
);
const drafts = fs.readFileSync(
  "lib/data/guided-case-intake-drafts.ts",
  "utf8",
);
const actions = fs.readFileSync(
  "lib/data/guided-case-intake-actions.ts",
  "utf8",
);
const migration = fs.readFileSync(
  "supabase/migrations/20260930150000_dm3oi_case_guided_intake_edit_access.sql",
  "utf8",
);

test("Cases landing separates active and completed workflow Cases", () => {
  assert.match(casesPage, /Active Cases/);
  assert.match(casesPage, /Completed Cases/);
  assert.match(casesPage, /isIncompleteCompatibilityCaseStatus/);
  assert.doesNotMatch(casesPage, /DraftIntakeRow/);
  assert.doesNotMatch(casesPage, /Draft Intakes/);
});

test("Case detail exposes Edit Case only for an active unfinished intake", () => {
  assert.match(caseDetail, /WORK_CASES/);
  assert.match(caseDetail, /isCanonicalActiveCaseStatus\(item\.status\)/);
  assert.match(caseDetail, /finalized_at/);
  assert.match(caseDetail, /canEditGuidedIntake/);
  assert.match(caseDetail, /\/cases\/new\?case=\$\{item\.id\}/);
  assert.match(caseDetail, />\s*Edit Case\s*</);
});

test("Case-oriented intake route loads the materialized Case draft", () => {
  assert.match(intakePage, /case\?: string/);
  assert.match(intakePage, /loadGuidedIntakeDraftForCase/);
  assert.match(
    intakePage,
    /loadGuidedCaseIntakeConfiguration\([\s\S]*savedDraft\?\.draft\.caseId/,
  );
  assert.match(intakePage, /query\.case \? "Edit Case"/);
});

test("new Case and existing Case authorization remain separate", () => {
  assert.match(
    intakeData,
    /caseId[\s\S]*WORK_CASES[\s\S]*CREATE_CASE/,
  );
  assert.match(drafts, /loadGuidedIntakeDraftForCase/);
  assert.match(drafts, /caseId \? !canWork : !canCreate/);
});

test("Case-linked saves preserve the original Guided Intake creator", () => {
  assert.match(
    actions,
    /loadGuidedCaseIntakeValidationConfiguration\(input\.draft\.caseId\)/,
  );
  assert.match(
    actions,
    /existingSession\.data\?\.created_by_user_id \?\? access\.user\.id/,
  );
  assert.match(
    actions,
    /\.update\(payload\)[\s\S]*\.eq\("id", existingSession\.data\.id\)/,
  );
});

test("database Case-worker access does not broaden draft creation or deletion", () => {
  assert.match(
    migration,
    /guided_case_intake_drafts_case_worker_select/,
  );
  assert.match(
    migration,
    /guided_case_intake_drafts_case_worker_update/,
  );
  assert.match(migration, /'WORK_CASES'/);
  assert.match(migration, /public\.can_access_case/);

  assert.doesNotMatch(
    migration,
    /guided_case_intake_drafts_case_worker_(insert|delete)/,
  );

  assert.match(
    migration,
    /'ASSIGN_TASKS'/,
  );
});

test("materialization remains CREATE_CASE-controlled", () => {
  const source = fs.readFileSync(
    "supabase/migrations/20260928130000_dm3oi_guided_intake_case_persistence.sql",
    "utf8",
  );

  const start = source.indexOf(
    "create function public.materialize_guided_case_intake(",
  );
  const end = source.indexOf(
    "create function public.finalize_guided_case_intake(",
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const materialize = source.slice(start, end);
  assert.match(materialize, /'CREATE_CASE'/);
});
