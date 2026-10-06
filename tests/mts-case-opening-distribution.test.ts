import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Reports retain opened_at semantics and MTS redistribution is an isolated fail-closed manual script", () => {
  const repository = readFileSync("lib/data/reports-repository.ts", "utf8");
  const reporting = readFileSync("lib/reporting.ts", "utf8");
  const sql = readFileSync("scripts/redistribute-mts-2026-case-opened-at.sql", "utf8");
  assert.match(repository, /select\("organization_id,customer_id,opened_at,completed_at"\)/);
  assert.match(reporting, /addBucket\(item\.opened_at, "opened"\)/);
  assert.doesNotMatch(reporting, /addBucket\(item\.due_at, "opened"\)/);
  assert.match(sql, /organization\.name = 'Mimms'' Tax Service'/);
  assert.match(sql, /cases\.tax_year = 2026/);
  assert.match(sql, /planned_count <> 95/);
  assert.match(sql, /proposed_opened_at > due_at/);
  assert.match(sql, /date '2026-10-01'/);
  assert.match(sql, /commit;/);
});
