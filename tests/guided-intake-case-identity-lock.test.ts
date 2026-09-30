import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const actions = source("lib/data/guided-case-intake-actions.ts");
const component = source("components/cases/guided-case-intake.tsx");

const materializeStart = actions.indexOf(
  "export async function materializeGuidedCaseAction",
);
const finalizeStart = actions.indexOf(
  "export async function finalizeGuidedCaseAction",
);

assert.ok(materializeStart >= 0);
assert.ok(finalizeStart > materializeStart);

const materialize = actions.slice(materializeStart, finalizeStart);
const finalize = actions.slice(finalizeStart);

test("initial Guided Intake materialization establishes Case identity from the validated draft", () => {
  assert.match(materialize, /target_customer_id:\s*draft\.customerId/);
  assert.match(materialize, /target_case_type_id:\s*draft\.caseTypeId/);
  assert.match(materialize, /target_tax_year:\s*draft\.taxYear!/);

  assert.doesNotMatch(
    materialize,
    /target_customer_id:\s*linkedCase\.customer_id/,
  );
});

test("materialized Guided Intake saves reject changes to immutable Case identity", () => {
  assert.match(
    actions,
    /input\.draft\.customerId !== linkedCase\.customer_id/,
  );
  assert.match(
    actions,
    /input\.draft\.taxYear !== linkedCase\.tax_year/,
  );
  assert.match(
    actions,
    /input\.draft\.caseTypeId !== linkedCase\.case_type_id/,
  );
  assert.match(
    actions,
    /This Case identity is already established\. Customer, Tax Year, and Case Type cannot be changed\./,
  );
});

test("Guided Intake finalization verifies and uses authoritative materialized Case identity", () => {
  assert.match(
    finalize,
    /\.from\("cases"\)[\s\S]*?\.select\("id,customer_id,tax_year,case_type_id"\)[\s\S]*?\.eq\("id", draft\.caseId\)/,
  );

  assert.match(finalize, /draft\.customerId !== linkedCase\.customer_id/);
  assert.match(finalize, /draft\.taxYear !== linkedCase\.tax_year/);
  assert.match(finalize, /draft\.caseTypeId !== linkedCase\.case_type_id/);

  assert.match(
    finalize,
    /target_customer_id:\s*linkedCase\.customer_id/,
  );
  assert.match(
    finalize,
    /target_case_type_id:\s*linkedCase\.case_type_id/,
  );
  assert.match(
    finalize,
    /target_tax_year:\s*linkedCase\.tax_year!/,
  );
});

test("materialized Case identity controls cannot be reopened through Guided Intake review", () => {
  assert.match(
    component,
    /disabled=\{Boolean\(draft\.caseId\)\}/,
  );
  assert.match(
    component,
    /disabled=\{Boolean\(draft\.caseId\) && Number\(editStep\) < 2\}/,
  );
  assert.match(
    component,
    /Case identity is already established\./,
  );
});
