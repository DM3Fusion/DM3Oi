import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { customerViewHref, getCustomerRegisterDashboard } from "../lib/customer-register-dashboard.ts";

test("Customer views derive latest and adjacent tax years without hardcoding", () => {
  const customers = [{ id: "new" }, { id: "returning" }, { id: "older" }];
  const dashboard = getCustomerRegisterDashboard(
    customers,
    [
      { customer_id: "new", tax_year: 2028 },
      { customer_id: "returning", tax_year: 2027 },
      { customer_id: "returning", tax_year: 2028 },
      { customer_id: "older", tax_year: 2026 },
      { customer_id: "older", tax_year: 2027 },
    ],
    new Set(["returning"]),
  );
  assert.equal(dashboard.currentTaxYear, 2028);
  assert.deepEqual(dashboard.counts, { total: 3, new: 1, returning: 1, withoutPortal: 2 });
  assert.equal(dashboard.matches("new", "new"), true);
  assert.equal(dashboard.matches("older", "returning"), false);
  assert.equal(dashboard.matches("returning", "without-portal"), false);
});

test("Customer KPI URLs compose with search and status while Total clears only view", () => {
  assert.equal(
    customerViewHref({ q: "Mimms & Co", status: "active" }, "returning"),
    "/customers?q=Mimms+%26+Co&status=active&view=returning",
  );
  assert.equal(
    customerViewHref({ q: "Mimms & Co", status: "active" }),
    "/customers?q=Mimms+%26+Co&status=active",
  );
});

test("Customers page uses effective portal resolution for both KPI count and register filtering", () => {
  const page = readFileSync("app/customers/page.tsx", "utf8");
  const repository = readFileSync("lib/data/case-repository.ts", "utf8");
  const component = readFileSync("components/customers/customer-kpis.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(repository, /resolveCustomerPortalAccesses/);
  assert.match(repository, /\.filter\(\(item\) => item\.effective\)/);
  assert.match(page, /dashboard\.matches\(customer\.id, view\)/);
  assert.match(component, /Total Customers/);
  assert.match(component, /Without Portal Access/);
  assert.match(css, /\.customer-kpis\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(component, /fetch\(|setInterval|setTimeout|\.channel\(/);
});
