import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveGuidedDraftCustomerMode,
  validateGuidedCaseDetails,
} from "../lib/guided-case-intake.ts";

const migration = fs.readFileSync(
  "supabase/migrations/20260927160000_dm3oi_guided_intake_case_model.sql",
  "utf8",
);
const foundationMigration = fs.readFileSync(
  "supabase/migrations/20260927154500_dm3oi_case_types_task_purposes.sql",
  "utf8",
);
const intake = fs.readFileSync(
  "components/cases/guided-case-intake.tsx",
  "utf8",
);
const settings = fs.readFileSync(
  "app/settings/case-configuration/page.tsx",
  "utf8",
) + fs.readFileSync("components/case-configuration-editor.tsx", "utf8");

const configuration = {
  currentTaxYear: 2026,
  caseTypes: [
    {
      id: "current-new",
      name: "Cash Advance - New Customer",
      customerMode: "NEW" as const,
      taxYearRule: "CURRENT_YEAR" as const,
    },
    {
      id: "current-existing",
      name: "Cash Advance - Existing Customer",
      customerMode: "EXISTING" as const,
      taxYearRule: "CURRENT_YEAR" as const,
    },
    {
      id: "prior-new",
      name: "Prior-Year - New Customer",
      customerMode: "NEW" as const,
      taxYearRule: "PRIOR_YEAR_REQUIRED" as const,
    },
    {
      id: "prior-existing",
      name: "Prior-Year - Existing Customer",
      customerMode: "EXISTING" as const,
      taxYearRule: "PRIOR_YEAR_REQUIRED" as const,
    },
  ],
  managers: [],
  staff: [{ id: "staff-a", name: "Staff" }],
  canAssign: true,
};

const detail = {
  taxYear: 2026,
  caseTypeId: "current-existing",
  priority: "NORMAL",
  managerUserId: "",
  staffUserIds: ["staff-a"],
};

test("Guided Intake rejects a new-Customer Case Type for an existing Customer", () => {
  const errors = validateGuidedCaseDetails(
    {
      ...detail,
      caseTypeId: "current-new",
    },
    configuration,
    "existing",
  );

  assert.match(errors.caseTypeId, /existing Customer/);
});

test("Guided Intake rejects an existing-Customer Case Type for a new Customer", () => {
  const errors = validateGuidedCaseDetails(
    {
      ...detail,
      caseTypeId: "current-existing",
    },
    configuration,
    "new",
  );

  assert.match(errors.caseTypeId, /new Customer/);
});

test("current-year Case Types require the organization-local current Tax Year", () => {
  const errors = validateGuidedCaseDetails(
    {
      ...detail,
      taxYear: 2025,
    },
    configuration,
    "existing",
  );

  assert.match(errors.caseTypeId, /requires Tax Year 2026/);
});

test("prior-year Case Types require a Tax Year before the current Tax Year", () => {
  const errors = validateGuidedCaseDetails(
    {
      ...detail,
      caseTypeId: "prior-existing",
      taxYear: 2026,
    },
    configuration,
    "existing",
  );

  assert.match(errors.caseTypeId, /before 2026/);
});

test("valid prior-year and current-year combinations pass Case Type validation", () => {
  assert.deepEqual(
    validateGuidedCaseDetails(
      {
        ...detail,
        caseTypeId: "prior-existing",
        taxYear: 2025,
      },
      configuration,
      "existing",
    ),
    {},
  );

  assert.deepEqual(
    validateGuidedCaseDetails(
      detail,
      configuration,
      "existing",
    ),
    {},
  );
});

test("database Case Types carry stable Customer and Tax Year semantics", () => {
  assert.match(foundationMigration, /customer_mode text not null default 'ANY'/);
  assert.match(foundationMigration, /tax_year_rule text not null default 'ANY_YEAR'/);
  assert.match(foundationMigration, /'Cash Advance - New Customer'/);
  assert.match(foundationMigration, /'Cash Advance - Existing Customer'/);
  assert.match(foundationMigration, /'Prior-Year - New Customer'/);
  assert.match(foundationMigration, /'Prior-Year - Existing Customer'/);
});

test("Guided Intake no longer uses Case Titles", () => {
  assert.doesNotMatch(intake, /Case Title/);
  assert.doesNotMatch(intake, /caseTitleId/);
  assert.doesNotMatch(intake, /compatibleCaseTitles/);
  assert.doesNotMatch(migration, /target_case_title_id/);
});

test("Case Configuration manages Case Type behavior instead of title compatibility", () => {
  assert.match(settings, /Customer/);
  assert.match(settings, /Tax Year/);
  assert.match(settings, /customerMode/);
  assert.match(settings, /taxYearRule/);
  assert.doesNotMatch(settings, /Case Title Compatibility/);
  assert.doesNotMatch(settings, /Allowed Case Titles/);
});


test("resumed Guided Intake treats a materialized Customer as existing", () => {
  assert.equal(
    resolveGuidedDraftCustomerMode("customer-123", "new", "existing"),
    "existing",
  );
  assert.equal(
    resolveGuidedDraftCustomerMode("customer-123", "existing", "new"),
    "existing",
  );
  assert.equal(
    resolveGuidedDraftCustomerMode("customer-123", undefined, "new"),
    "existing",
  );
});
