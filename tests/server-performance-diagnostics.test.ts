import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const helper = source("lib/server-performance.ts");
const context = source("lib/auth/context.ts");
const dashboardPage = source("app/page.tsx");
const casesPage = source("app/cases/page.tsx");
const reportsPage = source("app/reports/page.tsx");
const caseRepository = source("lib/data/case-repository.ts");
const goalsRepository = source("lib/data/goals-repository.ts");
const intelligenceRepository = source(
  "lib/data/operational-intelligence-repository.ts",
);
const reportsRepository = source("lib/data/reports-repository.ts");

test("temporary performance diagnostics are server-only, bounded, and metadata-free", () => {
  assert.match(helper, /^import "server-only";/);
  assert.match(helper, /console\.info\("DM3Oi PERF", \{/);
  assert.match(helper, /route,[\s\S]*stage,[\s\S]*durationMs:/);
  assert.doesNotMatch(
    helper,
    /userId|organizationId|email|cookie|token|queryResult|requestBody/,
  );

  const instrumented = [
    context,
    dashboardPage,
    casesPage,
    reportsPage,
    caseRepository,
    goalsRepository,
    intelligenceRepository,
    reportsRepository,
  ].join("\n");

  assert.doesNotMatch(instrumented, /["']use client["']/);
  assert.doesNotMatch(
    instrumented,
    /setInterval|setTimeout|postgres_changes|\.channel\(|visibilitychange|router\.refresh/,
  );
});

test("access context times claims, the access RPC, avatar resolution, and total work", () => {
  for (const stage of [
    "resolveAccessContext.authClaims",
    "resolveAccessContext.getMyAccessContextRpc",
    "resolveAccessContext.avatarResolution",
    "resolveAccessContext.total",
  ]) {
    assert.match(context, new RegExp(stage));
  }
  assert.match(context, /export const getAccessContext = cache\(resolveAccessContext\)/);
});

test("Dashboard times its major loaders and repository stages without changing concurrency", () => {
  for (const stage of [
    "page.getLiveOrganizationData",
    "page.getUnreadNotificationCount",
    "page.getGoalDashboardSummary",
    "page.getOperationalIntelligence",
    "page.total",
  ]) {
    assert.match(dashboardPage, new RegExp(stage));
  }
  assert.match(
    dashboardPage,
    /Promise\.all\(\[[\s\S]*page\.getLiveOrganizationData[\s\S]*page\.getUnreadNotificationCount[\s\S]*page\.getGoalDashboardSummary/,
  );
  for (const stage of [
    "repository.getLiveOrganizationData.total",
    "repository.live.organizationCases",
    "repository.live.organizationCustomers",
    "repository.live.organizationCaseTasks",
    "repository.live.caseRuleEvaluationBundle",
    "repository.live.profileAvatarResolution",
    "repository.live.assembleData",
  ]) {
    assert.match(caseRepository, new RegExp(stage));
  }
  assert.match(goalsRepository, /repository\.goalDashboardSummary\.getGoalsRpc/);
  assert.match(
    intelligenceRepository,
    /repository\.operationalIntelligence\.taskProvenance/,
  );
});

test("Cases times its page preparation and every major register data boundary", () => {
  for (const stage of [
    "page.getCasesRegisterData",
    "page.getAccessContext",
    "page.prepareViewModel",
    "page.total",
  ]) {
    assert.match(casesPage, new RegExp(stage));
  }
  for (const stage of [
    "repository.getCasesRegisterData.total",
    "repository.cases.organizationCases",
    "repository.cases.organizationCustomers",
    "repository.cases.caseAssignments",
    "repository.cases.organizationCaseTasks",
    "repository.cases.organizationSettings",
    "repository.cases.platformAdminIds",
    "repository.cases.guidedCaseIntakeDrafts",
    "repository.cases.organizationMembers",
    "repository.cases.profiles",
    "repository.cases.caseRuleEvaluationBundle",
    "repository.cases.profileAvatarResolution",
    "repository.cases.assembleData",
  ]) {
    assert.match(caseRepository, new RegExp(stage));
  }
});

test("Reports times sequential loaders and internal settings, query, RPC, and build stages", () => {
  for (const stage of [
    "page.getOperationalReport",
    "page.getBusinessReach",
    "page.total",
  ]) {
    assert.match(reportsPage, new RegExp(stage));
  }
  assert.ok(
    reportsPage.indexOf("page.getOperationalReport") <
      reportsPage.indexOf("page.getBusinessReach"),
  );
  for (const stage of [
    "repository.operationalReport.organizationSettings",
    "repository.operationalReport.cases",
    "repository.operationalReport.periodTasks",
    "repository.operationalReport.currentTasks",
    "repository.operationalReport.serviceRequests",
    "repository.operationalReport.customers",
    "repository.operationalReport.buildReport",
    "repository.operationalReport.total",
    "repository.businessReach.getBusinessReachRpc",
    "repository.businessReach.total",
  ]) {
    assert.match(reportsRepository, new RegExp(stage));
  }
});
