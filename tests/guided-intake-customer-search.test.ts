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
    /customer\.customerNumber[\s\S]*customer\.name[\s\S]*customer\.email[\s\S]*\.includes\(normalizedCustomerSearch\)/,
  );
});

test("active Customer search exposes professional visible result rows", () => {
  assert.match(
    component,
    /customerSearchActive[\s\S]*className="intake-customer-results"/,
  );
  assert.match(component, /role="listbox"/);
  assert.match(component, /className="intake-customer-result-main"/);
  assert.match(component, /className="intake-customer-result-action"/);
  assert.match(css, /\.intake-customer-results\{/);
  assert.match(css, /\.intake-customer-result\{/);
});

test("Customer search reports matching and empty result states", () => {
  assert.match(component, /matching Customer/);
  assert.match(component, /No Customers match this search\./);
  assert.match(component, /aria-live="polite"/);
});

test("selecting a filtered Customer restores the normal picker", () => {
  assert.match(
    component,
    /selectCustomer\(customer\.id\);[\s\S]*setCustomerSearch\(""\)/,
  );
});
