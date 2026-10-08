import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateGuidedIntakeQualificationFindings,
  getGuidedIntakeFilingStatusLabel,
} from "../lib/guided-intake-qualification.ts";

const filingId = "filing-status";

const ids = {
  dependents: "d13771bc-1b7b-4ec5-b5e9-8200a89222d2",
  selfEmployment: "9a13d83d-f731-4dd2-8d59-b5ba63cb243c",
  businessExpenses: "a1000000-0000-4000-8000-00000000000a",
  hohUnmarried: "a1000000-0000-4000-8000-000000000011",
  hohHomeCost: "a1000000-0000-4000-8000-000000000012",
  hohPerson: "a1000000-0000-4000-8000-000000000013",
  hohResidency: "a1000000-0000-4000-8000-000000000014",
  qssDeath: "a1000000-0000-4000-8000-000000000021",
  qssRemarried: "a1000000-0000-4000-8000-000000000022",
  qssHome: "a1000000-0000-4000-8000-000000000023",
  qssChild: "a1000000-0000-4000-8000-000000000024",
  dependentVerified: "dependent-verified",
};

const configuration = {
  questions: [
    {
      id: filingId,
      text: "What is the customer's filing status?",
      options: [
        {
          id: "hoh",
          label: "Head of Household",
          value: "HEAD_OF_HOUSEHOLD",
        },
        {
          id: "qss",
          label: "Qualifying Surviving Spouse",
          value: "QUALIFYING_SURVIVING_SPOUSE",
        },
        {
          id: "single",
          label: "Single",
          value: "SINGLE",
        },
      ],
    },
    {
      id: ids.dependentVerified,
      text: "Has dependent information been verified?",
      options: [],
    },
  ],
};

test("resolves filing status label from option id", () => {
  assert.equal(
    getGuidedIntakeFilingStatusLabel(
      configuration,
      { [filingId]: "hoh" },
    ),
    "Head of Household",
  );
});

test("Head of Household exposes unresolved requirements", () => {
  const findings =
    evaluateGuidedIntakeQualificationFindings(
      configuration,
      { [filingId]: "hoh" },
    );

  assert.equal(findings.length, 4);
  assert.ok(
    findings.every(
      (finding) => finding.severity === "REQUIREMENT",
    ),
  );
});

test("affirmative Head of Household answers disappear", () => {
  const findings =
    evaluateGuidedIntakeQualificationFindings(
      configuration,
      {
        [filingId]: "hoh",
        [ids.hohUnmarried]: true,
        [ids.hohHomeCost]: true,
        [ids.hohPerson]: true,
        [ids.hohResidency]: true,
      },
    );

  assert.deepEqual(findings, []);
});

test("negative Head of Household answer becomes an issue", () => {
  const findings =
    evaluateGuidedIntakeQualificationFindings(
      configuration,
      {
        [filingId]: "hoh",
        [ids.hohUnmarried]: true,
        [ids.hohHomeCost]: true,
        [ids.hohPerson]: false,
        [ids.hohResidency]: true,
      },
    );

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.severity, "ISSUE");
  assert.equal(findings[0]?.key, "hoh-qualifying-person");
});

test("Qualifying Surviving Spouse requires dependents and four confirmations", () => {
  const findings =
    evaluateGuidedIntakeQualificationFindings(
      configuration,
      { [filingId]: "qss" },
    );

  assert.equal(findings.length, 5);
});

test("dependent verification remains outstanding when dependents are claimed", () => {
  const findings =
    evaluateGuidedIntakeQualificationFindings(
      configuration,
      {
        [filingId]: "single",
        [ids.dependents]: true,
      },
    );

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.key, "dependent-verification");
});

test("business expenses conflict with no business income", () => {
  const findings =
    evaluateGuidedIntakeQualificationFindings(
      configuration,
      {
        [filingId]: "single",
        [ids.selfEmployment]: false,
        [ids.businessExpenses]: true,
      },
    );

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.key, "business-expense-conflict");
  assert.equal(findings[0]?.severity, "ISSUE");
});
