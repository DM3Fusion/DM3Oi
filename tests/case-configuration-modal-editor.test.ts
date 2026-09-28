import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const page = source("app/settings/case-configuration/page.tsx");
const editor = source("components/case-configuration-editor.tsx");
const actions = source("lib/data/organization-administration-actions.ts");
const css = source("app/globals.css");

test("Case Type create and edit use one in-application modal instead of inline forms", () => {
  assert.match(page, /CaseConfigurationEditor/);
  assert.match(editor, /ref=\{caseTypeDialog\}/);
  assert.match(editor, /className="case-configuration-dialog"/);
  assert.match(editor, /aria-labelledby=\{caseTypeTitleId\}/);
  assert.match(editor, /openCaseType\(null\)/);
  assert.match(editor, /openCaseType\(item\)/);
  assert.match(editor, /Create Case Type/);
  assert.match(editor, /Edit Case Type/);
  assert.doesNotMatch(editor, /<details>|<summary>/);
  assert.doesNotMatch(editor, /window\.(?:alert|confirm|prompt)/);
});

test("Case Type modal retains every established machine field and value", () => {
  for (const field of [
    "id",
    "name",
    "description",
    "customerMode",
    "taxYearRule",
    "sortOrder",
    "isActive",
  ])
    assert.match(editor, new RegExp(`name="${field}"`));
  for (const value of [
    "ANY",
    "NEW",
    "EXISTING",
    "ANY_YEAR",
    "CURRENT_YEAR",
    "PRIOR_YEAR_REQUIRED",
  ])
    assert.match(editor, new RegExp(`value="${value}"`));
  assert.match(actions, /saveCaseTypeInModal/);
  assert.match(actions, /persistCaseType/);
});

test("Task Purpose create and edit share a modal and preserve stable IDs", () => {
  assert.match(editor, /ref=\{taskPurposeDialog\}/);
  assert.match(editor, /openTaskPurpose\(null\)/);
  assert.match(editor, /openTaskPurpose\(item\)/);
  assert.match(editor, /Create Task Purpose/);
  assert.match(editor, /Edit Task Purpose/);
  assert.match(editor, /name="id" value=\{taskPurpose\.id\}/);
  assert.match(editor, /name="label"/);
  assert.match(editor, /name="description"/);
  assert.match(editor, /name="sortOrder"/);
  assert.match(editor, /name="isActive"/);
  assert.match(actions, /saveTaskPurposeInModal/);
  assert.match(actions, /purposeId[\s\S]*\.eq\("id", purposeId\)/);
});

test("modal saves remain in context, retain failures, and prevent duplicate submission", () => {
  assert.match(editor, /if \(!result\.ok\) \{[\s\S]*setError\(result\.error\)[\s\S]*return;/);
  assert.match(editor, /caseTypeDialog\.current\?\.close\(\)[\s\S]*router\.refresh\(\)/);
  assert.match(editor, /taskPurposeDialog\.current\?\.close\(\)[\s\S]*router\.refresh\(\)/);
  assert.match(editor, /disabled=\{pending === "case-type"\}/);
  assert.match(editor, /disabled=\{pending === "task-purpose"\}/);
  assert.match(editor, /onCancel=/);
  assert.match(editor, /event\.target === event\.currentTarget/);
  assert.match(editor, />Cancel<\/button>/);
});

test("configuration rows are card-contained, hoverable, focusable, and responsive", () => {
  assert.match(editor, /case-configuration-list case-type-list/);
  assert.match(editor, /case-configuration-list task-purpose-list/);
  assert.match(editor, /case-configuration-row/);
  assert.match(editor, /case-configuration-field-label/);
  assert.match(css, /\.case-configuration-section\{[\s\S]*min-width:0;[\s\S]*overflow:hidden;/);
  assert.match(css, /\.case-configuration-list\{[\s\S]*overflow:hidden;/);
  assert.match(css, /\.case-configuration-row>\*\{[\s\S]*min-width:0;/);
  assert.match(css, /case-configuration-row:not\(\.case-configuration-header\):hover[\s\S]*background:#f6f8fa/);
  assert.match(css, /\.case-configuration-edit \.text-button:focus-visible/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /@media\(max-width:1000px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:600px\)[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
});

test("modal actions reuse persistence and revalidation without schema changes", () => {
  assert.match(actions, /revalidatePath\(caseConfigurationPath\)/);
  assert.match(actions, /revalidatePath\("\/cases"\)/);
  assert.match(actions, /Active Case Type names must be unique/);
  assert.match(actions, /Active Task Purpose labels must be unique/);
  assert.doesNotMatch(editor, /Case Title|caseTitle|Guided Intake.*(?:save|update)/);
});
