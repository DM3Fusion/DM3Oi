import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mapGuidedCaseFinalizationError } from "../lib/guided-case-finalization.ts";

const source = (path: string) => readFileSync(path, "utf8");
const action = source("lib/data/guided-case-intake-actions.ts");
const finalization = source(
  "supabase/migrations/20260928110000_dm3oi_guided_intake_finalization_rpc.sql",
);
const caseModel = source(
  "supabase/migrations/20260927160000_dm3oi_guided_intake_case_model.sql",
);

test("Step 6 calls the canonical current-model Portal-aware RPC signature", () => {
  const rpcCall = action.match(
    /\.rpc\(\s*"create_guided_case_intake",[\s\S]*?\n\s*\},\s*\n\s*\);/,
  )?.[0] ?? "";

  assert.match(rpcCall, /target_customer_mode: customerMode/);
  assert.match(rpcCall, /target_tax_year: draft\.taxYear!/);
  assert.match(rpcCall, /target_follow_up_tasks: draft\.followUpTasks/);
  assert.match(rpcCall, /target_portal_onboarding: draft\.portalOnboarding/);
  assert.doesNotMatch(rpcCall, /target_case_title_id/);
  assert.doesNotMatch(rpcCall, /target_required_option_ids/);
  assert.match(
    finalization,
    /target_customer_mode text[\s\S]*target_follow_up_tasks jsonb,[\s\S]*target_portal_onboarding jsonb/,
  );
});

test("canonical finalization preserves current Case Type and Tax Year rules", () => {
  assert.match(caseModel, /semantic_type\.customer_mode/);
  assert.match(caseModel, /tax_year_rule='CURRENT_YEAR'[\s\S]*target_tax_year<>current_tax_year/);
  assert.match(caseModel, /tax_year_rule='PRIOR_YEAR_REQUIRED'[\s\S]*target_tax_year>=current_tax_year/);
  assert.match(caseModel, /target_tax_year is null or target_tax_year not between 1900 and 2200/);
  assert.match(caseModel, /Customer already has a Case for this tax year/);
  assert.match(
    finalization,
    /from public\.create_guided_case_intake\([\s\S]*target_customer_mode[\s\S]*target_tax_year[\s\S]*target_follow_up_tasks[\s\S]*\);/,
  );
});

test("Portal ACTIVE, SENT, and NOT_REQUIRED resolve while unresolved fails closed", () => {
  assert.match(
    finalization,
    /auth_user\.email_confirmed_at is not null[\s\S]*or auth_user\.last_sign_in_at is not null/,
  );
  assert.match(
    finalization,
    /submitted_resolution='INVITATION_SENT'[\s\S]*invitation\.status in \('SENT','ACTIVATED'\)/,
  );
  assert.match(
    finalization,
    /submitted_resolution='NOT_REQUIRED'[\s\S]*submitted_customer_id=target_customer_id[\s\S]*submitted_invitation_id is null/,
  );
  assert.match(
    finalization,
    /if not portal_resolved then[\s\S]*Customer Portal onboarding is unresolved/,
  );
});

test("only the Portal-aware overload remains callable by authenticated users", () => {
  assert.match(
    finalization,
    /revoke all on function public\.create_guided_case_intake\([\s\S]*uuid,uuid\[\],jsonb,jsonb\s*\)[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    finalization,
    /grant execute on function public\.create_guided_case_intake\([\s\S]*uuid,uuid\[\],jsonb,jsonb,jsonb\s*\) to authenticated/,
  );
});

test("atomic model boundary retains validation, generated Tasks, draft completion, and retry reuse", () => {
  assert.match(caseModel, /invalid Case Type/);
  assert.match(caseModel, /invalid manager/);
  assert.match(caseModel, /invalid staff assignment/);
  assert.match(caseModel, /required intake response is missing/);
  assert.match(caseModel, /action\.action_type='CREATE_TASK'/);
  assert.match(caseModel, /insert into public\.case_tasks/);
  assert.match(
    caseModel,
    /if found then[\s\S]*delete from public\.guided_case_intake_drafts[\s\S]*return created_case/,
  );
  assert.match(
    caseModel,
    /exception when unique_violation[\s\S]*intake_submission_key=target_submission_key[\s\S]*return created_case/,
  );
});

test("known finalization failures map to safe actionable messages", () => {
  assert.deepEqual(
    mapGuidedCaseFinalizationError({
      code: "23505",
      message: "Customer already has a Case for this tax year",
    }),
    {
      error: "A Case already exists for this Customer and Tax Year.",
      fieldErrors: {
        customerId: "Select another Customer or choose a different Tax Year.",
      },
      step: 0,
    },
  );
  assert.equal(
    mapGuidedCaseFinalizationError({ message: "invalid Case Type" }).error,
    "The selected Case Type is no longer available.",
  );
  assert.equal(
    mapGuidedCaseFinalizationError({ message: "invalid staff assignment" }).error,
    "An assignment is no longer valid.",
  );
  assert.equal(
    mapGuidedCaseFinalizationError({ message: "required intake response is missing" }).error,
    "A required intake response is incomplete.",
  );
  assert.equal(
    mapGuidedCaseFinalizationError({ message: "Customer Portal onboarding is unresolved" }).error,
    "Customer Portal access must be resolved before creating this Case.",
  );
});

test("unknown database failures stay private while diagnostics retain operation context", () => {
  assert.deepEqual(
    mapGuidedCaseFinalizationError({
      code: "XX000",
      message: "raw database implementation detail",
    }),
    {
      error: "The Case could not be created. Please try again.",
      fieldErrors: {},
      step: 5,
    },
  );
  assert.match(action, /operation: "create_guided_case_intake"/);
  assert.match(action, /submissionKey: draft\.submissionKey/);
  assert.match(action, /customerId: draft\.customerId/);
  assert.match(action, /caseTypeId: draft\.caseTypeId/);
  assert.match(action, /taxYear: draft\.taxYear/);
  assert.match(action, /details: error\?\.details/);
  assert.match(action, /hint: error\?\.hint/);
  assert.doesNotMatch(
    source("components/cases/guided-case-intake.tsx"),
    /error\?\.(?:message|details|hint)/,
  );
});
