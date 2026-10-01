import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261002005000_dm3oi_document_requirement_checklist.sql",
  "utf8",
);

const guidedIntake = readFileSync(
  "components/cases/guided-case-intake.tsx",
  "utf8",
);

const casePage = readFileSync("app/cases/[caseId]/page.tsx", "utf8");
const caseActions = readFileSync("lib/data/case-actions.ts", "utf8");
const intake = readFileSync(
  "components/cases/guided-case-intake.tsx",
  "utf8",
);
const intakeActions = readFileSync(
  "lib/data/guided-case-intake-actions.ts",
  "utf8",
);

test("legacy document Tasks fall back when required option state is null", () => {
  assert.match(
    migration,
    /coalesce\(jsonb_typeof\(required_ids\),'null'\)<>'array'/,
  );
  assert.match(
    migration,
    /coalesce\(jsonb_array_length\(required_ids\),0\)=0/,
  );
});

test("document requirement context preserves full checklist state", () => {
  for (const key of [
    "required_option_ids",
    "required_option_labels",
    "received_option_ids",
    "received_option_labels",
    "missing_option_ids",
    "missing_option_labels",
  ]) {
    assert.match(migration, new RegExp(key));
  }
});

test("outstanding documents force Waiting on Customer", () => {
  assert.match(
    migration,
    /jsonb_array_length\(canonical_missing_ids\)>0[\s\S]*new\.status:='WAITING_ON_CUSTOMER'/,
  );
  assert.match(
    migration,
    /Document Requirements Task remains Waiting on Customer while required documents are outstanding/,
  );
});

test("last received document makes task In Progress", () => {
  assert.match(
    migration,
    /elsif new\.status='WAITING_ON_CUSTOMER' then[\s\S]*new\.status:='IN_PROGRESS'/,
  );
});

test("receipt changes use dedicated RPC", () => {
  assert.match(
    migration,
    /create or replace function public\.set_case_document_requirement_received/,
  );
  assert.match(
    caseActions,
    /export async function setDocumentRequirementReceivedAction/,
  );
  assert.match(
    caseActions,
    /"set_case_document_requirement_received"/,
  );
});

test("Case Task renders receipt checklist", () => {
  assert.match(casePage, /Document Requirements/);
  assert.match(casePage, /Mark Received/);
  assert.match(casePage, /Mark Outstanding/);
  assert.match(
    casePage,
    /System set while required documents are[\s\S]*outstanding/,
  );
});

test("Step 3 progression ignores document-receipt Questions", () => {
  assert.match(
    guidedIntake,
    /requiredQuestionsResolved = !intakeQuestionEvaluation\.questions\.some/,
  );
  assert.doesNotMatch(
    guidedIntake,
    /requiredQuestionsResolved = !evaluation\.questions\.some/,
  );
});

test("Guided Intake does not demand document Task during Step 3", () => {
  assert.match(
    intakeActions,
    /input\.currentStep >= 3 && unstagedMissingRequirement/,
  );
  assert.doesNotMatch(
    intakeActions,
    /input\.currentStep >= 2 && unstagedMissingRequirement/,
  );
});

test("Guided Intake document Task status is system controlled", () => {
  assert.match(
    intake,
    /documentRequirement[\s\S]*\? "WAITING_ON_CUSTOMER"[\s\S]*: requestedStatus/,
  );
});
