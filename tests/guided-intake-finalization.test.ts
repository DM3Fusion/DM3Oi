import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mapGuidedCaseFinalizationError } from "../lib/guided-case-finalization.ts";

const source = (path: string) => readFileSync(path, "utf8");
const action = source("lib/data/guided-case-intake-actions.ts");
const finalization = source(
  "supabase/migrations/20260928130000_dm3oi_guided_intake_case_persistence.sql",
);
test("Step 6 calls the linked-Case Portal-aware finalization RPC", () => {
  const rpcCall = action.match(
    /\.rpc\(\s*"finalize_guided_case_intake",[\s\S]*?\n\s*\},\s*\n\s*\);/,
  )?.[0] ?? "";

  assert.match(rpcCall, /target_customer_mode: customerMode/);
  assert.match(rpcCall, /target_customer_id: linkedCase\.customer_id/);
  assert.match(rpcCall, /target_case_type_id: linkedCase\.case_type_id/);
  assert.match(rpcCall, /target_tax_year: linkedCase\.tax_year!/);
  assert.match(
    rpcCall,
    /target_manager_user_id: configuration\.canAssign[\s\S]*\? draft\.managerUserId \|\| null[\s\S]*: null/,
  );
  assert.match(
    rpcCall,
    /target_staff_user_ids: configuration\.canAssign[\s\S]*\? draft\.staffUserIds[\s\S]*: \[access\.user\.id\]/,
  );
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
  assert.match(finalization, /semantic_type\.customer_mode/);
  assert.match(finalization, /tax_year_rule='CURRENT_YEAR'[\s\S]*target_tax_year<>current_tax_year/);
  assert.match(finalization, /tax_year_rule='PRIOR_YEAR_REQUIRED'[\s\S]*target_tax_year>=current_tax_year/);
  assert.match(finalization, /target_tax_year is null or target_tax_year not between 1900 and 2200/);
  assert.match(finalization, /Customer already has an unrelated Case for this tax year/);
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

test("legacy deployment signature delegates to the linked-Case finalizer", () => {
  assert.match(
    finalization,
    /create or replace function public\.create_guided_case_intake\([\s\S]*perform public\.materialize_guided_case_intake\([\s\S]*from public\.finalize_guided_case_intake\(/,
  );
  assert.match(
    finalization,
    /grant execute on function public\.finalize_guided_case_intake\([\s\S]*uuid,uuid\[\],jsonb,jsonb,jsonb[\s\S]*to authenticated/,
  );
  assert.match(
    finalization,
    /revoke all on function public\.create_guided_case_intake\([\s\S]*from public,anon;[\s\S]*grant execute on function public\.create_guided_case_intake/,
  );
});

test("atomic linked-Case boundary retains validation, Tasks, and retry reuse", () => {
  assert.match(finalization, /invalid Case Type/);
  assert.match(finalization, /invalid manager/);
  assert.match(finalization, /invalid staff assignment/);
  assert.match(finalization, /required intake response is missing/);
  assert.match(finalization, /action\.action_type='CREATE_TASK'/);
  assert.match(finalization, /insert into public\.case_tasks/);
  assert.match(finalization, /draft_row\.finalized_at is not null[\s\S]*return item/);
  const canonicalFinalizer = finalization.slice(
    finalization.indexOf("create function public.finalize_guided_case_intake"),
    finalization.indexOf("create or replace function public.create_guided_case_intake"),
  );
  assert.doesNotMatch(
    canonicalFinalizer,
    /insert into public\.cases/,
  );
});

test("known finalization failures map to safe actionable messages", () => {
  assert.deepEqual(
    mapGuidedCaseFinalizationError({
      code: "23505",
      message: "Customer already has a Case for this tax year",
    }),
    {
      error:
        "A Case already exists for this Customer and Tax Year. Open the existing Case or resume its Guided Intake.",
      fieldErrors: {
        customerId: "Open the existing Case or resume its Guided Intake.",
      },
      step: 1,
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
    "Customer Portal access must be resolved before finishing this intake.",
  );
});

test("unknown database failures stay private while diagnostics retain operation context", () => {
  assert.deepEqual(
    mapGuidedCaseFinalizationError({
      code: "XX000",
      message: "raw database implementation detail",
    }),
    {
      error: "The Guided Intake could not be finalized. Please try again.",
      fieldErrors: {},
      step: 5,
    },
  );
  assert.deepEqual(
    mapGuidedCaseFinalizationError(
      { code: "XX000", message: "raw database implementation detail" },
      "materialize",
    ),
    {
      error: "The Case could not be established. Please try again.",
      fieldErrors: {},
      step: 1,
    },
  );
  assert.match(action, /operation: "finalize_guided_case_intake"/);
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
