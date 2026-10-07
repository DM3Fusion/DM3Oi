import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const migrationPath =
  "supabase/migrations/20261007120000_dm3oi_phase2_route_aggregates.sql";

test("Task and Case summaries are tenant-safe aggregates with exact workload attribution", () => {
  const migration = source(migrationPath);
  for (const rpc of ["get_task_route_summary", "get_case_route_summary"]) {
    const start = migration.indexOf(`create function public.${rpc}`);
    const end = migration.indexOf("$$;", start);
    const body = migration.slice(start, end);
    assert.ok(start >= 0 && end > start, rpc);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
    assert.match(body, /auth\.uid\(\)/);
    assert.match(body, /target_organization_id/);
    assert.match(body, /has_effective_organization_permission/);
    assert.match(body, /can_access_case/);
  }
  assert.match(migration, /task\.completed_by_user_id = member\.user_id/);
  assert.match(migration, /task\.assigned_user_id = member\.user_id/);
  assert.match(migration, /historical_assignment/);
  assert.match(migration, /current_tax_year/);
});

test("route sections no longer share one broad summary/register model", () => {
  const tasks = source("app/tasks/page.tsx");
  const cases = source("app/cases/page.tsx");
  const repository = source("lib/data/case-repository.ts");
  for (const page of [tasks, cases]) {
    assert.match(page, /summaryPromise/);
    assert.match(page, /modelPromise/);
    assert.ok((page.match(/<Suspense/g) ?? []).length >= 3);
  }
  const taskRegister = repository.slice(
    repository.indexOf("export async function getTaskRegisterData"),
    repository.indexOf("type RouteWorkloadPayload"),
  );
  const caseRegister = repository.slice(
    repository.indexOf("export async function getCasesRegisterData"),
    repository.indexOf("type CaseRouteSummaryPayload"),
  );
  assert.doesNotMatch(taskRegister, /organization_members|profiles|workloads:/);
  assert.doesNotMatch(caseRegister, /organization_members|getCaseAssigneeWorkloads|workloads:/);
  assert.match(caseRegister, /\.in\("status", registerStatuses\)/);
});

test("Dashboard transfers only fields used by its visible and intelligence sections", () => {
  const repository = source("lib/data/case-repository.ts");
  const start = repository.indexOf("export async function getLiveOrganizationData");
  const end = repository.indexOf("async function buildCaseRepositoryProfileDirectory", start);
  const loader = repository.slice(start, end);
  for (const relation of [
    "organization_cases",
    "organization_customers",
    "case_assignments",
    "organization_case_tasks",
    "organization_case_activity",
    "organization_service_requests",
  ]) {
    const relationStart = loader.indexOf(`.from("${relation}")`);
    const relationEnd = loader.indexOf(".eq(\"organization_id\"", relationStart);
    assert.doesNotMatch(loader.slice(relationStart, relationEnd), /\.select\("\*"\)/);
  }
  assert.doesNotMatch(loader, /\.from\("organization_members"\)/);
  assert.match(loader, /\.limit\(50\)/);
  assert.match(loader, /staff: \[\]/);
});

test("Reports use one PostgreSQL aggregate instead of transferring raw event rows", () => {
  const repository = source("lib/data/reports-repository.ts");
  const migration = source(migrationPath);
  const start = repository.indexOf("export async function getOperationalReport");
  const loader = repository.slice(start);
  assert.match(loader, /rpc\("get_operational_report_aggregate"/);
  assert.doesNotMatch(loader, /from\("organization_cases"\)/);
  assert.doesNotMatch(loader, /from\("organization_case_tasks"\)/);
  assert.doesNotMatch(loader, /from\("organization_service_requests"\)/);
  assert.doesNotMatch(loader, /from\("organization_customers"\)/);
  assert.match(migration, /create function public\.get_operational_report_aggregate/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /grant execute on function public\.get_operational_report_aggregate/);
  assert.match(migration, /to authenticated/);
});

test("Phase 2 adds no client fetching, polling, caching, or timing diagnostics", () => {
  const changed = [
    "app/tasks/page.tsx",
    "app/cases/page.tsx",
    "components/tasks/tasks-page-sections.tsx",
    "components/cases/cases-page-sections.tsx",
    "lib/data/case-repository.ts",
    "lib/data/reports-repository.ts",
  ].map(source).join("\n");
  assert.doesNotMatch(changed, /"use client"|useEffect|setInterval|\.channel\(|subscribe\(/);
  assert.doesNotMatch(changed, /unstable_cache|DM3Oi PERF|performance\.now|console\.time/);
});
