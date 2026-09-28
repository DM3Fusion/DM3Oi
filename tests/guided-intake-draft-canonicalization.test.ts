import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getGuidedIntakeSelectableCustomers } from "../lib/guided-case-intake.ts";

const source = (path: string) => readFileSync(path, "utf8");
const component = source("components/cases/guided-case-intake.tsx");
const loader = source("lib/data/guided-case-intake.ts");
const actions = source("lib/data/guided-case-intake-actions.ts");
const finalizationErrors = source("lib/guided-case-finalization.ts");
const page = source("app/cases/new/page.tsx");
const draftMigration = source(
  "supabase/migrations/20260925210000_dm3oi_guided_intake_drafts.sql",
);
const caseModelMigration = source(
  "supabase/migrations/20260927160000_dm3oi_guided_intake_case_model.sql",
);
const caseUniquenessMigration = source(
  "supabase/migrations/20260927150000_dm3oi_one_case_per_customer_tax_year.sql",
);
const saveAction = actions.slice(
  actions.indexOf("export async function saveGuidedIntakeDraftAction"),
  actions.indexOf("const guidedCasePriority"),
);

const customers = [
  { id: "barbara", customerNumber: "CUS-1", name: "Barbara Kessner" },
  { id: "anthony", customerNumber: "CUS-2", name: "Anthony Ferrell" },
];

test("fresh intake excludes only Customers represented by the creator's unfinished drafts", () => {
  assert.deepEqual(
    getGuidedIntakeSelectableCustomers(customers, ["barbara"]),
    [customers[1]],
  );
  assert.match(loader, /from\("guided_case_intake_drafts"\)[\s\S]*\.eq\("organization_id", organizationId\)[\s\S]*\.eq\("created_by_user_id", access\.user\.id\)/);
  assert.match(page, /draftCustomerIds=\{draftCustomerIds\}/);
});

test("resuming a draft retains its own Customer despite fresh-intake exclusion", () => {
  assert.deepEqual(
    getGuidedIntakeSelectableCustomers(
      customers,
      ["barbara"],
      "barbara",
    ),
    customers,
  );
  assert.match(
    component,
    /getGuidedIntakeSelectableCustomers\([\s\S]*draftCustomerIds,[\s\S]*initialDraft\?\.customerId/,
  );
});

test("Customer search operates only on the already-eligible Customer set", () => {
  assert.match(
    component,
    /const filtered = selectableCustomers\.filter\([\s\S]*customerSearch\.trim\(\)\.toLowerCase\(\)/,
  );
  assert.doesNotMatch(
    component,
    /const filtered = customers\.filter\([\s\S]*customerSearch/,
  );
});

test("draft deletion and Case creation invalidate fresh-intake eligibility", () => {
  const deleteAction = actions.slice(
    actions.indexOf("export async function deleteGuidedIntakeDraftAction"),
  );
  assert.match(deleteAction, /\.from\("guided_case_intake_drafts"\)[\s\S]*\.delete\(\)/);
  assert.match(deleteAction, /revalidatePath\("\/cases\/new"\)/);
  assert.match(
    caseModelMigration,
    /delete from public\.guided_case_intake_drafts[\s\S]*submission_key=target_submission_key/,
  );
  assert.match(actions, /createGuidedCaseAction[\s\S]*revalidatePath\("\/cases\/new"\)/);
});

test("historical Cases do not participate in draft-based Step 1 exclusion", () => {
  assert.match(loader, /from\("cases"\)[\s\S]*select\("customer_id,tax_year"\)/);
  assert.match(loader, /draftCustomerIds:[\s\S]*draftCustomers\.data/);
  assert.doesNotMatch(
    component,
    /customerCaseYears[\s\S]*selectableCustomers/,
  );
});

test("stale saves reject another Customer draft and fresh races converge on one key", () => {
  assert.match(saveAction, /\.eq\("customer_id", input\.draft\.customerId\)/);
  assert.match(saveAction, /resumesCustomerDraft/);
  assert.match(saveAction, /An unfinished intake already exists for this Customer/);
  assert.match(saveAction, /canonicalCustomerDraftSubmissionKey/);
  assert.match(saveAction, /select\("intake_submission_key"\)[\s\S]*latestCustomerCase\.data\?\.intake_submission_key/);
  assert.match(saveAction, /existingSession\.data[\s\S]*\.upsert\([\s\S]*:\s*await supabase[\s\S]*\.insert\(payload\)/);
  assert.match(saveAction, /error\?\.code === "23505"[\s\S]*Resume the existing draft/);
  assert.match(saveAction, /onConflict: "organization_id,created_by_user_id,submission_key"/);
  assert.match(
    draftMigration,
    /unique \(organization_id,created_by_user_id,submission_key\)/,
  );
});

test("existing duplicate drafts are queried but never automatically deleted or merged", () => {
  assert.match(saveAction, /\.order\("updated_at", \{ ascending: false \}\)/);
  assert.doesNotMatch(saveAction, /\.delete\(\)|delete from|merge/i);
});

test("later Customer and Tax Year Case uniqueness remains server enforced", () => {
  assert.match(
    caseUniquenessMigration,
    /create unique index cases_one_customer_per_tax_year[\s\S]*organization_id,customer_id,tax_year/,
  );
  assert.match(
    finalizationErrors,
    /customer already has a case for this tax year[\s\S]*A Case already exists for this Customer and Tax Year/,
  );
  assert.match(
    caseModelMigration,
    /guided_case_intake_drafts_one_customer_year_per_creator/,
  );
});

test("draft identity and visibility remain organization and creator scoped", () => {
  assert.match(
    draftMigration,
    /guided_case_intake_drafts_owner_select[\s\S]*created_by_user_id=auth\.uid\(\)/,
  );
  assert.match(
    saveAction,
    /\.eq\("organization_id", organizationId\)[\s\S]*\.eq\("created_by_user_id", access\.user\.id\)/,
  );
});
