import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { LiveCase } from "../lib/data/case-repository.ts";
import {
  caseViewHref,
  getCaseDashboardCounts,
  isCaseOverdue,
  matchesCaseRegisterFilters,
  matchesCaseView,
  normalizeCaseView,
} from "../lib/case-dashboard.ts";

const source = (path: string) => readFileSync(path, "utf8");

const liveCase = (overrides: Partial<LiveCase> = {}) => ({
  case_number: "CASE-1001",
  title: "Payroll review",
  customer: { name: "Mimms Tax" },
  status: "NEW",
  priority: "NORMAL",
  due_at: null,
  manager_user_id: "manager-1",
  assignedStaff: [],
  ...overrides,
}) as LiveCase;

test("case KPI counts use the full supplied authorized population and established status mappings", () => {
  const now = new Date("2026-09-07T16:00:00Z");
  const cases = [
    liveCase({ status: "IN_PROGRESS" }),
    liveCase({ status: "REVIEW" }),
    liveCase({ status: "WAITING" }),
    liveCase({ status: "NEW", due_at: "2026-09-06T03:59:59Z" }),
    liveCase({ status: "ASSIGNED", manager_user_id: null, assignedStaff: [] }),
    liveCase({ status: "COMPLETED", due_at: "2026-09-01T00:00:00Z" }),
    liveCase({ status: "CLOSED", due_at: "2026-09-01T00:00:00Z" }),
    liveCase({ status: "CANCELLED", due_at: "2026-09-01T00:00:00Z" }),
    liveCase({ status: "NEW", due_at: "2026-09-07T05:00:00Z" }),
  ];

  assert.deepEqual(getCaseDashboardCounts(cases, "America/New_York", now), {
    total: 9,
    inProgress: 2,
    waiting: 1,
    overdue: 1,
    unassigned: 1,
    completed: 2,
  });
});

test("overdue uses the organization-local start of day and excludes every terminal state", () => {
  const now = new Date("2026-09-07T02:00:00Z");
  assert.equal(isCaseOverdue(liveCase({ due_at: "2026-09-06T03:59:59Z" }), "America/New_York", now), true);
  assert.equal(isCaseOverdue(liveCase({ due_at: "2026-09-06T04:00:00Z" }), "America/New_York", now), false);
  for (const status of ["COMPLETED", "CLOSED", "CANCELLED"] as const) {
    assert.equal(isCaseOverdue(liveCase({ status, due_at: "2026-01-01T00:00:00Z" }), "America/New_York", now), false);
  }
});

test("operational views normalize safely and use manager plus staff assignment semantics", () => {
  assert.equal(normalizeCaseView("overdue"), "overdue");
  assert.equal(normalizeCaseView("invalid"), undefined);
  assert.equal(matchesCaseView(liveCase({ manager_user_id: null, assignedStaff: [] }), "unassigned", "UTC"), true);
  assert.equal(matchesCaseView(liveCase({ manager_user_id: null, assignedStaff: [{} as LiveCase["assignedStaff"][number]] }), "unassigned", "UTC"), false);
});

test("KPI views combine with search, status, priority, and assignment filters", () => {
  const now = new Date("2026-09-07T16:00:00Z");
  const item = liveCase({ status: "IN_PROGRESS", priority: "URGENT", due_at: "2026-09-01T00:00:00Z" });
  const compatible = { view: "overdue", query: "payroll", status: "IN_PROGRESS", priority: "URGENT", assignment: "ASSIGNED" };
  assert.equal(matchesCaseRegisterFilters(item, compatible, "America/New_York", now), true);
  assert.equal(matchesCaseRegisterFilters(item, { ...compatible, query: "estate" }, "America/New_York", now), false);
  assert.equal(matchesCaseRegisterFilters(item, { ...compatible, status: "WAITING" }, "America/New_York", now), false);
  assert.equal(matchesCaseRegisterFilters(item, { ...compatible, assignment: "UNASSIGNED" }, "America/New_York", now), false);
});

test("KPI links preserve applicable filters and Total Cases clears only view", () => {
  const filters = { query: "Acme & Co", status: "active", priority: "HIGH", assignment: "ASSIGNED", view: "waiting" };
  assert.equal(caseViewHref(filters, "overdue"), "/cases?query=Acme+%26+Co&status=active&priority=HIGH&assignment=ASSIGNED&view=overdue");
  assert.equal(caseViewHref(filters), "/cases?query=Acme+%26+Co&status=active&priority=HIGH&assignment=ASSIGNED");
  assert.equal(caseViewHref({}, undefined), "/cases");
});

test("Cases page derives stable KPI counts from the existing authorized organization dataset", () => {
  const page = source("app/cases/page.tsx");
  const repository = source("lib/data/case-repository.ts");
  const countIndex = page.indexOf("getCaseDashboardCounts(data.cases");
  const filterIndex = page.indexOf("data.cases.filter");
  assert.ok(countIndex > -1 && countIndex < filterIndex);
  assert.match(page, /getLiveOrganizationData\(\)/);
  assert.match(repository, /hasTenantInternalAccess\(access\)/);
  assert.match(repository, /\.from\("organization_cases"\)[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(page, /matchesCaseRegisterFilters\(item, filters, data\.timezone\)/);
  assert.doesNotMatch(page, /createClient|\.from\("cases"\)/);
});

test("KPI cards are semantic links with selected state and responsive six-three-two layout", () => {
  const component = source("components/cases/case-kpis.tsx");
  const css = source("app/globals.css");
  assert.match(component, /<nav className="case-kpis" aria-label="Case operational views">/);
  assert.match(component, /<Link[\s\S]*?aria-current=\{selected \? "page" : undefined\}/);
  assert.match(component, /aria-label=\{`Show \$\{kpi\.accessibleLabel\} cases, \$\{kpi\.count\} cases`\}/);
  assert.match(component, /const selected = kpi\.view === selectedView/);
  assert.match(css, /\.case-kpis\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:1100px\)\{\.case-kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:620px\)\{\.case-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.case-kpi:focus-visible\{outline:/);
});

test("existing Cases controls, zero-result state, and navigable rows remain intact", () => {
  const page = source("app/cases/page.tsx");
  const register = source("components/cases/cases-register.tsx");
  const table = source("components/cases/case-table.tsx");
  assert.match(page, /href="\/cases\/new"/);
  for (const name of ["query", "status", "priority", "assignment"]) assert.match(register, new RegExp(`name="${name}"`));
  assert.match(register, /type="hidden" name="view" value=\{filters\.view\}/);
  assert.match(register, />Apply</);
  assert.match(register, /No cases match these filters\./);
  assert.match(table, /<NavigableRow[\s\S]*?key=\{item\.id\}[\s\S]*?href=\{`\/cases\/\$\{item\.id\}`\}/);
  assert.match(table, /className="table-scroll"/);
});
