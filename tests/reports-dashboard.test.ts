import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildOperationalReport,
  isCanonicalReportParams,
  reportDelta,
  reportPeriodKeys,
  resolveReportingPeriod,
  type ReportCapabilities,
  type ReportCase,
  type ReportCustomer,
  type ReportRequest,
  type ReportTask,
} from "../lib/reporting.ts";
import { hasPermission } from "../lib/auth/permissions.ts";

const now = new Date("2026-09-09T12:00:00.000Z");
const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "22222222-2222-4222-8222-222222222222";
const capabilities: ReportCapabilities = { cases: true, tasks: true, serviceRequests: true, customers: true, questions: true, rules: true };
const reportCase = (value: Partial<ReportCase> = {}): ReportCase => ({
  organization_id: organizationId, customer_id: "customer-1", opened_at: "2026-09-02T14:00:00.000Z", completed_at: "2026-09-05T14:00:00.000Z", closed_at: null, ...value,
});
const reportTask = (value: Partial<ReportTask> = {}): ReportTask => ({
  organization_id: organizationId, title: "Install sign", status: "COMPLETED", created_at: "2026-09-02T15:00:00.000Z", completed_at: "2026-09-04T15:00:00.000Z", due_at: "2026-09-06T04:00:00.000Z",
  generated_by_rule: false, assigned_user_id: "user-1", ...value,
});
const reportRequest = (value: Partial<ReportRequest> = {}): ReportRequest => ({
  organization_id: organizationId, case_id: "case-1", opened_at: "2026-09-03T14:00:00.000Z", resolved_at: "2026-09-04T14:00:00.000Z", ...value,
});
const customer = (value: Partial<ReportCustomer> = {}): ReportCustomer => ({ id: "customer-1", organization_id: organizationId, name: "Fobbs Quality Signs", ...value });

test("report periods resolve deterministically and canonicalize invalid input", () => {
  for (const key of reportPeriodKeys) {
    const params = key === "custom" ? { period: key, from: "2026-08-01", to: "2026-08-14" } : { period: key };
    assert.equal(resolveReportingPeriod(params, "UTC", now).key, key);
  }
  const fallback = resolveReportingPeriod({ period: "invalid", compare: "invalid", from: "bad", to: "bad" }, "UTC", now);
  assert.equal(fallback.key, "30d");
  assert.equal(fallback.canonicalQuery, "period=30d");
  assert.equal(isCanonicalReportParams({}, fallback), false);
  assert.equal(isCanonicalReportParams({ period: "30d" }, fallback), true);
  const invalidCustom = resolveReportingPeriod({ period: "custom", from: "2026-09-10", to: "2026-09-01" }, "UTC", now);
  assert.equal(invalidCustom.key, "30d");
});

test("organization timezone controls reporting boundaries and timestamp bucketing", () => {
  const period = resolveReportingPeriod({ period: "7d" }, "America/New_York", new Date("2026-09-09T03:30:00.000Z"));
  assert.equal(period.range.to, "2026-09-08");
  assert.equal(period.range.start.toISOString(), "2026-09-02T04:00:00.000Z");
  assert.equal(period.range.endExclusive.toISOString(), "2026-09-09T04:00:00.000Z");
  const result = buildOperationalReport({ organizationId, timezone: "America/New_York", period, cases: [reportCase({ opened_at: "2026-09-03T03:30:00.000Z", completed_at: null })], tasks: [], requests: [], customers: [], capabilities, now });
  assert.equal(result.caseVolume[0]?.key, "2026-09-02");
});

test("calendar periods compare with the equivalent prior calendar period", () => {
  const month = resolveReportingPeriod({ period: "this_month", compare: "previous" }, "UTC", now);
  assert.deepEqual([month.previous?.from, month.previous?.to], ["2026-08-01", "2026-08-09"]);
  const lastMonth = resolveReportingPeriod({ period: "last_month", compare: "previous" }, "UTC", now);
  assert.deepEqual([lastMonth.previous?.from, lastMonth.previous?.to], ["2026-07-01", "2026-07-31"]);
  const quarter = resolveReportingPeriod({ period: "this_quarter", compare: "previous" }, "UTC", now);
  assert.deepEqual([quarter.previous?.from, quarter.previous?.to], ["2026-04-01", "2026-06-10"]);
  const year = resolveReportingPeriod({ period: "this_year", compare: "previous" }, "UTC", now);
  assert.deepEqual([year.previous?.from, year.previous?.to], ["2025-01-01", "2025-09-09"]);
  const custom = resolveReportingPeriod({ period: "custom", from: "2026-08-01", to: "2026-08-14", compare: "previous" }, "UTC", now);
  assert.deepEqual([custom.previous?.from, custom.previous?.to], ["2026-07-18", "2026-07-31"]);
});

test("time buckets automatically use daily weekly and monthly granularity", () => {
  assert.equal(resolveReportingPeriod({ period: "30d" }, "UTC", now).bucket, "day");
  assert.equal(resolveReportingPeriod({ period: "90d" }, "UTC", now).bucket, "week");
  assert.equal(resolveReportingPeriod({ period: "this_year" }, "UTC", now).bucket, "month");
});

test("operational report aggregates authoritative rows and excludes other tenants", () => {
  const period = resolveReportingPeriod({ period: "30d", compare: "previous" }, "UTC", now);
  const result = buildOperationalReport({
    organizationId, timezone: "UTC", period,
    cases: [reportCase(), reportCase({ customer_id: "customer-2", opened_at: "2026-08-01T12:00:00Z", completed_at: null }), reportCase({ organization_id: otherOrganizationId })],
    tasks: [reportTask(), reportTask({ status: "BLOCKED", completed_at: null, due_at: "2026-09-01T00:00:00Z", generated_by_rule: true, assigned_user_id: null }), reportTask({ organization_id: otherOrganizationId })],
    requests: [reportRequest(), reportRequest({ organization_id: otherOrganizationId })],
    customers: [customer(), customer({ id: "customer-2", name: "Second Customer" }), customer({ id: "foreign-customer", organization_id: otherOrganizationId })],
    capabilities, now,
  });
  const values = new Map(result.kpis.map((item) => [item.label, item.value]));
  assert.equal(values.get("Cases Opened"), 1);
  assert.equal(values.get("Cases Completed"), 1);
  assert.equal(values.get("Completion Rate"), 100);
  assert.equal(result.kpis.find((item) => item.label === "Completion Rate")?.description, "Cases opened in the period and completed by period end ÷ Cases opened");
  assert.equal(values.get("Customers Served"), 1);
  assert.equal(values.get("Tasks Completed"), 1);
  assert.equal(values.get("Service Requests Received"), 1);
  assert.equal(result.taskPerformance.blocked, 1);
  assert.equal(result.taskPerformance.overdue, 1);
  assert.deepEqual(result.workDistribution, { assigned: 1, unassigned: 1 });
  assert.equal(result.topCustomers[0]?.label, "Fobbs Quality Signs");
  assert.deepEqual(result.durationTrend, [{ key: "2026-09-05", average: 3, completed: 1 }]);
  assert.equal(result.requestVolume.find((item) => item.key === "2026-09-03")?.received, 1);
  assert.equal(result.requestVolume.find((item) => item.key === "2026-09-04")?.resolved, 1);
});

test("comparison deltas and empty denominators are deterministic", () => {
  assert.deepEqual(reportDelta(12, 10), { absolute: 2, percent: 20 });
  assert.deepEqual(reportDelta(3, 0), { absolute: 3, percent: null });
  assert.deepEqual(reportDelta(0, 0), { absolute: 0, percent: null });
  assert.deepEqual(reportDelta(0, 5), { absolute: -5, percent: -100 });
  const period = resolveReportingPeriod({ period: "7d", compare: "previous" }, "UTC", now);
  const result = buildOperationalReport({ organizationId, timezone: "UTC", period, cases: [], tasks: [], requests: [], customers: [], capabilities, now });
  assert.equal(result.kpis.find((item) => item.label === "Completion Rate")?.value, 0);
  assert.equal(result.kpis.find((item) => item.label === "Completion Rate")?.delta?.percent, null);
});

test("completion rate uses the opened cohort completed by the reporting cutoff", () => {
  const period = resolveReportingPeriod({ period: "7d" }, "UTC", now);
  const result = buildOperationalReport({
    organizationId, timezone: "UTC", period,
    cases: [reportCase({ opened_at: "2026-09-05T12:00:00Z", completed_at: "2026-09-10T12:00:00Z" })],
    tasks: [], requests: [], customers: [], capabilities, now,
  });
  assert.equal(result.kpis.find((item) => item.label === "Cases Completed")?.value, 0);
  assert.equal(result.kpis.find((item) => item.label === "Completion Rate")?.value, 0);
});

test("Case outcomes include timestamped events in range and exclude unsupported status-only history", () => {
  const period = resolveReportingPeriod({ period: "7d" }, "UTC", now);
  const result = buildOperationalReport({
    organizationId, timezone: "UTC", period,
    cases: [
      reportCase(),
      reportCase({ completed_at: null, closed_at: "2026-09-06T12:00:00Z" }),
      reportCase({ completed_at: null, closed_at: null }),
      reportCase({ completed_at: "2026-08-01T12:00:00Z", closed_at: null }),
    ],
    tasks: [], requests: [], customers: [], capabilities, now,
  });
  assert.deepEqual(result.outcome, { completed: 1, closed: 1 });
});

test("dimension permissions suppress restricted Task Customer Service Desk and Rule detail", () => {
  const period = resolveReportingPeriod({ period: "30d" }, "UTC", now);
  const restricted = { ...capabilities, tasks: false, customers: false, serviceRequests: false, questions: false, rules: false };
  const result = buildOperationalReport({ organizationId, timezone: "UTC", period, cases: [reportCase()], tasks: [reportTask()], requests: [reportRequest()], customers: [customer()], capabilities: restricted, now });
  assert.equal(result.kpis.find((item) => item.label === "Tasks Completed")?.value, null);
  assert.equal(result.kpis.find((item) => item.label === "Customers Served")?.value, null);
  assert.equal(result.kpis.find((item) => item.label === "Service Requests Received")?.value, null);
  assert.equal(result.taskPerformance.generated, null);
  assert.deepEqual(result.topCustomers, []);
});

test("reports repository enforces authorization scope and bounded safe-view queries", () => {
  const repository = readFileSync("lib/data/reports-repository.ts", "utf8");
  assert.match(repository, /hasPermission\(access, "VIEW_REPORTS"\)/);
  for (const permission of ["VIEW_CASES", "VIEW_TASKS", "VIEW_SERVICE_DESK", "VIEW_CUSTOMERS", "VIEW_QUESTIONS", "VIEW_RULES"]) assert.match(repository, new RegExp(`hasPermission\\(access, "${permission}"\\)`));
  for (const view of ["organization_cases", "organization_case_tasks", "organization_service_requests", "organization_customers"]) assert.match(repository, new RegExp(`\\.from\\("${view}"\\)`));
  assert.equal((repository.match(/\.eq\("organization_id", organizationId\)/g) ?? []).length, 6);
  assert.match(repository, /Promise\.all/);
  assert.match(repository, /capabilities\.rules[\s\S]*generated_by_rule[\s\S]*assigned_user_id/);
  assert.match(repository, /select\("organization_id,title,status,created_at,completed_at,due_at,assigned_user_id"\)/);
  assert.doesNotMatch(repository, /for\s*\([^)]*\)\s*\{[^}]*await/);
  assert.doesNotMatch(repository, /\.select\("\*"\)/);
  assert.match(repository, /if \(!access\?\.activeOrganization \|\| !hasPermission/);
  assert.equal(hasPermission({ isSuperAdmin: false, internalAccess: false, activeOrganization: { role: "PUBLIC_USER" }, customerPortalCount: 1 }, "VIEW_REPORTS"), false);
});

test("reports UI exposes accessible responsive charts, truthful limitations, and supported drilldowns", () => {
  const component = readFileSync("components/reports/reports-dashboard.tsx", "utf8");
  const styles = readFileSync("app/globals.css", "utf8");
  for (const heading of ["Case Volume", "Case Outcomes", "Completion Performance", "Task Performance", "Service Requests", "Customer Activity", "Operational Bottlenecks", "Work Distribution"]) assert.match(component, new RegExp(`>${heading}<`));
  assert.match(component, /role="img"/);
  assert.match(component, /aria-label=/);
  assert.match(component, /title=\{`\$\{item\.opened\} opened`\}/);
  assert.match(component, /\/tasks\?due=overdue/);
  assert.match(component, /\/tasks\?status=blocked/);
  assert.match(component, /Historical readiness, Question response state/);
  assert.match(component, /Duration trend/);
  assert.match(component, /Throughput trend/);
  assert.doesNotMatch(component, /portal/i);
  assert.match(styles, /\.reports-dashboard/);
  assert.match(styles, /@media\(max-width:560px\)[\s\S]*\.report-controls\{grid-template-columns:1fr\}/);
});
