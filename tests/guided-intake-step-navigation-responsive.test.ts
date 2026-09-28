import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  "components/cases/guided-case-intake.tsx",
  "utf8",
);
const css = readFileSync("app/globals.css", "utf8");
const finalPhoneRule = css.slice(
  css.lastIndexOf("@media (max-width: 600px)", css.indexOf(".intake-actions-left .secondary-button:hover")),
  css.indexOf(".intake-actions-left .secondary-button:hover"),
);

test("Guided Intake keeps one accessible six-step navigation", () => {
  assert.equal(component.match(/<ol className="intake-stepper"/g)?.length, 1);
  assert.match(component, /<ol className="intake-stepper" aria-label="Case intake progress">/);
  assert.match(component, /guidedCaseIntakeSteps\.map/);
  assert.match(component, /aria-current=\{current \? "step" : undefined\}/);
  assert.match(component, /className="intake-step-tab"/);
});

test("phone step navigation is an equal-width three-column two-row grid", () => {
  assert.match(finalPhoneRule, /@media \(max-width: 600px\)/);
  assert.match(
    finalPhoneRule,
    /\.intake-stepper\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
  );
  assert.match(finalPhoneRule, /\.intake-stepper li\s*\{[\s\S]*min-width:\s*0/);
  assert.match(
    finalPhoneRule,
    /\.intake-step-tab\s*\{[\s\S]*max-width:\s*100%[\s\S]*min-height:\s*clamp\(60px, 11vw, 72px\)/,
  );
  assert.match(finalPhoneRule, /border-bottom:\s*1px solid #c7d0dc/);
  assert.match(
    finalPhoneRule,
    /> span\s*\{[\s\S]*font-size:\s*10px/,
  );
  assert.match(
    finalPhoneRule,
    /> b\s*\{[\s\S]*font-size:\s*13px[\s\S]*line-height:\s*1\.18/,
  );
  assert.match(finalPhoneRule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(finalPhoneRule, /overflow-x:\s*(?:auto|scroll)/);
});

test("tablet and desktop retain the existing six-column presentation", () => {
  const desktopRule = css.slice(
    css.indexOf("/* Guided Intake six-tab navigation."),
    css.indexOf("@media (max-width: 850px)", css.indexOf("/* Guided Intake six-tab navigation.")),
  );
  const tabletRule = css.slice(
    css.indexOf("@media (max-width: 850px)", css.indexOf("/* Guided Intake six-tab navigation.")),
    css.indexOf("@media (max-width: 600px)", css.indexOf("/* Guided Intake six-tab navigation.")),
  );

  assert.match(desktopRule, /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(tabletRule, /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);
});
