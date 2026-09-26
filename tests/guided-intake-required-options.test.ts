import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  isGuidedQuestionAnswerValid,
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
    /\{selectedCount\}\s*of\s*\{question\.options\.length\}\s*selected/,
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
