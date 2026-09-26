import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildGuidedIntakeCreationPlan,
  evaluateGuidedCaseIntake,
  isGuidedQuestionAnswerValid,
  validateGuidedCaseDetails,
  validateGuidedCaseIntake,
  validateGuidedCustomerStep,
  validateGuidedIntakeQuestions,
  type GuidedCaseIntakeDraft,
  type GuidedIntakeConfiguration,
  type GuidedIntakeQuestion,
} from "../lib/guided-case-intake.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const organizationId = "organization-a";
const question = (
  id: string,
  responseType: GuidedIntakeQuestion["responseType"],
  required = false,
  options: GuidedIntakeQuestion["options"] = [],
): GuidedIntakeQuestion => ({
  id,
  text: `Question ${id}`,
  description: `${id} description`,
  responseType,
  required,
  displayOrder: 0,
  options,
});
const option = (id: string, questionId: string, label: string) => ({
  id,
  questionId,
  label,
  value: label.toLowerCase(),
  displayOrder: 0,
});

const baseConfiguration = (): GuidedIntakeConfiguration => ({
  organizationId,
  customers: [{ id: "customer-a", customerNumber: "CUS-1", name: "Acme" }],
  caseTitles: [{ id: "title-a", label: "Early Refund" }],
  caseTypes: [{ id: "type-a", name: "Refund" }],
  managers: [{ id: "manager-a", name: "Manager" }],
  staff: [{ id: "staff-a", name: "Staff" }],
  questions: [],
  rules: [],
  actions: [],
  defaultPriority: "NORMAL",
  canViewCustomers: true,
  canCreateCustomer: true,
  canAssign: true,
});

const draft = (): GuidedCaseIntakeDraft => ({
  submissionKey: "00000000-0000-4000-8000-000000000001",
  customerId: "customer-a",
  caseTitleId: "title-a",
  description: "Details",
  caseTypeId: "type-a",
  priority: "NORMAL",
  managerUserId: "",
  staffUserIds: ["staff-a"],
  answers: {},
});

test("Customer step cannot advance without an active organization Customer", () => {
  const configuration = baseConfiguration();
  assert.deepEqual(
    validateGuidedCustomerStep({ customerId: "" }, configuration),
    { customerId: "Select or create a Customer before continuing." },
  );
  assert.match(
    validateGuidedCustomerStep(
      { customerId: "cross-tenant-customer" },
      configuration,
    ).customerId,
    /active Customer from this organization/,
  );
  assert.deepEqual(
    validateGuidedCustomerStep({ customerId: "customer-a" }, configuration),
    {},
  );
});

test("Case Details reject inactive or cross-tenant dimensions and invalid priority", () => {
  const configuration = baseConfiguration();
  const errors = validateGuidedCaseDetails(
    {
      ...draft(),
      caseTitleId: "inactive-title",
      caseTypeId: "other-tenant-type",
      priority: "CRITICAL",
    },
    configuration,
  );
  assert.match(errors.caseTitleId, /active configured Case Title/);
  assert.match(errors.caseTypeId, /active Case Type/);
  assert.match(errors.priority, /valid priority/);
});

test("Case Details require at least one Assigned Staff member", () => {
  const configuration = baseConfiguration();
  const errors = validateGuidedCaseDetails(
    { ...draft(), staffUserIds: [] },
    configuration,
  );
  assert.match(errors.staffUserIds, /Assign at least one Staff member/);
});

test("Case Details reject ineligible staff, managers, duplicates, and unauthorized assignment", () => {
  const configuration = baseConfiguration();
  const ineligible = validateGuidedCaseDetails(
    {
      ...draft(),
      managerUserId: "inactive-manager",
      staffUserIds: ["staff-a", "cross-tenant-staff"],
    },
    configuration,
  );
  assert.match(ineligible.managerUserId, /active eligible Case Manager/);
  assert.match(ineligible.staffUserIds, /active eligible members/);
  const duplicate = validateGuidedCaseDetails(
    { ...draft(), staffUserIds: ["staff-a", "staff-a"] },
    configuration,
  );
  assert.match(duplicate.staffUserIds, /duplicates/);
  const unauthorized = validateGuidedCaseDetails(
    { ...draft(), staffUserIds: ["staff-a"] },
    { ...configuration, canAssign: false },
  );
  assert.match(unauthorized.assignments, /do not have permission/);
});

test("SHOW and REQUIRE dynamically expose and require intake Questions", () => {
  const configuration = baseConfiguration();
  configuration.questions = [
    question("source", "YES_NO"),
    question("conditional", "TEXT"),
  ];
  configuration.rules = [
    {
      id: "rule-show",
      organization_id: organizationId,
      name: "Show conditional",
      source_question_id: "source",
      condition_operator: "IS_YES",
      condition_option_id: null,
      active: true,
    },
  ];
  configuration.actions = [
    {
      id: "show",
      organization_id: organizationId,
      rule_definition_id: "rule-show",
      action_type: "SHOW_QUESTION",
      target_question_id: "conditional",
      task_title: null,
      task_description: null,
      task_priority: null,
      task_required: null,
      task_blocking: null,
    },
    {
      id: "require",
      organization_id: organizationId,
      rule_definition_id: "rule-show",
      action_type: "REQUIRE_QUESTION",
      target_question_id: "conditional",
      task_title: null,
      task_description: null,
      task_priority: null,
      task_required: null,
      task_blocking: null,
    },
  ];
  const hidden = evaluateGuidedCaseIntake(configuration, { source: false });
  assert.equal(hidden.questions.find((item) => item.id === "conditional")?.applicable, false);
  assert.deepEqual(validateGuidedIntakeQuestions(hidden), {});
  const visible = evaluateGuidedCaseIntake(configuration, { source: true });
  const conditional = visible.questions.find((item) => item.id === "conditional")!;
  assert.equal(conditional.applicable, true);
  assert.equal(conditional.effectiveRequired, true);
  assert.match(
    validateGuidedIntakeQuestions(visible)["question.conditional"],
    /required/,
  );
});

test("hidden stored answers neither block nor keep downstream Questions applicable", () => {
  const configuration = baseConfiguration();
  configuration.questions = [
    question("source", "YES_NO"),
    question("conditional", "TEXT"),
    question("downstream", "TEXT"),
  ];
  configuration.rules = [
    {
      id: "show-conditional",
      organization_id: organizationId,
      name: "Show conditional",
      source_question_id: "source",
      condition_operator: "IS_YES",
      condition_option_id: null,
      active: true,
    },
    {
      id: "show-downstream",
      organization_id: organizationId,
      name: "Show downstream",
      source_question_id: "conditional",
      condition_operator: "IS_ANSWERED",
      condition_option_id: null,
      active: true,
    },
  ];
  configuration.actions = [
    {
      id: "action-one",
      organization_id: organizationId,
      rule_definition_id: "show-conditional",
      action_type: "SHOW_QUESTION",
      target_question_id: "conditional",
      task_title: null,
      task_description: null,
      task_priority: null,
      task_required: null,
      task_blocking: null,
    },
    {
      id: "action-two",
      organization_id: organizationId,
      rule_definition_id: "show-downstream",
      action_type: "SHOW_QUESTION",
      target_question_id: "downstream",
      task_title: null,
      task_description: null,
      task_priority: null,
      task_required: null,
      task_blocking: null,
    },
  ];
  const answers = { source: false, conditional: "old answer" };
  const evaluation = evaluateGuidedCaseIntake(configuration, answers);
  assert.equal(evaluation.questions.find((item) => item.id === "conditional")?.applicable, false);
  assert.equal(evaluation.questions.find((item) => item.id === "downstream")?.applicable, false);
  const plan = buildGuidedIntakeCreationPlan(configuration, answers);
  assert.deepEqual(plan.answers, { source: false });
});

test("select Questions accept stable option UUIDs and reject labels or mutable values", () => {
  const selectQuestion = question("select", "SINGLE_SELECT", true, [
    option("option-uuid", "select", "Refund"),
  ]);
  assert.equal(isGuidedQuestionAnswerValid(selectQuestion, "option-uuid"), true);
  assert.equal(isGuidedQuestionAnswerValid(selectQuestion, "Refund"), false);
  assert.equal(isGuidedQuestionAnswerValid(selectQuestion, "refund"), false);
  const multi = { ...selectQuestion, responseType: "MULTI_SELECT" as const };
  assert.equal(isGuidedQuestionAnswerValid(multi, ["option-uuid"]), true);
  assert.equal(isGuidedQuestionAnswerValid(multi, ["refund"]), false);
});

test("creation plan snapshots applicable definitions and generated Task provenance", () => {
  const configuration = baseConfiguration();
  const sourceQuestion = question("source", "YES_NO", true);
  configuration.questions = [sourceQuestion];
  configuration.rules = [{
    id: "rule-task",
    organization_id: organizationId,
    name: "Generate review",
    source_question_id: "source",
    condition_operator: "IS_YES",
    condition_option_id: null,
    active: true,
  }];
  configuration.actions = [{
    id: "task-action",
    organization_id: organizationId,
    rule_definition_id: "rule-task",
    action_type: "CREATE_TASK",
    target_question_id: null,
    task_title: "Review refund",
    task_description: "Review the submitted intake",
    task_priority: "HIGH",
    task_required: true,
    task_blocking: true,
  }];
  const plan = buildGuidedIntakeCreationPlan(configuration, { source: true });
  assert.deepEqual(plan.generatedTaskActionIds, ["task-action"]);
  assert.equal(plan.questions[0].text, "Question source");
  sourceQuestion.text = "Edited later";
  sourceQuestion.required = false;
  assert.equal(plan.questions[0].text, "Question source");
  assert.equal(plan.questions[0].required, true);
});

test("final validation rechecks fresh configuration instead of trusting draft state", () => {
  const original = baseConfiguration();
  assert.equal(validateGuidedCaseIntake(draft(), original).valid, true);
  const changed = { ...original, caseTitles: [] };
  const result = validateGuidedCaseIntake(draft(), changed);
  assert.equal(result.valid, false);
  assert.match(result.fieldErrors.caseTitleId, /active configured Case Title/);
});

test("atomic RPC enforces tenant, permission, snapshot, task, and idempotency contracts", () => {
  const migration = source(
    "supabase/migrations/20260925190000_dm3oi_guided_case_intake.sql",
  );
  assert.match(migration, /has_effective_organization_permission\(target_organization_id,'CREATE_CASE'\)/);
  assert.match(migration, /customer\.organization_id=target_organization_id/);
  assert.match(migration, /selected_title[\s\S]*organization_case_titles/);
  assert.match(migration, /selected_type[\s\S]*organization_case_types/);
  assert.match(migration, /effective_organization_role_permission\(target_organization_id,member\.role,'ASSIGN_CASES'\)/);
  assert.match(migration, /options_snapshot/);
  assert.match(migration, /'id',option_row\.id/);
  assert.match(migration, /source_rule_action_id/);
  assert.match(migration, /cases_guided_intake_submission_uidx/);
  assert.match(migration, /if found then return created_case/);
  assert.match(migration, /assert_rule_graph_acyclic/);
  assert.match(migration, /q\.id::text=answer_key/);
  assert.match(migration, /not public\.is_super_admin\(member\.user_id\)/);
  assert.match(migration, /join public\.profiles profile[\s\S]*profile\.is_active/);
  assert.match(migration, /having count\(\*\)>1/);
  assert.match(migration, /select count\(\*\)[\s\S]*lower\(trim\(configured\.name\)\)/);
  assert.match(migration, /revoke all on function public\.stamp_case_title_configuration\(\)/);

  const draftMigration = source(
    "supabase/migrations/20260925210000_dm3oi_guided_intake_drafts.sql",
  );
  assert.match(
    draftMigration,
    /cardinality\(target_staff_user_ids\)=0[\s\S]*at least one assigned staff member is required/,
  );
  assert.match(draftMigration, /create table public\.guided_case_intake_drafts/);
  assert.match(
    draftMigration,
    /created_by_user_id=auth\.uid\(\)[\s\S]*CREATE_CASE/,
  );
  assert.match(
    draftMigration,
    /delete from public\.guided_case_intake_drafts[\s\S]*submission_key=target_submission_key/,
  );
  assert.match(
    draftMigration,
    /if found then[\s\S]*delete from public\.guided_case_intake_drafts[\s\S]*return created_case/,
  );
});

test("Guided Intake is the only routed Case creation UI and completion guards remain intact", () => {
  const page = source("app/cases/new/page.tsx");
  const actions = source("lib/data/case-actions.ts");
  const completion = source(
    "supabase/migrations/20260903230000_dm3iqcm_question_response_workflow.sql",
  );
  assert.match(page, /GuidedCaseIntake/);
  assert.doesNotMatch(actions, /export async function createCaseAction/);
  assert.match(completion, /required applicable tasks/);
  assert.match(completion, /required applicable questions/);
});
