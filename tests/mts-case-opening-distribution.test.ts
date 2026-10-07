import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Reports retain opened_at semantics and MTS redistribution is an isolated fail-closed manual script", () => {
  const repository = readFileSync("lib/data/reports-repository.ts", "utf8");
  const reporting = readFileSync("lib/reporting.ts", "utf8");
  const aggregate = readFileSync(
    "supabase/migrations/20261007120000_dm3oi_phase2_route_aggregates.sql",
    "utf8",
  );
  const sql = readFileSync("scripts/redistribute-mts-2026-case-opened-at.sql", "utf8");
  assert.match(repository, /get_operational_report_aggregate/);
  assert.match(aggregate, /select item\.opened_at as occurred_at, 'opened'/);
  assert.doesNotMatch(aggregate, /select item\.due_at as occurred_at, 'opened'/);
  assert.match(reporting, /addBucket\(item\.opened_at, "opened"\)/);
  assert.doesNotMatch(reporting, /addBucket\(item\.due_at, "opened"\)/);
  assert.match(sql, /organization\.name = 'Mimms'' Tax Service'/);
  assert.match(sql, /cases\.tax_year = 2026/);
  assert.match(sql, /planned_count <> 95/);
  assert.match(sql, /proposed_opened_at > due_at/);
  assert.match(sql, /date '2026-10-01'/);
  assert.match(sql, /commit;/);
});
