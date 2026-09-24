import assert from "node:assert/strict";
import test from "node:test";

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
