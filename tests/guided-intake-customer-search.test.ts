import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(
  "components/cases/guided-case-intake.tsx",
  "utf8",
);

const css = readFileSync("app/globals.css", "utf8");

test("Guided Intake Customer search filters by Customer number or name", () => {
  assert.match(
    component,
    /const normalizedCustomerSearch = customerSearch\.trim\(\)\.toLowerCase\(\)/,
  );
  assert.match(
    component,
    /`\$\{customer\.customerNumber\} \$\{customer\.name\}`[\s\S]*\.includes\(normalizedCustomerSearch\)/,
  );
});

test("active Customer search exposes the filtered results instead of hiding them in a closed select", () => {
  assert.match(
    component,
    /customerSearchActive[\s\S]*size=\{[\s\S]*Math\.min\(Math\.max\(filtered\.length \+ 1, 2\), 8\)/,
  );
  assert.match(
    component,
    /className=\{[\s\S]*"intake-customer-select filtered"/,
  );
  assert.match(css, /\.intake-customer-select\.filtered\{/);
});

test("Customer search reports matching and empty result states", () => {
  assert.match(component, /matching Customer/);
  assert.match(component, /No Customers match this search\./);
  assert.match(component, /aria-live="polite"/);
});

test("selecting a filtered Customer restores the normal picker", () => {
  assert.match(
    component,
    /selectCustomer\(event\.target\.value\);[\s\S]*setCustomerSearch\(""\)/,
  );
});
