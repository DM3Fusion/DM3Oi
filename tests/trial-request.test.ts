import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  validateTrialRequest,
} from "../lib/trial-requests.ts";

function validInput() {
  return {
    businessName: "Example Company",
    contactName: "Example User",
    businessEmail: "user@example.com",
    phone: "(804) 555-1212",
    primaryUseCase: "CASE_MANAGEMENT",
    otherUseCase: "",
    estimatedUsers: "15",
    workflowNotes: "We need to coordinate operational work.",
    privacyAcknowledged: true,
  };
}

test("validates a DM3Oi trial request", () => {
  const result = validateTrialRequest(validInput());

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(
      result.data.primaryUseCase,
      "CASE_MANAGEMENT",
    );
    assert.equal(result.data.estimatedUsers, 15);
    assert.equal(
      result.data.businessEmail,
      "user@example.com",
    );
  }
});

test("requires privacy acknowledgement", () => {
  const result = validateTrialRequest({
    ...validInput(),
    privacyAcknowledged: false,
  });

  assert.equal(result.success, false);
});

test("requires details for other operational workflow", () => {
  const result = validateTrialRequest({
    ...validInput(),
    primaryUseCase: "OTHER_OPERATIONAL_WORKFLOW",
    otherUseCase: "",
  });

  assert.equal(result.success, false);
});

test("accepts details for other operational workflow", () => {
  const result = validateTrialRequest({
    ...validInput(),
    primaryUseCase: "OTHER_OPERATIONAL_WORKFLOW",
    otherUseCase: "Custom approval workflow",
  });

  assert.equal(result.success, true);
});

test("Trial Request identity is unique by normalized email", () => {
  const migration = readFileSync(
    "supabase/migrations/20260925110000_dm3oi_unique_trial_request_email.sql",
    "utf8",
  );

  assert.match(
    migration,
    /create unique index trial_requests_business_email_uidx[\s\S]*lower\(trim\(business_email\)\)/,
  );
  assert.match(
    migration,
    /trial request email already exists/,
  );
  assert.match(
    migration,
    /trial request email already belongs to platform identity/,
  );
});

test("duplicate Trial Request email receives a specific public error", () => {
  const action = readFileSync("app/request-trial/actions.ts", "utf8");
  const page = readFileSync("app/request-trial/page.tsx", "utf8");

  assert.match(action, /error=email-exists/);
  assert.match(page, /query\.error === "email-exists"/);
  assert.match(
    page,
    /A trial request or account already exists for this email address/,
  );
});

test("qualification notes are required for Needs Review and Not Fit", () => {
  const migration = readFileSync(
    "supabase/migrations/20260925120000_dm3oi_trial_qualification_notes_requirement.sql",
    "utf8",
  );
  const action = readFileSync(
    "app/admin/trial-requests/[requestId]/actions.ts",
    "utf8",
  );

  assert.match(
    migration,
    /target_workflow_fit in \([\s\S]*'NEEDS_REVIEW'[\s\S]*'NOT_FIT'[\s\S]*\)[\s\S]*and normalized_notes is null/,
  );
  assert.match(
    migration,
    /qualification notes required for workflow fit/,
  );

  assert.match(
    action,
    /workflowFit === "NEEDS_REVIEW"[\s\S]*workflowFit === "NOT_FIT"[\s\S]*!qualificationNotes\.trim\(\)/,
  );
  assert.match(
    action,
    /Qualification notes are required when Workflow Fit is Needs Review or Not Fit\./,
  );
});

test("Fit qualification does not require Qualification Notes", () => {
  const migration = readFileSync(
    "supabase/migrations/20260925120000_dm3oi_trial_qualification_notes_requirement.sql",
    "utf8",
  );

  assert.doesNotMatch(
    migration,
    /target_workflow_fit\s*=\s*'FIT'[\s\S]{0,200}normalized_notes is null/,
  );
  assert.match(
    migration,
    /workflow_fit = target_workflow_fit/,
  );
});

test("Qualification Review explains when notes are required", () => {
  const page = readFileSync(
    "app/admin/trial-requests/[requestId]/page.tsx",
    "utf8",
  );

  assert.match(page, /Qualification Notes/);
  assert.match(
    page,
    /Required for Needs Review or Not Fit/,
  );
  assert.match(page, /name="qualificationNotes"/);
  assert.match(page, /maxLength=\{2000\}/);
});
