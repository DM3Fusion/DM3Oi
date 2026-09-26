import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getCustomerMemberSince,
  getCustomerTenureMetrics,
} from "../lib/customer-tenure.ts";
import { getOperationalDashboardMetrics } from "../lib/live-dashboard-metrics.ts";
import {
  canCompleteIntakeFollowUpTask,
  evaluateGuidedCaseIntake,
  getMissingRequiredOptions,
  type GuidedIntakeConfiguration,
  type GuidedIntakeFollowUpTask,
} from "../lib/guided-case-intake.ts";
import type { LiveCase, LiveServiceRequest } from "../lib/data/case-repository.ts";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20260926232000_dm3oi_task_due_tax_year_customer_tenure.sql",
);

test("Customer KPIs use distinct Case tax years and adjacent-year retention", () => {
  const customers = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const cases = [
    { customer_id: "a", tax_year: 2024 },
    { customer_id: "a", tax_year: 2024 },
    { customer_id: "a", tax_year: 2025 },
    { customer_id: "b", tax_year: 2022 },
    { customer_id: "b", tax_year: 2026 },
    { customer_id: "c", tax_year: 2025 },
    { customer_id: "c", tax_year: null },
  ];

  assert.deepEqual(getCustomerTenureMetrics(customers, cases), {
    lifetimeCustomers: 3,
    currentTaxYear: 2026,
    priorTaxYear: 2025,
    currentTaxYearCustomers: 1,
    priorTaxYearCustomers: 2,
    repeatCustomers: 1,
  });
});

test("Customer tenure has a truthful empty fallback and derives earliest valid year", () => {
  assert.deepEqual(getCustomerTenureMetrics([{ id: "a" }], []), {
    lifetimeCustomers: 1,
    currentTaxYear: null,
    priorTaxYear: null,
    currentTaxYearCustomers: 0,
    priorTaxYearCustomers: 0,
    repeatCustomers: 0,
  });
  assert.equal(
    getCustomerMemberSince([
      { tax_year: null },
      { tax_year: 2025 },
      { tax_year: 2023 },
      { tax_year: 2024 },
    ]),
    2023,
  );
  assert.equal(getCustomerMemberSince([{ tax_year: null }]), null);
});

test("workload row uses open lifecycle semantics and organization-local Due Today", () => {
  const now = new Date("2026-09-06T02:00:00Z");
  const task = (status: string, dueAt: string) => ({
    status,
    due_at: dueAt,
  });
  const cases = [
    {
      status: "NEW",
      customer_id: "a",
      tax_year: 2025,
      tasks: [
        task("NOT_STARTED", "2026-09-06T01:00:00Z"),
        task("COMPLETED", "2026-09-06T01:00:00Z"),
        task("IN_PROGRESS", "2026-09-06T05:00:00Z"),
      ],
    },
    { status: "CLOSED", customer_id: "a", tax_year: 2024, tasks: [] },
  ] as unknown as LiveCase[];
  const requests = [
    { status: "OPEN", assigned_user_id: "staff" },
    { status: "CLOSED", assigned_user_id: null },
  ] as unknown as LiveServiceRequest[];

  const result = getOperationalDashboardMetrics(
    cases,
    requests,
    [{ id: "a" }],
    0,
    "America/New_York",
    now,
  );
  assert.deepEqual(
    result.actionKpis.map(({ label, value }) => ({ label, value })),
    [
      { label: "Due Today", value: 1 },
      { label: "Open Requests", value: 1 },
      { label: "Open Tasks", value: 2 },
      { label: "Open Cases", value: 1 },
    ],
  );
});

test("Case tax year is nullable for history but required at both creation RPC boundaries", () => {
  assert.match(migration, /add column tax_year integer/);
  assert.match(migration, /tax_year is null or tax_year between 1900 and 2200/);
  assert.doesNotMatch(migration, /set tax_year\s*=\s*(?:extract|date_part|created_at|opened_at)/i);
  assert.match(migration, /valid Case tax year is required/);
  assert.match(migration, /create function public\.create_case_workflow[\s\S]*target_tax_year integer/);
  assert.match(migration, /create function public\.create_guided_case_intake[\s\S]*target_tax_year integer/);
  assert.match(source("components/cases/guided-case-intake.tsx"), /<span>Tax Year<\/span>[\s\S]*min="1900"[\s\S]*max="2200"/);
  assert.match(source("app/cases/[caseId]/page.tsx"), /<dt>Tax year<\/dt>[\s\S]*item\.tax_year \?\? "—"/);
});

test("new Tasks require a local Due Date while legacy null-due Tasks remain operable", () => {
  assert.match(migration, /tg_op='INSERT' and new\.due_at is null[\s\S]*Task Due Date is required/);
  assert.match(migration, /tg_op='UPDATE' and old\.due_at is not null and new\.due_at is null/);
  assert.match(migration, /if can_manage and target_due_date is null then raise exception 'Task Due Date is required when updating a Task'/);
  assert.match(source("components/cases/create-task-modal.tsx"), /name="dueDate" required/);
  assert.match(source("lib/data/case-actions.ts"), /target_due_date: dueDate/);
  assert.doesNotMatch(migration, /update public\.case_tasks\s+set due_at\s*=\s*(?:now\(\)|created_at)/i);
});

test("Task completion metadata is system managed and reopening clears it", () => {
  assert.match(migration, /if new\.status='COMPLETED'[\s\S]*new\.completed_at:=now\(\)[\s\S]*new\.completed_by_user_id:=coalesce\(auth\.uid\(\),new\.created_by_user_id\)/);
  assert.match(migration, /else[\s\S]*new\.completed_at:=null;[\s\S]*new\.completed_by_user_id:=null/);
  assert.doesNotMatch(source("app/cases/[caseId]/page.tsx"), /name="completedAt"|name="completedBy"/);
  assert.match(migration, /new\.intake_follow_up_id is not null[\s\S]*case_question_responses[\s\S]*missing documents prevent follow-up Task completion/);
});

test("Rule-created Tasks require relative due days and calculate organization-local due_at", () => {
  const builder = source("components/rule-builder.tsx");
  assert.match(builder, /Due in days/);
  assert.match(builder, /task_due_in_days/);
  assert.match(migration, /task_due_in_days between 0 and 3650/);
  assert.match(migration, /valid due_in_days is required/);
  assert.match(migration, /organization_task_due_at\(target_organization_id,action\.task_due_in_days\)/);
  assert.match(migration, /set task_due_in_days=7[\s\S]*action_type='CREATE_TASK'/);
});

test("required complete-option questions expose missing items and cannot be satisfied by a Task", () => {
  const configuration: GuidedIntakeConfiguration = {
    organizationId: "org",
    customers: [],
    caseTitles: [],
    caseTypes: [],
    managers: [],
    staff: [{ id: "staff", name: "Staff" }],
    questions: [{
      id: "documents",
      text: "Documents received",
      description: "",
      responseType: "MULTI_SELECT",
      required: true,
      requireAllOptions: true,
      group: "REQUIRED_DOCUMENTS",
      displayOrder: 0,
      options: [
        { id: "w2", questionId: "documents", label: "W-2", value: "w2", displayOrder: 0 },
        { id: "1099", questionId: "documents", label: "1099", value: "1099", displayOrder: 1 },
      ],
    }],
    rules: [],
    actions: [],
    defaultPriority: "NORMAL",
    canViewCustomers: true,
    canCreateCustomer: true,
    canAssign: true,
  };
  const unresolved = evaluateGuidedCaseIntake(configuration, { documents: ["w2"] });
  assert.deepEqual(
    getMissingRequiredOptions(unresolved, { documents: ["w2"] })[0].missingOptions.map((option) => option.label),
    ["1099"],
  );
  const task: GuidedIntakeFollowUpTask = {
    id: "task",
    questionId: "documents",
    title: "Obtain missing required documents",
    description: "1099",
    missingOptionIds: ["1099"],
    missingOptionLabels: ["1099"],
    assignedUserId: "staff",
    dueDate: "2026-10-01",
    completed: false,
  };
  assert.equal(canCompleteIntakeFollowUpTask(task, unresolved), false);
  const resolved = evaluateGuidedCaseIntake(configuration, { documents: ["w2", "1099"] });
  assert.equal(canCompleteIntakeFollowUpTask(task, resolved), true);
});

test("Guided Intake stages follow-ups without orphan Tasks and materializes provenance atomically", () => {
  const component = source("components/cases/guided-case-intake.tsx");
  const actions = source("lib/data/guided-case-intake-actions.ts");
  assert.match(component, /className="task-modal"/);
  assert.match(component, /Save and Continue Later/);
  assert.match(component, /step === 2 && !requiredQuestionsComplete/);
  assert.match(component, /Mark every tracked required document as received before completing its follow-up Task/);
  assert.match(actions, /follow_up_tasks: input\.draft\.followUpTasks/);
  assert.match(actions, /target_follow_up_tasks: draft\.followUpTasks/);
  assert.match(migration, /intake_follow_up_id/);
  assert.match(migration, /intake_requirement_context/);
  assert.match(migration, /private\.create_guided_case_intake[\s\S]*insert into public\.case_tasks/);
  assert.doesNotMatch(actions, /\.from\("case_tasks"\)\.(?:insert|upsert)/);
});

test("Case Create Task uses an in-place modal with required Due Date", () => {
  const page = source("app/cases/[caseId]/page.tsx");
  const modal = source("components/cases/create-task-modal.tsx");
  assert.match(page, /<CreateTaskModal caseId=\{item\.id\}/);
  assert.doesNotMatch(page, /<details className="create-panel">/);
  assert.match(modal, /dialog\.current\?\.showModal\(\)/);
  assert.match(modal, /name="dueDate" required/);
  assert.match(modal, /name="priority"/);
  assert.match(modal, /name="description"/);
});
