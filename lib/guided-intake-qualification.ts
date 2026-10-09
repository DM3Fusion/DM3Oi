export type GuidedIntakeQualificationSeverity =
  | "REQUIREMENT"
  | "ISSUE";

export type GuidedIntakeQualificationFinding = {
  key: string;
  severity: GuidedIntakeQualificationSeverity;
  title: string;
  message: string;
  questionIds: string[];
};

type QualificationOption = {
  id: string;
  label: string;
  value?: string;
};

type QualificationQuestion = {
  id: string;
  text: string;
  options?: QualificationOption[];
};

type QualificationConfiguration = {
  questions: QualificationQuestion[];
};

type QualificationAnswers = Record<string, unknown>;

const questionIds = {
  spouseWages: "a1000000-0000-4000-8000-000000000002",
  businessExpenses: "a1000000-0000-4000-8000-00000000000a",
  selfEmployment: "9a13d83d-f731-4dd2-8d59-b5ba63cb243c",
  dependentsClaimed: "d13771bc-1b7b-4ec5-b5e9-8200a89222d2",

  hohUnmarried: "a1000000-0000-4000-8000-000000000011",
  hohHomeCost: "a1000000-0000-4000-8000-000000000012",
  hohQualifyingPerson: "a1000000-0000-4000-8000-000000000013",
  hohResidency: "a1000000-0000-4000-8000-000000000014",

  qssDeathPeriod: "a1000000-0000-4000-8000-000000000021",
  qssNotRemarried: "a1000000-0000-4000-8000-000000000022",
  qssHome: "a1000000-0000-4000-8000-000000000023",
  qssChild: "a1000000-0000-4000-8000-000000000024",
} as const;

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-");
}

function questionByText(
  configuration: QualificationConfiguration,
  text: string,
) {
  const target = normalize(text);

  return configuration.questions.find(
    (question) => normalize(question.text) === target,
  );
}

export function getGuidedIntakeFilingStatusLabel(
  configuration: QualificationConfiguration,
  answers: QualificationAnswers,
) {
  const filingQuestion = configuration.questions.find((question) =>
    normalize(question.text).includes("filing status"),
  );

  if (!filingQuestion) return null;

  const answer = answers[filingQuestion.id];

  if (typeof answer !== "string") return null;

  const option = (filingQuestion.options ?? []).find(
    (candidate) =>
      candidate.id === answer ||
      candidate.value === answer,
  );

  return option?.label ?? null;
}

function unresolvedAffirmativeRequirement(
  answers: QualificationAnswers,
  questionId: string,
  key: string,
  title: string,
  requirementMessage: string,
  issueMessage: string,
): GuidedIntakeQualificationFinding | null {
  const answer = answers[questionId];

  if (answer === true) return null;

  if (answer === false) {
    return {
      key,
      severity: "ISSUE",
      title,
      message: issueMessage,
      questionIds: [questionId],
    };
  }

  return {
    key,
    severity: "REQUIREMENT",
    title,
    message: requirementMessage,
    questionIds: [questionId],
  };
}

export function evaluateGuidedIntakeQualificationFindings(
  configuration: QualificationConfiguration,
  answers: QualificationAnswers,
): GuidedIntakeQualificationFinding[] {
  const findings: GuidedIntakeQualificationFinding[] = [];
  const filingStatus = getGuidedIntakeFilingStatusLabel(
    configuration,
    answers,
  );

  if (normalize(filingStatus ?? "") === "head of household") {
    const requirements = [
      unresolvedAffirmativeRequirement(
        answers,
        questionIds.hohUnmarried,
        "hoh-unmarried",
        "Unmarried status",
        "Confirm that the taxpayer is unmarried or considered unmarried.",
        "The taxpayer is not currently confirmed as unmarried or considered unmarried for Head of Household.",
      ),
      unresolvedAffirmativeRequirement(
        answers,
        questionIds.hohHomeCost,
        "hoh-home-cost",
        "Household cost",
        "Confirm that the taxpayer paid more than half the cost of keeping up the home.",
        "The taxpayer did not pay more than half the cost of keeping up the home, which conflicts with Head of Household eligibility.",
      ),
      unresolvedAffirmativeRequirement(
        answers,
        questionIds.hohQualifyingPerson,
        "hoh-qualifying-person",
        "Qualifying person",
        "Identify and confirm a qualifying person for Head of Household.",
        "No qualifying person is currently confirmed for Head of Household.",
      ),
      unresolvedAffirmativeRequirement(
        answers,
        questionIds.hohResidency,
        "hoh-residency",
        "Residency requirement",
        "Confirm that the qualifying person meets the applicable household residency requirement.",
        "The qualifying person does not currently meet the applicable household residency requirement.",
      ),
    ];

    findings.push(
      ...requirements.filter(
        (
          finding,
        ): finding is GuidedIntakeQualificationFinding =>
          finding !== null,
      ),
    );
  }

  if (
    normalize(filingStatus ?? "") ===
    "qualifying surviving spouse"
  ) {
    const dependentsAnswer =
      answers[questionIds.dependentsClaimed];

    if (dependentsAnswer !== true) {
      findings.push({
        key: "qss-dependents",
        severity:
          dependentsAnswer === false
            ? "ISSUE"
            : "REQUIREMENT",
        title: "Dependent child requirement",
        message:
          dependentsAnswer === false
            ? "Dependents are marked No, which conflicts with Qualifying Surviving Spouse eligibility."
            : "Confirm that the taxpayer is claiming the qualifying dependent child required for Qualifying Surviving Spouse status.",
        questionIds: [questionIds.dependentsClaimed],
      });
    }

    const requirements = [
      unresolvedAffirmativeRequirement(
        answers,
        questionIds.qssDeathPeriod,
        "qss-death-period",
        "Spouse death period",
        "Confirm that the spouse died within the applicable Qualifying Surviving Spouse period.",
        "The spouse-death timing does not currently support Qualifying Surviving Spouse status.",
      ),
      unresolvedAffirmativeRequirement(
        answers,
        questionIds.qssNotRemarried,
        "qss-not-remarried",
        "Remarriage requirement",
        "Confirm that the taxpayer has not remarried.",
        "The taxpayer is currently marked as remarried, which conflicts with Qualifying Surviving Spouse status.",
      ),
      unresolvedAffirmativeRequirement(
        answers,
        questionIds.qssHome,
        "qss-home",
        "Household requirement",
        "Confirm that the taxpayer maintained the required household.",
        "The household-maintenance answer does not currently support Qualifying Surviving Spouse status.",
      ),
      unresolvedAffirmativeRequirement(
        answers,
        questionIds.qssChild,
        "qss-child",
        "Qualifying dependent child",
        "Confirm the qualifying dependent child requirement.",
        "A qualifying dependent child is not currently confirmed for Qualifying Surviving Spouse status.",
      ),
    ];

    findings.push(
      ...requirements.filter(
        (
          finding,
        ): finding is GuidedIntakeQualificationFinding =>
          finding !== null,
      ),
    );
  }

  const dependentVerification = questionByText(
    configuration,
    "Has dependent information been verified?",
  );

  if (
    answers[questionIds.dependentsClaimed] === true &&
    dependentVerification &&
    answers[dependentVerification.id] !== true
  ) {
    const answer = answers[dependentVerification.id];

    findings.push({
      key: "dependent-verification",
      severity: answer === false ? "ISSUE" : "REQUIREMENT",
      title: "Dependent information",
      message:
        answer === false
          ? "Dependents are being claimed, but dependent information is marked as not verified."
          : "Dependents are being claimed. Verify the dependent information before completing intake.",
      questionIds: [
        questionIds.dependentsClaimed,
        dependentVerification.id,
      ],
    });
  }

  if (
    answers[questionIds.selfEmployment] === false &&
    answers[questionIds.businessExpenses] === true
  ) {
    findings.push({
      key: "business-expense-conflict",
      severity: "ISSUE",
      title: "Business information",
      message:
        "Business expenses are marked Yes while self-employment or business income is marked No. Review the business-income answers.",
      questionIds: [
        questionIds.selfEmployment,
        questionIds.businessExpenses,
      ],
    });
  }

  return findings;
}

export function evaluateGuidedIntakeFilingStatusQualificationFindings(
  configuration: QualificationConfiguration,
  answers: QualificationAnswers,
): GuidedIntakeQualificationFinding[] {
  return evaluateGuidedIntakeQualificationFindings(
    configuration,
    answers,
  ).filter(
    (finding) =>
      finding.key.startsWith("hoh-") ||
      finding.key.startsWith("qss-"),
  );
}
