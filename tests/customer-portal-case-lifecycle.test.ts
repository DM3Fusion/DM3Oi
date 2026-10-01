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
  "supabase/migrations/20260930230000_dm3oi_portal_case_lifecycle_phases.sql",
  "utf8",
);

test("Customer Portal separates Intake from external service lifecycle", () => {
  assert.match(component, />Intake</);
  assert.match(component, /externalPhaseLabel/);
  assert.match(component, /externalPhaseStatus/);
  assert.match(component, /item\.intake_finalized \? 100 : percentage/);
});

test("Cash Advance and Refund Cases use the Refund customer phase", () => {
  assert.match(component, /normalized\.includes\("cash advance"\)/);
  assert.match(component, /normalized\.includes\("refund"\)/);
  assert.match(component, /return "Refund"/);
});

test("completed Case external work shows 100 percent complete", () => {
  assert.match(
    component,
    /externalPhaseComplete\s*=\s*item\.customer_status === "Completed"/,
  );
  assert.match(
    component,
    /externalPhaseComplete\s*\?\s*"100% Complete"/,
  );
});

test("portal summary carries authoritative finalized-intake state", () => {
  assert.match(repository, /intake_finalized: boolean/);
  assert.match(migration, /intake_finalized boolean/);
  assert.match(migration, /draft\.finalized_at is not null/);
});

test("completed Cases remain visible while closed and cancelled remain excluded", () => {
  assert.match(
    migration,
    /where item\.status not in \('CLOSED','CANCELLED'\)/,
  );
  assert.match(
    migration,
    /when 'COMPLETED' then 'Completed'/,
  );
});
