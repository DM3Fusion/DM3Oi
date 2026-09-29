import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildGuidedIntakeCreationPlan,
  evaluateGuidedCaseIntake,
  getGuidedCaseTypesForCustomerMode,
  getGuidedCaseTaxYearOptions,
  isGuidedQuestionAnswerValid,
  reconcileGuidedCaseSelection,
  reconcileGuidedCaseTaxYear,
  resolveGuidedDraftCustomerMode,
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
  requireAllOptions: false,
  trackRequiredOptions: false,
  group: null,
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
  customerCaseYears: [],
  currentTaxYear: 2026,
  taxYearOptions: [2026, 2025, 2024],
  customers: [{ id: "customer-a", customerNumber: "CUS-1", name: "Acme" }],
  caseTypes: [{
    id: "type-a",
    name: "Refund",
    customerMode: "ANY",
    taxYearRule: "ANY_YEAR",
  }],
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
  caseId: null,
  customerId: "customer-a",
  taxYear: 2025,
  description: "Details",
  caseTypeId: "type-a",
  priority: "NORMAL",
  managerUserId: "",
  staffUserIds: ["staff-a"],
  answers: {},
  requiredOptionIds: {},
  followUpTasks: [],
  portalOnboarding: { resolution: "UNRESOLVED" },
});

const configuredCaseTypes: GuidedIntakeConfiguration["caseTypes"] = [
  {
    id: "cash-new",
    name: "Cash Advance - New Customer",
    customerMode: "NEW",
    taxYearRule: "CURRENT_YEAR",
  },
  {
    id: "none-new",
    name: "No Advance - New Customer",
    customerMode: "NEW",
    taxYearRule: "CURRENT_YEAR",
  },
  {
    id: "prior-new",
    name: "Prior-Year - New Customer",
    customerMode: "NEW",
    taxYearRule: "PRIOR_YEAR_REQUIRED",
  },
  {
    id: "cash-existing",
    name: "Cash Advance - Existing Customer",
    customerMode: "EXISTING",
    taxYearRule: "CURRENT_YEAR",
  },
  {
    id: "none-existing",
    name: "No Advance - Existing Customer",
    customerMode: "EXISTING",
    taxYearRule: "CURRENT_YEAR",
  },
  {
    id: "prior-existing",
    name: "Prior-Year - Existing Customer",
    customerMode: "EXISTING",
    taxYearRule: "PRIOR_YEAR_REQUIRED",
  },
  {
    id: "any",
    name: "General",
    customerMode: "ANY",
    taxYearRule: "ANY_YEAR",
  },
];

test("Case Type eligibility uses only the authoritative existing Customer mode", () => {
  const names = getGuidedCaseTypesForCustomerMode(
    configuredCaseTypes,
    "existing",
  ).map((item) => item.name);
  assert.deepEqual(names, [
    "Cash Advance - Existing Customer",
    "No Advance - Existing Customer",
    "Prior-Year - Existing Customer",
    "General",
  ]);
  assert.equal(names.some((name) => name.includes("New Customer")), false);
});

test("Case Type eligibility uses only the authoritative new Customer mode", () => {
  const names = getGuidedCaseTypesForCustomerMode(
    configuredCaseTypes,
    "new",
  ).map((item) => item.name);
  assert.deepEqual(names, [
    "Cash Advance - New Customer",
    "No Advance - New Customer",
    "Prior-Year - New Customer",
    "General",
  ]);
  assert.equal(names.some((name) => name.includes("Existing Customer")), false);
});

test("CURRENT_YEAR Case Types force the organization-local current year", () => {
  assert.equal(
    reconcileGuidedCaseTaxYear(configuredCaseTypes[0], null, 2026),
    2026,
  );
  assert.equal(
    reconcileGuidedCaseTaxYear(configuredCaseTypes[0], 2024, 2026),
    2026,
  );
  assert.deepEqual(
    getGuidedCaseTaxYearOptions(
      configuredCaseTypes[0],
      [2026, 2025, 2024],
      2026,
    ),
    [],
  );
});

test("PRIOR_YEAR_REQUIRED offers prior years only and clears incompatible years", () => {
  const priorType = configuredCaseTypes[2];
  assert.deepEqual(
    getGuidedCaseTaxYearOptions(priorType, [2026, 2025, 2024, 1899], 2026),
    [2025, 2024],
  );
  assert.equal(reconcileGuidedCaseTaxYear(priorType, 2026, 2026), null);
  assert.equal(reconcileGuidedCaseTaxYear(priorType, 2025, 2026), 2025);
  assert.equal(reconcileGuidedCaseTaxYear(priorType, 1899, 2026), null);
});

test("ANY_YEAR offers current and prior years and requires a valid selection", () => {
  const anyType = configuredCaseTypes[6];
  assert.deepEqual(
    getGuidedCaseTaxYearOptions(anyType, [2027, 2026, 2025, 1899], 2026),
    [2026, 2025],
  );
  assert.equal(reconcileGuidedCaseTaxYear(anyType, null, 2026), null);
  assert.equal(reconcileGuidedCaseTaxYear(anyType, 2026, 2026), 2026);
  assert.equal(reconcileGuidedCaseTaxYear(anyType, 2025, 2026), 2025);
});

test("changing Case Type reconciles a tax year against the new rule", () => {
  assert.deepEqual(
    reconcileGuidedCaseSelection(
      "cash-existing",
      2024,
      "existing",
      configuredCaseTypes,
      2026,
    ),
    { caseTypeId: "cash-existing", taxYear: 2026 },
  );
  assert.deepEqual(
    reconcileGuidedCaseSelection(
      "prior-existing",
      2026,
      "existing",
      configuredCaseTypes,
      2026,
    ),
    { caseTypeId: "prior-existing", taxYear: null },
  );
});

test("changing Customer mode clears an incompatible Case Type and tax year", () => {
  assert.deepEqual(
    reconcileGuidedCaseSelection(
      "cash-existing",
      2026,
      "new",
      configuredCaseTypes,
      2026,
    ),
    { caseTypeId: "", taxYear: null },
  );
});

test("draft Customer mode restoration prioritizes a materialized Customer", () => {
  assert.equal(resolveGuidedDraftCustomerMode("customer-a", "new", "new"), "existing");
  assert.equal(resolveGuidedDraftCustomerMode("", "new", "existing"), "new");
  assert.equal(resolveGuidedDraftCustomerMode("", "existing", "new"), "existing");
});

test("Guided Intake UI keeps one Customer mode across navigation and moves Tax Year to Case Details", () => {
  const intake = source("components/cases/guided-case-intake.tsx");
  const customerStep = intake.slice(
    intake.indexOf("const renderCustomer"),
    intake.indexOf("const renderDetails"),
  );
  const detailsStep = intake.slice(
    intake.indexOf("const renderDetails"),
    intake.indexOf("const renderQuestions"),
  );

  assert.doesNotMatch(intake, /caseCustomerMode/);
  assert.match(intake, /getGuidedCaseTypesForCustomerMode\([\s\S]*customerMode/);
  assert.match(intake, /validateGuidedCaseDetails\([\s\S]*customerMode/);
  assert.match(intake, /customerMode === "new"[\s\S]*draft\.customerId[\s\S]*continueForward/);
  assert.doesNotMatch(customerStep, /<span>Tax Year<\/span>/);
  assert.doesNotMatch(customerStep, /Select a Tax Year first/);
  assert.match(detailsStep, /selectedType\?\.taxYearRule === "CURRENT_YEAR"/);
  assert.match(detailsStep, /Tax Year: <strong>\{configuration\.currentTaxYear\}/);
  assert.match(detailsStep, /<span>Tax Year<\/span>[\s\S]*selectableTaxYears/);
});

test("draft loading restores materialized Customers as existing without changing stored rows", () => {
  const loader = source("lib/data/guided-case-intake-drafts.ts");
  const action = source("lib/data/guided-case-intake-actions.ts");
  assert.match(loader, /customerMode: data\.customer_id[\s\S]*\? "existing"/);
  assert.match(action, /input\.draft\.customerId[\s\S]*canonicalCustomerDraftSubmissionKey/);
  assert.match(action, /onConflict: "organization_id,created_by_user_id,submission_key"/);
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

test("Case Details reject inactive or cross-tenant Case Types and invalid priority", () => {
  const configuration = baseConfiguration();
  const errors = validateGuidedCaseDetails(
    {
      ...draft(),
      caseTypeId: "other-tenant-type",
      priority: "CRITICAL",
    },
    configuration,
  );
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

test("final validation rechecks fresh Case Type configuration instead of trusting draft state", () => {
  const original = baseConfiguration();
  assert.equal(
    validateGuidedCaseIntake(draft(), original, "existing").valid,
    true,
  );

  const changed = {
    ...original,
    caseTypes: [],
  };

  const result = validateGuidedCaseIntake(
    draft(),
    changed,
    "existing",
  );

  assert.equal(result.valid, false);
  assert.match(result.fieldErrors.caseTypeId, /active Case Type/);
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

test("dependent verification is hidden when dependents are not claimed", () => {
  const dependents = question("dependents", "YES_NO", true);
  const verification = question(
    "dependent-verification",
    "YES_NO",
    false,
  );

  const configuration: GuidedIntakeConfiguration = {
    organizationId,
    customers: [],
    customerCaseYears: [],
    currentTaxYear: 2026,
    taxYearOptions: [2026, 2025, 2024],
    caseTypes: [],
    managers: [],
    staff: [],
    questions: [dependents, verification],
    rules: [
      {
        id: "dependents-rule",
        organization_id: organizationId,
        name: "Require dependent verification when dependents are claimed",
        source_question_id: dependents.id,
        condition_operator: "IS_YES",
        condition_option_id: null,
        active: true,
      },
    ],
    actions: [
      {
        id: "dependents-action",
        organization_id: organizationId,
        rule_definition_id: "dependents-rule",
        action_type: "REQUIRE_QUESTION",
        target_question_id: verification.id,
        task_title: null,
        task_description: null,
        task_priority: null,
        task_required: null,
        task_blocking: null,
      },
    ],
    defaultPriority: "NORMAL",
    canViewCustomers: true,
    canCreateCustomer: true,
    canAssign: true,
  };

  const evaluation = evaluateGuidedCaseIntake(
    configuration,
    {
      [dependents.id]: false,
    },
  );

  const result = evaluation.questions.find(
    (candidate) => candidate.id === verification.id,
  );

  assert.ok(result);
  assert.equal(result.applicable, false);
  assert.equal(result.effectiveRequired, false);
});

test("dependent verification becomes visible and required when dependents are claimed", () => {
  const dependents = question("dependents", "YES_NO", true);
  const verification = question(
    "dependent-verification",
    "YES_NO",
    false,
  );

  const configuration: GuidedIntakeConfiguration = {
    organizationId,
    customers: [],
    customerCaseYears: [],
    currentTaxYear: 2026,
    taxYearOptions: [2026, 2025, 2024],
    caseTypes: [],
    managers: [],
    staff: [],
    questions: [dependents, verification],
    rules: [
      {
        id: "dependents-rule",
        organization_id: organizationId,
        name: "Require dependent verification when dependents are claimed",
        source_question_id: dependents.id,
        condition_operator: "IS_YES",
        condition_option_id: null,
        active: true,
      },
    ],
    actions: [
      {
        id: "dependents-action",
        organization_id: organizationId,
        rule_definition_id: "dependents-rule",
        action_type: "REQUIRE_QUESTION",
        target_question_id: verification.id,
        task_title: null,
        task_description: null,
        task_priority: null,
        task_required: null,
        task_blocking: null,
      },
    ],
    defaultPriority: "NORMAL",
    canViewCustomers: true,
    canCreateCustomer: true,
    canAssign: true,
  };

  const evaluation = evaluateGuidedCaseIntake(
    configuration,
    {
      [dependents.id]: true,
    },
  );

  const result = evaluation.questions.find(
    (candidate) => candidate.id === verification.id,
  );

  assert.ok(result);
  assert.equal(result.applicable, true);
  assert.equal(result.effectiveRequired, true);
  assert.equal(result.valid, false);
});

test("business records follow the self-employment hierarchy", () => {
  const businessIncome = question("business-income", "YES_NO", true);
  const businessRecords = question(
    "business-records",
    "YES_NO",
    false,
  );

  const configuration: GuidedIntakeConfiguration = {
    organizationId,
    customers: [],
    customerCaseYears: [],
    currentTaxYear: 2026,
    taxYearOptions: [2026, 2025, 2024],
    caseTypes: [],
    managers: [],
    staff: [],
    questions: [businessIncome, businessRecords],
    rules: [
      {
        id: "business-rule",
        organization_id: organizationId,
        name: "Require business records when business income is involved",
        source_question_id: businessIncome.id,
        condition_operator: "IS_YES",
        condition_option_id: null,
        active: true,
      },
    ],
    actions: [
      {
        id: "business-action",
        organization_id: organizationId,
        rule_definition_id: "business-rule",
        action_type: "REQUIRE_QUESTION",
        target_question_id: businessRecords.id,
        task_title: null,
        task_description: null,
        task_priority: null,
        task_required: null,
        task_blocking: null,
      },
    ],
    defaultPriority: "NORMAL",
    canViewCustomers: true,
    canCreateCustomer: true,
    canAssign: true,
  };

  const noBusiness = evaluateGuidedCaseIntake(
    configuration,
    {
      [businessIncome.id]: false,
    },
  );

  const noBusinessResult = noBusiness.questions.find(
    (candidate) => candidate.id === businessRecords.id,
  );

  assert.ok(noBusinessResult);
  assert.equal(noBusinessResult.applicable, false);
  assert.equal(noBusinessResult.effectiveRequired, false);

  const hasBusiness = evaluateGuidedCaseIntake(
    configuration,
    {
      [businessIncome.id]: true,
    },
  );

  const hasBusinessResult = hasBusiness.questions.find(
    (candidate) => candidate.id === businessRecords.id,
  );

  assert.ok(hasBusinessResult);
  assert.equal(hasBusinessResult.applicable, true);
  assert.equal(hasBusinessResult.effectiveRequired, true);
});
