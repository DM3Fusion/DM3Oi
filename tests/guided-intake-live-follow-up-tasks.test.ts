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
    /select\("intake_follow_up_id,status"\)[\s\S]*status === "IN_PROGRESS"/,
  );

  assert.match(
    component,
    /noticeSentFollowUpIds\.has\(staged\.id\)[\s\S]*Email Sent/,
  );

  assert.match(
    component,
    /sendFollowUpNotice\(staged\)[\s\S]*Send Notice/,
  );
});
