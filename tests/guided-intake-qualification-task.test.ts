import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const actions = source("lib/data/guided-case-intake-actions.ts");
const component = source("components/cases/guided-case-intake.tsx");
const email = source("lib/email/templates.ts");
const migration = source(
  "supabase/migrations/20261008233000_dm3oi_guided_intake_qualification_task.sql",
);

test("Guided Intake synchronizes a system-owned qualification Task", () => {
  assert.match(
    actions,
    /evaluateGuidedIntakeQualificationFindings/,
  );
  assert.match(
    actions,
    /sync_guided_intake_qualification_task/,
  );
  assert.match(
    migration,
    /GUIDED_INTAKE_QUALIFICATION/,
  );
  assert.match(
    migration,
    /Resolve qualification requirements/,
  );
  assert.match(
    migration,
    /WAITING_ON_CUSTOMER/,
  );
  assert.match(
    migration,
    /intake_qualification_signature/,
  );
});

test("qualification Task is protected and automatically satisfiable", () => {
  assert.match(
    migration,
    /protect_guided_intake_qualification_task_delete/,
  );
  assert.match(
    migration,
    /Guided Intake qualification Tasks are controlled by the workflow/,
  );
  assert.match(
    migration,
    /status='COMPLETED'/,
  );
  assert.match(
    migration,
    /All Guided Intake qualification requirements are satisfied/,
  );
});

test("Save Progress uses one consolidated Customer requirements notice", () => {
  assert.match(
    component,
    /sendGuidedIntakeCustomerRequirementsNoticeAction/,
  );
  assert.match(
    actions,
    /qualificationFindings/,
  );
  assert.match(
    actions,
    /documentLabels/,
  );
  assert.match(
    actions,
    /additionalInformation/,
  );
});

test("Customer notice has separate document and qualification sections", () => {
  assert.match(
    email,
    /DOCUMENTS NEEDED/,
  );
  assert.match(
    email,
    /ADDITIONAL INFORMATION NEEDED/,
  );
  assert.match(
    email,
    /Additional Information Needed/,
  );
  assert.match(
    email,
    /variables\.additional_information/,
  );
  assert.match(
    email,
    /"additional_information"/,
  );
});

test("database template validator permits additional_information", () => {
  assert.match(
    migration,
    /email_template_content_is_safe/,
  );
  assert.match(
    migration,
    /'additional_information'/,
  );
});

test("qualification Task creation requires explicit assignee and Due Date", () => {
  assert.match(
    actions,
    /upsertGuidedIntakeQualificationTaskAction/,
  );
  assert.match(
    component,
    /Resolve qualification requirements/,
  );
  assert.match(
    component,
    /name="assignedUserId"/,
  );
  assert.match(
    component,
    /name="dueDate"/,
  );
  assert.match(
    migration,
    /target_due_date date default null/,
  );
  assert.match(
    migration,
    /existing\.id is null[\s\S]*target_assigned_user_id is null or target_due_date is null/,
  );
});

test("ordinary draft saves cannot fabricate a qualification Task", () => {
  assert.match(
    actions,
    /target_findings: qualificationFindings,[\s\S]*\} as never/,
  );
  assert.doesNotMatch(
    actions.slice(
      actions.indexOf("if (linkedCaseId)"),
      actions.indexOf("if (linkedCaseId && input.draft.followUpTasks.length)"),
    ),
    /target_due_date|target_assigned_user_id/,
  );
});

test("authenticated users cannot manually mutate qualification Tasks", () => {
  assert.match(
    migration,
    /before update or delete on public\.case_tasks/,
  );
  assert.match(
    migration,
    /auth\.uid\(\) is not null/,
  );
});

test("qualification-only notices do not require secure document routing", () => {
  const service = source(
    "lib/data/missing-documents-notice-service.ts",
  );
  assert.match(
    service,
    /const hasDocuments = input\.missingDocuments\.trim\(\)\.length > 0/,
  );
  assert.match(
    service,
    /if \(hasDocuments\) \{/,
  );
  assert.match(
    email,
    /if \(!missingDocuments\) \{/,
  );
});
