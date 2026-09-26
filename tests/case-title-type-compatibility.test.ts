import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateGuidedCaseDetails,
} from "../lib/guided-case-intake.ts";

const migration = fs.readFileSync(
  "supabase/migrations/20260926234000_dm3oi_case_title_type_compatibility.sql",
  "utf8",
);
const intake = fs.readFileSync(
  "components/cases/guided-case-intake.tsx",
  "utf8",
);
const settings = fs.readFileSync(
  "app/settings/case-configuration/page.tsx",
  "utf8",
);

test("Guided Intake rejects an incompatible Case Title and Case Type", () => {
  const errors = validateGuidedCaseDetails(
    {
      caseTitleId: "title-new",
      taxYear: 2025,
      caseTypeId: "type-returning",
      priority: "NORMAL",
      managerUserId: "",
      staffUserIds: ["staff-a"],
    },
    {
      caseTitles: [
        { id: "title-new", label: "New Client" },
        { id: "title-returning", label: "Returning Client" },
      ],
      caseTypes: [
        { id: "type-new", name: "New" },
        { id: "type-returning", name: "Returning" },
      ],
      caseTitleTypeMappings: [
        { caseTitleId: "title-new", caseTypeId: "type-new" },
        {
          caseTitleId: "title-returning",
          caseTypeId: "type-returning",
        },
      ],
      managers: [],
      staff: [{ id: "staff-a", name: "Staff" }],
      canAssign: true,
    },
  );

  assert.match(errors.caseTitleId, /compatible/);
});

test("database enforces Case Title and Case Type compatibility", () => {
  assert.match(
    migration,
    /organization_case_title_type_mappings/,
  );
  assert.match(
    migration,
    /before insert or update of case_title_id, case_type_id/i,
  );
  assert.match(
    migration,
    /Case Title is not compatible with selected Case Type/,
  );
  assert.match(
    migration,
    /save_case_type_title_mappings/,
  );
});

test("Mimms compatibility distinguishes new and returning refund advance Cases", () => {
  assert.match(
    migration,
    /\('New Client — Refund Advance', 'New Refund Advance Return'\)/,
  );
  assert.match(
    migration,
    /\('Returning Client — Refund Advance', 'Returning Refund Advance Return'\)/,
  );
  assert.doesNotMatch(
    migration,
    /\('New Client — Refund Advance', 'Returning Refund Advance Return'\)/,
  );
});

test("Step 2 chooses Case Type first and filters compatible titles", () => {
  const caseTypePosition = intake.indexOf("<span>Case Type</span>");
  const caseTitlePosition = intake.indexOf("<span>Case Title</span>");
  assert.ok(caseTypePosition >= 0);
  assert.ok(caseTitlePosition > caseTypePosition);
  assert.match(intake, /compatibleCaseTitles/);
  assert.match(intake, /Select a Case Type first/);
  assert.match(intake, /disabled=\{!draft\.caseTypeId\}/);
});

test("Case Configuration exposes organization-managed compatibility", () => {
  assert.match(settings, /Case Title Compatibility/);
  assert.match(settings, /saveCaseTypeMappings/);
  assert.match(settings, /Allowed Case Titles/);
});
