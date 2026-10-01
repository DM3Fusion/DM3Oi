import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const component = fs.readFileSync(
  "components/portal-case-summaries.tsx",
  "utf8",
);

const repository = fs.readFileSync(
  "lib/data/customer-portal-case-repository.ts",
  "utf8",
);

const migration = fs.readFileSync(
  "supabase/migrations/20260930234500_dm3oi_tax_outcome_case_completion.sql",
  "utf8",
);

test("active Cash Advance Case uses Cash Advance customer phase", () => {
  assert.match(component, /includes\("cash advance"\)/);
  assert.match(component, /\? "Cash Advance"/);
  assert.match(component, /"In Progress"/);
});

test("other active tax Cases use Tax Return customer phase", () => {
  assert.match(component, /: "Tax Return"/);
});

test("completed refund outcome displays Refund Issued", () => {
  assert.match(component, /case "REFUND"/);
  assert.match(
    component,
    /return \{ label: "Refund", status: "Issued" \}/,
  );
});

test("completed balance due outcome displays Payment Due", () => {
  assert.match(component, /case "BALANCE_DUE"/);
  assert.match(
    component,
    /return \{ label: "Payment", status: "Due" \}/,
  );
});

test("zero balance displays completed Tax Return", () => {
  assert.match(component, /case "ZERO_BALANCE"/);
  assert.match(
    component,
    /return \{ label: "Tax Return", status: "Complete" \}/,
  );
});

test("portal summary carries persisted tax outcome", () => {
  assert.match(repository, /tax_outcome:/);
  assert.match(migration, /item\.tax_outcome/);
});

test("completed Cases remain visible while closed and cancelled are excluded", () => {
  assert.match(
    migration,
    /where item\.status not in \('CLOSED','CANCELLED'\)/,
  );
  assert.match(
    migration,
    /when 'COMPLETED' then 'Completed'/,
  );
});
