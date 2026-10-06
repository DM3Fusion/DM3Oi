import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getCaseAssigneeWorkloads, type WorkloadCase } from "../lib/case-assignee-workload.ts";

const profile = (id: string) => ({ id, display_name: id });
const item = (id: string, overrides: Partial<WorkloadCase> = {}): WorkloadCase => ({
  id,
  status: "IN_PROGRESS",
  due_at: null,
  tax_year: 2026,
  manager_user_id: null,
  assignedStaff: [],
  historicalAssigneeIds: [],
  ...overrides,
});

test("workloads are dynamic and deduplicate manager plus STAFF association", () => {
  const cases = [
    item("one", { manager_user_id: "alex", assignedStaff: [profile("alex")] }),
    item("two", { manager_user_id: "blair" }),
  ];
  const result = getCaseAssigneeWorkloads(
    [
      { role: "STAFF_USER", profile: profile("alex") },
      { role: "STAFF_MANAGER", profile: profile("blair") },
      { role: "BUSINESS_ADMIN", profile: profile("new-user") },
    ],
    cases,
    "UTC",
  );
  assert.deepEqual(result.map(({ profile: user, lifetime }) => [user.id, lifetime]), [
    ["alex", 1],
    ["blair", 1],
    ["new-user", 0],
  ]);
});

test("reassignment and canonical lifecycle metrics update from current data", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  const before = getCaseAssigneeWorkloads(
    [{ role: "STAFF_USER", profile: profile("alex") }],
    [item("one", { manager_user_id: "alex", due_at: "2026-10-01T12:00:00Z" })],
    "UTC",
    now,
  )[0];
  const after = getCaseAssigneeWorkloads(
    [{ role: "STAFF_USER", profile: profile("alex") }],
    [item("one", { manager_user_id: "blair", due_at: "2026-10-01T12:00:00Z" })],
    "UTC",
    now,
  )[0];
  assert.deepEqual(
    { inProgress: before.inProgress, overdue: before.overdue, lifetime: before.lifetime },
    { inProgress: 1, overdue: 1, lifetime: 1 },
  );
  assert.deepEqual(
    { inProgress: after.inProgress, overdue: after.overdue, lifetime: after.lifetime },
    { inProgress: 0, overdue: 0, lifetime: 0 },
  );
});

test("Completed is limited to the latest represented tax year while Lifetime is truthful current durable association", () => {
  const result = getCaseAssigneeWorkloads(
    [{ role: "STAFF_USER", profile: profile("alex") }],
    [
      item("old", { status: "COMPLETED", tax_year: 2025, historicalAssigneeIds: ["alex"] }),
      item("current", { status: "COMPLETED", tax_year: 2026, manager_user_id: "alex" }),
    ],
    "UTC",
  )[0];
  assert.equal(result.completed, 1);
  assert.equal(result.lifetime, 2);
});

test("workload cards use a responsive auto-fit grid, signed avatars, URL filters, and no background fetching", () => {
  const component = readFileSync("components/cases/assigned-user-workloads.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(component, /UserAvatar/);
  assert.match(component, /profile\.avatarUrl/);
  assert.match(component, /assignee=\$\{assignee\}/);
  assert.match(css, /\.assigned-workload-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax/);
  assert.doesNotMatch(component, /Michael|Susan|Victoria|fetch\(|setInterval|setTimeout|\.channel\(/);
});
