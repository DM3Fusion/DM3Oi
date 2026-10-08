import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const loadingFiles = [
  "app/loading.tsx",
  "app/cases/loading.tsx",
  "app/tasks/loading.tsx",
  "app/reports/loading.tsx",
];
const routeFiles = [
  "app/page.tsx",
  "app/cases/page.tsx",
  "app/tasks/page.tsx",
  "app/reports/page.tsx",
];
const serverSectionFiles = [
  "components/dashboard/dashboard-server-sections.tsx",
  "components/cases/cases-page-sections.tsx",
  "components/tasks/tasks-page-sections.tsx",
  "components/reports/report-server-sections.tsx",
];

test("root, Cases, Tasks, and Reports expose responsive route skeletons", () => {
  for (const file of loadingFiles) assert.equal(existsSync(file), true, file);
  const skeletons = source("components/loading/route-skeletons.tsx");
  for (const component of [
    "RootRouteSkeleton",
    "PageHeaderSkeleton",
    "KpiGridSkeleton",
    "TableSkeleton",
    "WorkloadCardsSkeleton",
    "ReportSectionSkeleton",
  ]) {
    assert.match(skeletons, new RegExp(`export function ${component}`));
  }
  assert.match(skeletons, /role="status"/);
  assert.match(skeletons, /aria-busy="true"/);
  assert.match(source("app/globals.css"), /\.route-skeleton-kpi-grid/);
  assert.match(source("app/globals.css"), /@media\(max-width:600px\).*\.route-skeleton-kpi-grid/);
});

test("the shared root route uses a neutral server-only loading state", () => {
  const loading = source("app/loading.tsx");
  const skeletons = source("components/loading/route-skeletons.tsx");
  const rootStart = skeletons.indexOf("export function RootRouteSkeleton");
  const rootEnd = skeletons.indexOf("export function CasesBodySkeleton", rootStart);
  const rootSkeleton = skeletons.slice(rootStart, rootEnd);

  assert.ok(rootStart >= 0 && rootEnd > rootStart);
  assert.match(loading, /<RootRouteSkeleton \/>/);
  assert.doesNotMatch(loading, /DashboardRouteSkeleton|getAccessContext|createClient|"use client"/);
  assert.match(rootSkeleton, /label="Loading page"/);
  assert.match(rootSkeleton, /label="Loading page content"/);
  assert.doesNotMatch(
    rootSkeleton,
    />[^<]*(?:Dashboard|Platform|organization|customer|report|Case|Task)[^<]*</i,
  );
  assert.doesNotMatch(rootSkeleton, /getAccessContext|createClient|fetch\(|useEffect|"use client"/);
});

test("target routes use server Suspense boundaries around natural sections", () => {
  const dashboard = source("app/page.tsx");
  const cases = source("app/cases/page.tsx");
  const tasks = source("app/tasks/page.tsx");
  const reports = source("app/reports/page.tsx");

  for (const page of [dashboard, cases, tasks, reports]) {
    assert.match(page, /import \{ Suspense \} from "react"/);
    assert.match(page, /<Suspense[\s\S]*?fallback=/);
  }
  assert.match(dashboard, /DashboardServerSection/);
  assert.match(dashboard, /DashboardIntelligenceServerSection/);
  assert.match(cases, /CaseKpisServerSection/);
  assert.match(cases, /CaseWorkloadServerSection/);
  assert.match(cases, /CaseRegisterServerSection/);
  assert.match(tasks, /TaskKpisServerSection/);
  assert.match(tasks, /TaskWorkloadServerSection/);
  assert.match(tasks, /TaskRegisterServerSection/);
  assert.match(reports, /BusinessReachServerSection/);
  assert.match(reports, /OperationalReportsServerSection/);
});

test("progressive sections use independent summary/register loads and preserve URL semantics", () => {
  const dashboard = source("app/page.tsx");
  const casesPage = source("app/cases/page.tsx");
  const casesSections = source("components/cases/cases-page-sections.tsx");
  const tasksPage = source("app/tasks/page.tsx");
  const taskSections = source("components/tasks/tasks-page-sections.tsx");
  const reportsPage = source("app/reports/page.tsx");

  assert.equal(dashboard.match(/getLiveOrganizationData\(\)/g)?.length, 1);
  assert.equal(casesPage.match(/getCasesRegisterData\(searchParams\)/g)?.length, 1);
  assert.equal(casesPage.match(/getCaseRouteSummary\(\)/g)?.length, 1);
  assert.equal(tasksPage.match(/getTaskRegisterData\(\)/g)?.length, 1);
  assert.equal(tasksPage.match(/getTaskRouteSummary\(\)/g)?.length, 1);
  assert.equal(reportsPage.match(/getOperationalReport\(params\)/g)?.length, 1);
  assert.equal(reportsPage.match(/getBusinessReach\(\)/g)?.length, 1);
  assert.match(casesPage, /summaryPromise=\{summaryPromise\}/);
  assert.match(casesPage, /modelPromise=\{modelPromise\}/);
  assert.match(tasksPage, /summaryPromise=\{summaryPromise\}/);
  assert.match(tasksPage, /modelPromise=\{modelPromise\}/);
  for (const parameter of ["status", "priority", "assignment", "view", "lifecycle", "assignee"]) {
    assert.match(casesSections, new RegExp(`${parameter}\\?`));
  }
  for (const parameter of ["q", "status", "due", "assignee"]) {
    assert.match(taskSections, new RegExp(`${parameter}\\?`));
  }
});

test("progressive route code adds no client fetching, refresh loops, polling, or diagnostics", () => {
  const changedApplicationCode = [...routeFiles, ...loadingFiles, ...serverSectionFiles,
    "components/loading/route-skeletons.tsx",
    "components/dashboard/dashboard.tsx",
    "components/reports/reports-dashboard.tsx",
  ].map(source).join("\n");

  assert.doesNotMatch(changedApplicationCode, /"use client"/);
  assert.doesNotMatch(changedApplicationCode, /createClient|useEffect|router\.refresh|setInterval|postgres_changes|\.channel\(|subscribe\(/);
  assert.doesNotMatch(changedApplicationCode, /DM3Oi PERF/);
  assert.doesNotMatch(changedApplicationCode, /performance\.now\(/);
  assert.doesNotMatch(changedApplicationCode, /measureServerPerformance/);
  assert.doesNotMatch(changedApplicationCode, /server-performance/);
});

test("primary navigation uses explicit full Next Link prefetching", () => {
  const navigation = `${source("components/layout/app-shell.tsx")}\n${source("components/layout/mobile-bottom-navigation.tsx")}`;
  assert.match(navigation, /import Link from "next\/link"/);
  assert.match(navigation, /<Link[\s\S]*?href=\{href\}/);
  assert.equal(
    navigation.match(/<Link\b/g)?.length,
    navigation.match(/prefetch=\{true\}/g)?.length,
  );
  assert.doesNotMatch(navigation, /prefetch=\{false\}/);
  assert.doesNotMatch(navigation, /router\.prefetch|window\.location/);
});
