import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const intakeComponent = readFileSync(
  "components/cases/guided-case-intake.tsx",
  "utf8",
);
import {
  buildGuidedIntakeCreationPlan,
  evaluateGuidedCaseIntake,
  getMissingRequiredOptions,
  isGuidedQuestionAnswerValid,
  reconcileGuidedIntakeFollowUpTasks,
  validateGuidedRequiredOptionMap,
  type GuidedIntakeQuestion,
} from "../lib/guided-case-intake.ts";

const question = (
  requireAllOptions: boolean,
): GuidedIntakeQuestion => ({
  id: "question-1",
  text: "Required tax documents received",
  description: "Tax documents",
  responseType: "MULTI_SELECT",
  required: true,
  requireAllOptions,
  trackRequiredOptions: false,
  group: null,
  displayOrder: 1,
  options: [
    {
      id: "w2",
      questionId: "question-1",
      label: "W-2",
      value: "w-2",
      displayOrder: 0,
    },
    {
      id: "1099-int",
      questionId: "question-1",
      label: "1099-INT",
      value: "1099-int",
      displayOrder: 1,
    },
    {
      id: "1099-nec",
      questionId: "question-1",
      label: "1099-NEC",
      value: "1099-nec",
      displayOrder: 2,
    },
  ],
});

test("ordinary MULTI_SELECT remains complete after one valid selection", () => {
  assert.equal(
    isGuidedQuestionAnswerValid(question(false), ["w2"]),
    true,
  );
});

test("require-all MULTI_SELECT stays incomplete until every displayed option is selected", () => {
  const required = question(true);

  assert.equal(
    isGuidedQuestionAnswerValid(required, ["w2"]),
    false,
  );

  assert.equal(
    isGuidedQuestionAnswerValid(required, ["w2", "1099-int"]),
    false,
  );

  assert.equal(
    isGuidedQuestionAnswerValid(required, [
      "w2",
      "1099-int",
      "1099-nec",
    ]),
    true,
  );
});

test("require-all MULTI_SELECT rejects unknown option IDs", () => {
  assert.equal(
    isGuidedQuestionAnswerValid(question(true), [
      "w2",
      "1099-int",
      "unknown",
    ]),
    false,
  );
});

test("Guided Intake displays selected count and blocks Continue while required questions remain incomplete", () => {
  const source = readFileSync(
    "components/cases/guided-case-intake.tsx",
    "utf8",
  );

  assert.match(
    source,
    /selectedCount[\s\S]*question\.options\.length[\s\S]*selected/,
  );

  assert.match(
    source,
    /step === 2 && !requiredQuestionsComplete/,
  );

  assert.match(
    source,
    /Complete all required questions before continuing\./,
  );
});

const trackedQuestion = (): GuidedIntakeQuestion => ({
  ...question(false),
  trackRequiredOptions: true,
});

const trackedEvaluation = (received: string[], required: string[]) =>
  evaluateGuidedCaseIntake(
    {
      organizationId: "organization-a",
      questions: [trackedQuestion()],
      rules: [],
      actions: [],
    },
    { "question-1": received },
    { "question-1": required },
  );

test("tracked mode requires at least one required item and accepts exactly the received required set", () => {
  const tracked = trackedQuestion();
  assert.equal(isGuidedQuestionAnswerValid(tracked, [], []), false);
  assert.equal(isGuidedQuestionAnswerValid(tracked, ["w2"], []), false);
  assert.equal(
    isGuidedQuestionAnswerValid(tracked, ["w2"], ["w2"]),
    true,
  );
  assert.equal(
    isGuidedQuestionAnswerValid(
      tracked,
      ["w2", "1099-int"],
      ["w2"],
    ),
    false,
  );
});

test("tracked mode rejects unknown, inactive, and cross-question option IDs", () => {
  const tracked = trackedQuestion();
  const answers = { "question-1": ["w2"] };
  assert.match(
    validateGuidedRequiredOptionMap(
      [tracked],
      answers,
      { "question-1": ["inactive-option"] },
    )["question.question-1"],
    /active options/,
  );
  assert.match(
    validateGuidedRequiredOptionMap(
      [tracked],
      answers,
      { "other-question": ["w2"] },
    )["question.other-question"],
    /invalid/,
  );
});

test("tracked missing requirements are required minus received", () => {
  const received = ["w2"];
  const required = ["w2", "1099-nec"];
  const missing = getMissingRequiredOptions(
    trackedEvaluation(received, required),
    { "question-1": received },
    { "question-1": required },
  );
  assert.deepEqual(
    missing[0].missingOptions.map((option) => option.id),
    ["1099-nec"],
  );
});

test("follow-up context tracks only current missing required items and reopens on new blockers", () => {
  const task = {
    id: "task-a",
    questionId: "question-1",
    title: "Obtain missing required documents",
    description: "",
    missingOptionIds: ["1099-int"],
    missingOptionLabels: ["1099-INT"],
    assignedUserId: "staff-a",
    dueDate: "2026-10-01",
    completed: true,
  };
  const received = ["w2"];
  const required = ["w2", "1099-nec"];
  const [updated] = reconcileGuidedIntakeFollowUpTasks(
    [task],
    trackedEvaluation(received, required),
    { "question-1": received },
    { "question-1": required },
  );
  assert.deepEqual(updated.missingOptionIds, ["1099-nec"]);
  assert.deepEqual(updated.missingOptionLabels, ["1099-NEC"]);
  assert.equal(updated.completed, false);
});

test("tracked creation plan snapshots only the Case-specific required subset", () => {
  const plan = buildGuidedIntakeCreationPlan(
    {
      organizationId: "organization-a",
      questions: [trackedQuestion()],
      rules: [],
      actions: [],
    },
    { "question-1": ["1099-int", "w2"] },
    { "question-1": ["1099-int", "w2"] },
  );
  assert.deepEqual(
    plan.questions[0].options.map((option) => option.id),
    ["w2", "1099-int"],
  );
});

test("configured required-item UI exposes Received only", () => {
  assert.match(intakeComponent, /Document \/ Item/);
  assert.match(intakeComponent, />Received</);
  assert.match(intakeComponent, /question\.requireAllOptions/);
  assert.match(
    intakeComponent,
    /\$\{selectedCount\} of \$\{question\.options\.length\} received/,
  );
  assert.doesNotMatch(intakeComponent, /onRequiredChange/);
  assert.doesNotMatch(intakeComponent, />Required<\/span>/);
});

test("draft persistence carries required option selections", () => {
  const actions = readFileSync("lib/data/guided-case-intake-actions.ts", "utf8");
  const drafts = readFileSync("lib/data/guided-case-intake-drafts.ts", "utf8");
  assert.match(actions, /required_option_ids: input\.draft\.requiredOptionIds/);
  assert.match(drafts, /required_option_ids/);
  assert.match(drafts, /requiredOptionIds: parseRequiredOptionIds/);
});

test("235000 SQL boundary enforces tracked mode, tenant scoping, exact blockers, snapshots, and Mimms configuration", () => {
  const migration = readFileSync(
    "supabase/migrations/20260926235000_dm3oi_guided_intake_required_option_tracking.sql",
    "utf8",
  );
  assert.match(migration, /add column track_required_options boolean not null default false/);
  assert.match(migration, /not \(require_all_options and track_required_options\)/);
  assert.match(migration, /response_type = 'MULTI_SELECT'/);
  assert.match(migration, /q\.organization_id=target_organization_id[\s\S]*q\.track_required_options/);
  assert.match(migration, /option_row\.question_id=question_row\.id/);
  assert.match(migration, /option_row\.is_active/);
  assert.match(migration, /received option is not required/);
  assert.match(migration, /follow-up Task does not match missing requirements/);
  assert.match(migration, /missing documents prevent follow-up Task completion/);
  assert.match(migration, /private\.create_guided_case_intake/);
  assert.match(migration, /set options_snapshot=coalesce/);
  assert.match(migration, /Case required option snapshot is immutable through intake replay/);
  assert.match(migration, /id='911c69ee-14bd-4391-ae87-f5b34047ea60'/);
  assert.match(migration, /organization_id='e5a00c5a-f028-47f8-bb34-5527219eb995'/);
  assert.match(migration, /set track_required_options=true,[\s\S]*require_all_options=false/);
  assert.doesNotMatch(migration, /set is_active=true/);
});

test("Case Title and Case Type compatibility trigger remains authoritative", () => {
  const compatibility = readFileSync(
    "supabase/migrations/20260926234000_dm3oi_case_title_type_compatibility.sql",
    "utf8",
  );
  const migration = readFileSync(
    "supabase/migrations/20260926235000_dm3oi_guided_intake_required_option_tracking.sql",
    "utf8",
  );
  assert.match(compatibility, /create trigger cases_title_type_compatibility/);
  assert.doesNotMatch(migration, /drop trigger cases_title_type_compatibility/);
  assert.doesNotMatch(migration, /disable trigger/);
});

test("database validator enforces require_all_options", () => {
  const migration = readFileSync(
    "supabase/migrations/20260926210000_dm3oi_require_all_question_options.sql",
    "utf8",
  );

  assert.match(
    migration,
    /add column if not exists require_all_options boolean not null default false/,
  );

  assert.match(
    migration,
    /question_row\.require_all_options/,
  );

  assert.match(
    migration,
    /required_option\.is_active/,
  );

  assert.match(
    migration,
    /set require_all_options=true/,
  );
});
