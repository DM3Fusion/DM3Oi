import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isGuidedQuestionAnswerComplete,
  isGuidedQuestionAnswerValid,
  type GuidedIntakeQuestion,
} from "../lib/guided-case-intake.ts";

const migration = readFileSync(
  "supabase/migrations/20260927003000_dm3oi_yes_required_question_completion.sql",
  "utf8",
);

const editor = readFileSync(
  "components/question-options-editor.tsx",
  "utf8",
);

const loader = readFileSync(
  "lib/data/guided-case-intake.ts",
  "utf8",
);

const action = readFileSync(
  "lib/data/question-actions.ts",
  "utf8",
);

const yesNo = (
  completionCondition: "ANY_ANSWER" | "YES_REQUIRED",
): GuidedIntakeQuestion => ({
  id: "question-1",
  text: "Verification",
  description: "",
  responseType: "YES_NO",
  required: true,
  requireAllOptions: false,
  trackRequiredOptions: false,
  completionCondition,
  group: null,
  displayOrder: 1,
  options: [],
});

test("No remains a structurally valid YES_NO answer", () => {
  const question = yesNo("YES_REQUIRED");

  assert.equal(
    isGuidedQuestionAnswerValid(question, false),
    true,
  );
});

test("ANY_ANSWER allows either Yes or No to complete the Question", () => {
  const question = yesNo("ANY_ANSWER");

  assert.equal(
    isGuidedQuestionAnswerComplete(question, true),
    true,
  );

  assert.equal(
    isGuidedQuestionAnswerComplete(question, false),
    true,
  );
});

test("YES_REQUIRED accepts No as an answer but leaves the Question outstanding", () => {
  const question = yesNo("YES_REQUIRED");

  assert.equal(
    isGuidedQuestionAnswerValid(question, false),
    true,
  );

  assert.equal(
    isGuidedQuestionAnswerComplete(question, false),
    false,
  );

  assert.equal(
    isGuidedQuestionAnswerComplete(question, true),
    true,
  );
});

test("Question editor exposes explicit YES-required completion semantics", () => {
  assert.match(editor, /name="completionCondition"/);
  assert.match(editor, /Either Yes or No completes the Question/);
  assert.match(editor, /Yes is required to complete the Question/);
  assert.match(action, /target_completion_condition/);
  assert.match(loader, /completion_condition/);
});

test("database keeps validity separate from completion", () => {
  assert.match(
    migration,
    /create or replace function public\.guided_intake_response_complete/,
  );

  assert.match(
    migration,
    /public\.guided_intake_response_valid/,
  );

  assert.match(
    migration,
    /completion_condition='YES_REQUIRED'/,
  );

  assert.match(
    migration,
    /target_value='true'::jsonb/,
  );

  assert.match(
    migration,
    /public\.guided_intake_response_complete\(/,
  );
});

test("Mimms satisfaction Questions require Yes while branch Questions remain ANY_ANSWER", () => {
  assert.match(
    migration,
    /Is identity verification complete\?/,
  );

  assert.match(
    migration,
    /Has dependent information been verified\?/,
  );

  assert.match(
    migration,
    /Have required business income and expense records been received\?/,
  );

  assert.doesNotMatch(
    migration,
    /question_text in \([\s\S]*Are dependents being claimed\?/,
  );

  assert.doesNotMatch(
    migration,
    /question_text in \([\s\S]*Is self-employment or business income involved\?/,
  );

  assert.match(
    migration,
    /Expected 3 Mimms YES_REQUIRED Questions/,
  );
});
