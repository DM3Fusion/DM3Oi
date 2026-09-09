import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateCaseRules, type RuleEvaluationAction, type RuleEvaluationDefinition, type RuleEvaluationOption, type RuleEvaluationQuestion } from "../lib/rule-evaluator.ts";

const ORG = "organization-a";
const OTHER_ORG = "organization-b";
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const question = (id: string, type: RuleEvaluationQuestion["response_type"], response_value?: RuleEvaluationQuestion["response_value"], required = false, organization_id = ORG): RuleEvaluationQuestion => ({ id: `case-${id}`, organization_id, question_definition_id: id, response_type: type, required, response_value });
const option = (id: string, question_id: string, option_value: string, organization_id = ORG): RuleEvaluationOption => ({ id, organization_id, question_id, option_value });
const rule = (id: string, source_question_id: string, condition_operator: RuleEvaluationDefinition["condition_operator"], condition_option_id: string | null = null, active = true, organization_id = ORG): RuleEvaluationDefinition => ({ id, organization_id, name: id, source_question_id, condition_operator, condition_option_id, active });
const action = (id: string, rule_definition_id: string, action_type: RuleEvaluationAction["action_type"], target_question_id: string | null = "target", organization_id = ORG): RuleEvaluationAction => ({ id, organization_id, rule_definition_id, action_type, target_question_id, task_title: null, task_description: null, task_priority: null, task_required: null, task_blocking: null });
const matched = (sourceQuestion: RuleEvaluationQuestion, definition: RuleEvaluationDefinition, options: RuleEvaluationOption[] = []) => evaluateCaseRules({ organizationId: ORG, questions: [sourceQuestion, question("target", "TEXT")], options, rules: [definition], actions: [action("show", definition.id, "SHOW_QUESTION")] }).matchedRules.length === 1;

test("YES_NO operators distinguish true false and unanswered", () => {
  assert.equal(matched(question("yes", "YES_NO", true), rule("yes-rule", "yes", "IS_YES")), true);
  assert.equal(matched(question("yes", "YES_NO", false), rule("yes-rule", "yes", "IS_YES")), false);
  assert.equal(matched(question("yes", "YES_NO"), rule("yes-rule", "yes", "IS_YES")), false);
  assert.equal(matched(question("yes", "YES_NO", false), rule("no-rule", "yes", "IS_NO")), true);
  assert.equal(matched(question("yes", "YES_NO", true), rule("no-rule", "yes", "IS_NO")), false);
  assert.equal(matched(question("yes", "YES_NO"), rule("no-rule", "yes", "IS_NO")), false);
});

test("SINGLE_SELECT uses stable option UUIDs and unanswered is not NOT_EQUALS", () => {
  const options = [option("regulatory-id", "sign-type", "regulatory"), option("custom-id", "sign-type", "custom")];
  assert.equal(matched(question("sign-type", "SINGLE_SELECT", "regulatory"), rule("equals", "sign-type", "EQUALS", "regulatory-id"), options), true);
  assert.equal(matched(question("sign-type", "SINGLE_SELECT", "custom"), rule("not-equals", "sign-type", "NOT_EQUALS", "regulatory-id"), options), true);
  assert.equal(matched(question("sign-type", "SINGLE_SELECT", "Regulatory"), rule("label-does-not-match", "sign-type", "EQUALS", "regulatory-id"), options), false);
  assert.equal(matched(question("sign-type", "SINGLE_SELECT"), rule("unanswered", "sign-type", "NOT_EQUALS", "regulatory-id"), options), false);
});

test("MULTI_SELECT membership is UUID-based and NOT_CONTAINS requires an answer", () => {
  const options = [option("permit-id", "documents", "permit"), option("photo-id", "documents", "photo")];
  assert.equal(matched(question("documents", "MULTI_SELECT", ["permit", "photo"]), rule("contains", "documents", "CONTAINS", "photo-id"), options), true);
  assert.equal(matched(question("documents", "MULTI_SELECT", ["permit"]), rule("not-contains", "documents", "NOT_CONTAINS", "photo-id"), options), true);
  assert.equal(matched(question("documents", "MULTI_SELECT", ["photo"]), rule("not-contains", "documents", "NOT_CONTAINS", "photo-id"), options), false);
  assert.equal(matched(question("documents", "MULTI_SELECT"), rule("unanswered", "documents", "NOT_CONTAINS", "photo-id"), options), false);
  assert.equal(matched(question("documents", "MULTI_SELECT", []), rule("empty", "documents", "NOT_CONTAINS", "photo-id"), options), false);
});

test("general answered operators use response-type-appropriate meaningful answers", () => {
  assert.equal(matched(question("notes", "TEXT", "  verified  "), rule("answered", "notes", "IS_ANSWERED")), true);
  assert.equal(matched(question("notes", "TEXT", "   "), rule("answered", "notes", "IS_ANSWERED")), false);
  assert.equal(matched(question("count", "NUMBER", 0), rule("number", "count", "IS_ANSWERED")), true);
  assert.equal(matched(question("confirmed", "YES_NO", false), rule("boolean", "confirmed", "IS_ANSWERED")), true);
  assert.equal(matched(question("notes", "LONG_TEXT"), rule("not-answered", "notes", "IS_NOT_ANSWERED")), true);
  assert.equal(matched(question("notes", "LONG_TEXT", "done"), rule("not-answered", "notes", "IS_NOT_ANSWERED")), false);
});

test("SHOW and REQUIRE control conditional applicability with OR semantics", () => {
  const questions = [question("source-a", "YES_NO", false), question("source-b", "YES_NO", true), question("target", "TEXT")];
  const rules = [rule("false-show", "source-a", "IS_YES"), rule("true-show", "source-b", "IS_YES"), rule("false-require", "source-a", "IS_YES")];
  const actions = [action("a", "false-show", "SHOW_QUESTION"), action("b", "true-show", "SHOW_QUESTION"), action("c", "false-require", "REQUIRE_QUESTION")];
  const target = evaluateCaseRules({ organizationId: ORG, questions, options: [], rules, actions }).questions.find((item) => item.questionId === "target")!;
  assert.equal(target.applicable, true);
  assert.equal(target.required, false);
  assert.deepEqual(target.showRuleIds, ["true-show"]);
});

test("REQUIRE implies SHOW and baseline required can never be removed", () => {
  const trueResult = evaluateCaseRules({ organizationId: ORG, questions: [question("source", "YES_NO", true), question("target", "TEXT")], options: [], rules: [rule("require", "source", "IS_YES")], actions: [action("require-action", "require", "REQUIRE_QUESTION")] });
  const conditional = trueResult.questions.find((item) => item.questionId === "target")!;
  assert.equal(conditional.applicable, true);
  assert.equal(conditional.required, true);
  const falseResult = evaluateCaseRules({ organizationId: ORG, questions: [question("source", "YES_NO", false), question("target", "TEXT", undefined, true)], options: [], rules: [rule("require", "source", "IS_YES")], actions: [action("require-action", "require", "REQUIRE_QUESTION")] });
  const baseline = falseResult.questions.find((item) => item.questionId === "target")!;
  assert.equal(baseline.baselineRequired, true);
  assert.equal(baseline.applicable, true);
  assert.equal(baseline.required, true);
});

test("inactive Rules have no effect and do not make baseline Questions conditional", () => {
  const result = evaluateCaseRules({ organizationId: ORG, questions: [question("source", "YES_NO", true), question("target", "TEXT")], options: [], rules: [rule("inactive", "source", "IS_YES", null, false)], actions: [action("inactive-action", "inactive", "REQUIRE_QUESTION")] });
  assert.deepEqual(result.matchedRules, []);
  assert.equal(result.questions.find((item) => item.questionId === "target")?.applicable, true);
  assert.equal(result.questions.find((item) => item.questionId === "target")?.required, false);
});

test("Fobbs Regulatory response toggles applicability without mutating its stored target answer", () => {
  const regulatory = option("regulatory-id", "sign-type", "regulatory");
  const definition = rule("Regulatory Sign Field Verification", "sign-type", "EQUALS", regulatory.id);
  const requireAction = action("require-field", definition.id, "REQUIRE_QUESTION", "field-verified");
  const evaluate = (sourceValue: string) => {
    const target = question("field-verified", "YES_NO", true);
    const result = evaluateCaseRules({ organizationId: ORG, questions: [question("sign-type", "SINGLE_SELECT", sourceValue), target], options: [regulatory, option("custom-id", "sign-type", "custom")], rules: [definition], actions: [requireAction] });
    return { target, evaluated: result.questions.find((item) => item.questionId === "field-verified")! };
  };
  const on = evaluate("regulatory");
  assert.equal(on.evaluated.applicable, true);
  assert.equal(on.evaluated.required, true);
  const off = evaluate("custom");
  assert.equal(off.evaluated.applicable, false);
  assert.equal(off.target.response_value, true);
  assert.equal(evaluate("regulatory").target.response_value, true);
});

test("a retained answer on a hidden source does not keep downstream Questions applicable", () => {
  const questions = [question("root", "YES_NO", false), question("conditional-source", "YES_NO", true), question("downstream", "TEXT")];
  const rules = [rule("show-source", "root", "IS_YES"), rule("show-downstream", "conditional-source", "IS_YES")];
  const actions = [action("source-action", "show-source", "SHOW_QUESTION", "conditional-source"), action("downstream-action", "show-downstream", "SHOW_QUESTION", "downstream")];
  const result = evaluateCaseRules({ organizationId: ORG, questions, options: [], rules, actions });
  assert.equal(result.questions.find((item) => item.questionId === "conditional-source")?.applicable, false);
  assert.equal(result.questions.find((item) => item.questionId === "downstream")?.applicable, false);
  assert.deepEqual(result.matchedRules, []);
});

test("CREATE_TASK is returned as an effective template without creating or mutating Tasks", () => {
  const taskAction: RuleEvaluationAction = { ...action("task-action", "Regulatory Installation Task", "CREATE_TASK", null), task_title: "Verify regulatory sign installation", task_description: "Verify in field", task_priority: "HIGH", task_required: true, task_blocking: true };
  const inputTasks = [{ id: "existing-task" }];
  const result = evaluateCaseRules({ organizationId: ORG, questions: [question("sign-type", "SINGLE_SELECT", "regulatory")], options: [option("regulatory-id", "sign-type", "regulatory")], rules: [rule("Regulatory Installation Task", "sign-type", "EQUALS", "regulatory-id")], actions: [taskAction] });
  assert.deepEqual(result.effectiveTaskActions, [{ actionId: "task-action", ruleId: "Regulatory Installation Task", ruleName: "Regulatory Installation Task", title: "Verify regulatory sign installation", description: "Verify in field", priority: "HIGH", required: true, blocking: true }]);
  assert.deepEqual(inputTasks, [{ id: "existing-task" }]);
});

test("cross-tenant Questions Rules options and actions are excluded", () => {
  const result = evaluateCaseRules({
    organizationId: ORG,
    questions: [question("source", "YES_NO", true), question("target", "TEXT"), question("foreign", "TEXT", undefined, false, OTHER_ORG)],
    options: [option("foreign-option", "source", "yes", OTHER_ORG)],
    rules: [rule("local", "source", "IS_YES"), rule("foreign", "source", "IS_YES", null, true, OTHER_ORG)],
    actions: [action("local-action", "local", "SHOW_QUESTION"), action("foreign-action", "foreign", "REQUIRE_QUESTION", "target", OTHER_ORG)],
  });
  assert.deepEqual(result.matchedRules, [{ id: "local", name: "local" }]);
  assert.equal(result.questions.some((item) => item.questionId === "foreign"), false);
  assert.equal(result.questions.find((item) => item.questionId === "target")?.required, false);
});

test("Case integration remains server-authorized evaluation-only UI", () => {
  const repository = source("lib/data/question-repository.ts");
  const ui = source("components/cases/case-questions.tsx");
  const actions = source("lib/data/question-actions.ts");
  assert.match(repository, /\.from\("organization_cases"\)[\s\S]*?\.eq\("organization_id", organizationId\)[\s\S]*?\.eq\("id", caseId\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(repository, /if \(!authorizedCase\.data\) throw new Error\("Case questions are not available for this Case\."\)/);
  assert.match(repository, /evaluateCaseRules/);
  assert.match(repository, /\.from\("rule_definitions"\)[\s\S]*?\.select\("id,organization_id,name,source_question_id,condition_operator,condition_option_id,active"\)/);
  assert.match(repository, /\.from\("rule_actions"\)[\s\S]*?\.select\("id,organization_id,rule_definition_id,action_type,target_question_id,task_title,task_description,task_priority,task_required,task_blocking"\)/);
  assert.match(ui, /Not applicable/);
  assert.match(ui, /effectiveRequired/);
  assert.match(actions, /revalidatePath\(`\/cases\/\$\{caseId\}`\)/);
  assert.doesNotMatch(repository + ui, /insert\([\s\S]*case_tasks|\.from\("case_tasks"\)/);
});
