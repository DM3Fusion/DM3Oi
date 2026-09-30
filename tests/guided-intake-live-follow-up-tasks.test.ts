import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path: string) => fs.readFileSync(path, "utf8");

test("Guided Intake follow-up Tasks persist immediately against the materialized Case", () => {
  const migration = source(
    "supabase/migrations/20260929120000_dm3oi_guided_intake_live_follow_up_tasks.sql",
  );
  const actions = source("lib/data/guided-case-intake-actions.ts");
  const component = source("components/cases/guided-case-intake.tsx");

  assert.match(
    migration,
    /upsert_guided_intake_follow_up_task[\s\S]*draft_row\.case_id[\s\S]*public\.case_tasks/,
  );
  assert.match(
    migration,
    /intake_follow_up_id=follow_up_id[\s\S]*update public\.case_tasks/,
  );
  assert.match(
    migration,
    /insert into public\.case_tasks[\s\S]*intake_follow_up_id/,
  );
  assert.match(
    migration,
    /canonical_follow_up:=jsonb_build_object\([\s\S]*'title','Obtain missing required documents'/,
  );
  assert.match(
    migration,
    /question_options[\s\S]*option_label[\s\S]*canonical_missing_labels/,
  );
  assert.match(
    migration,
    /update public\.guided_case_intake_drafts[\s\S]*follow_up_tasks=updated_follow_ups/,
  );
  assert.match(
    migration,
    /guided_case_intake_finalize_follow_up_tasks[\s\S]*after update of finalized_at/,
  );
  assert.match(
    migration,
    /reconcile_finalized_guided_intake_follow_up_tasks[\s\S]*status=case[\s\S]*'COMPLETED'::public\.case_task_status[\s\S]*else target_task\.status/,
  );
  assert.match(
    actions,
    /upsertGuidedIntakeFollowUpTaskAction[\s\S]*upsert_guided_intake_follow_up_task/,
  );
  assert.match(actions, /revalidatePath\("\/tasks"\)/);
  assert.match(component, /onSubmit=\{saveFollowUpTask\}/);
  assert.match(component, /"Create Task"/);
  assert.match(component, /"Update Task"/);
  assert.doesNotMatch(component, />Stage Task</);
  assert.doesNotMatch(component, />Staged</);
});


test("Guided Intake reuses the canonical missing-document notice workflow and preserves sent state", () => {
  const actions = source("lib/data/guided-case-intake-actions.ts");
  const component = source("components/cases/guided-case-intake.tsx");
  const drafts = source("lib/data/guided-case-intake-drafts.ts");

  assert.match(
    actions,
    /sendGuidedIntakeMissingDocumentsNoticeAction[\s\S]*sendMissingDocumentsNotice\([\s\S]*mark_intake_requirement_notice_sent/,
  );

  assert.match(
    actions,
    /\.eq\("intake_follow_up_id", followUpId\)/,
  );

  assert.match(
    drafts,
    /select\("id,intake_follow_up_id,status,assigned_user_id,due_at"\)/,
  );
  assert.match(
    drafts,
    /assignedUserId:[\s\S]*persisted\.assigned_user_id/,
  );
  assert.match(
    drafts,
    /dueDate:[\s\S]*persisted\.due_at/,
  );
  assert.match(
    drafts,
    /task\.status === "IN_PROGRESS"[\s\S]*task\.status === "COMPLETED"/,
  );
  assert.match(
    drafts,
    /organization_case_activity[\s\S]*TASK_STARTED[\s\S]*customer_notice_sent/,
  );

  assert.match(
    component,
    /noticeSentFollowUpIds\.has\(activeTask\.id\)[\s\S]*Document Request Sent/,
  );

  assert.match(
    component,
    /sendFollowUpNotice\(activeTask\)[\s\S]*Send Document Request/,
  );

  assert.match(
    component,
    /activeTask[\s\S]*Complete Task[\s\S]*Complete after documents are verified\./,
  );

  assert.match(
    component,
    /activeTask\?\.assignedUserId[\s\S]*draft\.staffUserIds\[0\]/,
  );

  assert.match(
    component,
    /task-notice-sent-pill[\s\S]*Document Request Sent/,
  );

  assert.doesNotMatch(
    component,
    /noticeSentFollowUpIds\.has\(staged\.id\)/,
  );

  assert.match(
    component,
    /completed: existing\?\.completed \?\? false/,
  );
});

test("Guided Intake Task reassignment is Owner or Staff Manager only", () => {
  const configuration = source("lib/data/guided-case-intake.ts");
  const actions = source("lib/data/guided-case-intake-actions.ts");
  const component = source("components/cases/guided-case-intake.tsx");
  const migration = source(
    "supabase/migrations/20260930023000_dm3oi_guided_intake_task_reassignment_guard.sql",
  );

  assert.match(
    configuration,
    /hasPermission\(access,\s*"ASSIGN_TASKS"\)[\s\S]*BUSINESS_OWNER[\s\S]*STAFF_MANAGER/,
  );
  assert.doesNotMatch(
    configuration,
    /canReassignFollowUpTasks[\s\S]{0,300}BUSINESS_ADMIN/,
  );

  assert.match(
    component,
    /configuration\.canReassignFollowUpTasks[\s\S]*name="assignedUserId"/,
  );

  assert.match(
    actions,
    /persistedTask\.assigned_user_id !== task\.assignedUserId[\s\S]*BUSINESS_OWNER[\s\S]*STAFF_MANAGER/,
  );
  assert.match(
    actions,
    /Only a Business Owner or Staff Manager may reassign this Task/,
  );

  assert.match(
    migration,
    /before update of assigned_user_id[\s\S]*on public\.case_tasks/,
  );
  assert.match(
    migration,
    /old\.intake_follow_up_id is null[\s\S]*return new/,
  );
  assert.match(
    migration,
    /BUSINESS_OWNER[\s\S]*STAFF_MANAGER[\s\S]*ASSIGN_TASKS/,
  );
  assert.doesNotMatch(
    migration,
    /BUSINESS_ADMIN'::public\.application_role/,
  );
});

test("received Guided Intake requirements synchronize the real Case Task lifecycle", () => {
  const domain = source("lib/guided-case-intake.ts");
  const actions = source("lib/data/guided-case-intake-actions.ts");
  const component = source("components/cases/guided-case-intake.tsx");

  assert.match(
    domain,
    /completed:\s*missingOptions\.length \|\| !question\?\.valid \? false : true/,
  );

  assert.match(
    actions,
    /\.from\("case_tasks"\)[\s\S]*intake_follow_up_id[\s\S]*sync_guided_intake_requirement_task_status/,
  );

  assert.match(
    actions,
    /completed\s*\?\s*"COMPLETED"[\s\S]*persistedTask\.status === "COMPLETED"[\s\S]*"IN_PROGRESS"/,
  );

  assert.match(
    actions,
    /target_completed:\s*completed/,
  );

  const lifecycleMigration = source(
    "supabase/migrations/20260930030000_dm3oi_guided_intake_requirement_task_lifecycle.sql",
  );

  assert.match(
    lifecycleMigration,
    /create function public\.sync_guided_intake_requirement_task_status/,
  );

  assert.match(
    lifecycleMigration,
    /completed_at=case[\s\S]*completed_by_user_id=case/,
  );

  assert.match(
    lifecycleMigration,
    /draft_completed is distinct from target_completed/,
  );

  assert.doesNotMatch(
    lifecycleMigration,
    /assigned_user_id\s*=/,
  );

  assert.match(
    component,
    /if \(step === 2\)[\s\S]*saveGuidedIntakeDraftAction\([\s\S]*setStep\(3\)/,
  );

  assert.doesNotMatch(
    component,
    /conditional question\{hiddenQuestions\.length/,
  );

  assert.doesNotMatch(
    component,
    /Missing-document Follow-up Tasks[\s\S]{0,1200}onClick=\{\(\) => completeFollowUpTask/,
  );
});
