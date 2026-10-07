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
  organization_id: organizationId, customer_id: "customer-1", opened_at: "2026-09-02T14:00:00.000Z", completed_at: "2026-09-05T14:00:00.000Z", ...value,
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
    tasks: [reportTask(), reportTask({ status: "WAITING_ON_CUSTOMER", completed_at: null, due_at: "2026-09-01T00:00:00Z", generated_by_rule: true, assigned_user_id: null }), reportTask({ organization_id: otherOrganizationId })],
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
  assert.equal(result.taskPerformance.waitingOnCustomer, 1);
  assert.equal(result.taskPerformance.overdue, 1);
  assert.deepEqual(result.workDistribution, { assigned: 1, unassigned: 1 });
  assert.equal(result.topCustomers[0]?.label, "Fobbs Quality Signs");
  assert.deepEqual(result.durationTrend, [{ key: "2026-09-05", average: 3, completed: 1 }]);
  assert.equal(result.requestVolume.find((item) => item.key === "2026-09-03")?.received, 1);
  assert.equal(result.requestVolume.find((item) => item.key === "2026-09-04")?.resolved, 1);
});

test("current Task exceptions are independent of the historical reporting window", () => {
  const period = resolveReportingPeriod({ period: "7d" }, "UTC", now);
  const result = buildOperationalReport({
    organizationId, timezone: "UTC", period,
    cases: [], tasks: [], requests: [], customers: [], capabilities, now,
    currentTasks: [
      reportTask({ title: "Old overdue", status: "IN_PROGRESS", created_at: "2025-01-01T00:00:00Z", completed_at: null, due_at: "2026-01-01T00:00:00Z" }),
      reportTask({ title: "Current waiting", status: "WAITING_ON_CUSTOMER", completed_at: null, due_at: null }),
      reportTask({ title: "Completed old", status: "COMPLETED", due_at: "2026-01-01T00:00:00Z" }),
      reportTask({ title: "Not applicable old", status: "NOT_APPLICABLE", completed_at: null, due_at: "2026-01-01T00:00:00Z" }),
      reportTask({ title: "Future task", status: "NOT_STARTED", completed_at: null, due_at: "2026-10-01T00:00:00Z" }),
      reportTask({ organization_id: otherOrganizationId, title: "Foreign overdue", status: "IN_PROGRESS", completed_at: null, due_at: "2026-01-01T00:00:00Z" }),
    ],
  });
  assert.equal(result.taskPerformance.completed, 0);
  assert.equal(result.taskPerformance.overdue, 1);
  assert.equal(result.taskPerformance.waitingOnCustomer, 1);
  assert.deepEqual(result.bottlenecks.map((item) => item.label).sort(), ["Current waiting", "Old overdue"]);
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

test("Case permission is enforced in the model while independent dimensions remain available", () => {
  const period = resolveReportingPeriod({ period: "30d" }, "UTC", now);
  const noCases = { ...capabilities, cases: false };
  const result = buildOperationalReport({
    organizationId, timezone: "UTC", period,
    cases: [reportCase()], tasks: [reportTask()], currentTasks: [reportTask({ status: "WAITING_ON_CUSTOMER", completed_at: null })],
    requests: [reportRequest()], customers: [customer()], capabilities: noCases, now,
  });
  for (const label of ["Cases Opened", "Cases Completed", "Completion Rate", "Average Case Duration", "Median Case Duration", "Customers Served"]) {
    assert.equal(result.kpis.find((item) => item.label === label)?.value, null);
  }
  assert.equal(result.kpis.find((item) => item.label === "Tasks Completed")?.value, 1);
  assert.equal(result.kpis.find((item) => item.label === "Service Requests Received")?.value, 1);
  assert.equal(result.taskPerformance.waitingOnCustomer, 1);
  assert.equal(result.requestPerformance.received, 1);
  assert.deepEqual(result.topCustomers, []);
});

test("reports repository enforces authorization scope and bounded safe-view queries", () => {
  const repository = readFileSync("lib/data/reports-repository.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20261007120000_dm3oi_phase2_route_aggregates.sql", "utf8");
  assert.match(repository, /hasPermission\(access, "VIEW_REPORTS"\)/);
  for (const permission of ["VIEW_CASES", "VIEW_TASKS", "VIEW_SERVICE_DESK", "VIEW_CUSTOMERS", "VIEW_QUESTIONS", "VIEW_RULES"]) assert.match(repository, new RegExp(`hasPermission\\(access, "${permission}"\\)`));
  assert.match(repository, /rpc\("get_operational_report_aggregate"/);
  for (const table of ["cases", "case_tasks", "service_requests", "customers"]) assert.match(migration, new RegExp(`public\\.${table}`));
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /can_access_case/);
  assert.match(migration, /task\.status in \('NOT_STARTED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'\)/);
  assert.doesNotMatch(repository, /from\("organization_cases"\)|from\("organization_case_tasks"\)|from\("organization_service_requests"\)|from\("organization_customers"\)/);
  assert.doesNotMatch(repository, /for\s*\([^)]*\)\s*\{[^}]*await/);
  assert.doesNotMatch(repository, /\.select\("\*"\)/);
  assert.match(repository, /if \(!access\?\.activeOrganization \|\| !hasPermission/);
  assert.equal(hasPermission({ isSuperAdmin: false, internalAccess: false, activeOrganization: null, customerPortalCount: 1 }, "VIEW_REPORTS"), false);
});

test("reports UI exposes accessible responsive charts, truthful limitations, and supported drilldowns", () => {
  const component = readFileSync("components/reports/reports-dashboard.tsx", "utf8");
  const styles = readFileSync("app/globals.css", "utf8");
  for (const heading of ["Case Volume", "Completion Performance", "Task Performance", "Service Requests", "Customer Activity", "Operational Bottlenecks", "Work Distribution"]) assert.match(component, new RegExp(`>${heading}<`));
  assert.doesNotMatch(component, />Case Outcomes</);
  assert.match(component, /role="img"/);
  assert.match(component, /aria-label=/);
  assert.match(component, /title=\{`\$\{item\.opened\} opened`\}/);
  assert.match(component, /className="report-volume-bars"/);
  assert.match(component, /<b>\{item\.opened\}<\/b>/);
  assert.match(component, /<b>\{item\.completed\}<\/b>/);
  assert.doesNotMatch(component, /<small>O \{item\.opened\} · C \{item\.completed\}<\/small>/);
  assert.match(component, /\/tasks\?due=overdue/);
  assert.match(component, /\/tasks\?status=waiting-on-customer/);
  assert.match(component, /Historical readiness, Question response state/);
  assert.match(component, /Case performance requires Case access/);
  assert.doesNotMatch(component, /!capabilities\.cases \?[^:]+: <>/);
  assert.match(component, /availableKpis/);
  assert.match(component, /Current customer-waiting or overdue Task patterns/);
  assert.match(component, /Duration trend/);
  assert.match(component, /Throughput trend/);
  assert.doesNotMatch(component, /portal/i);
  assert.match(styles, /\.reports-dashboard/);
  assert.match(styles, /@media\(max-width:560px\)[\s\S]*\.report-controls\{grid-template-columns:1fr\}/);
});
