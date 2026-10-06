import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

test("temporary performance diagnostics remain inline in only the three server pages", () => {
  const dashboard = source("app/page.tsx");
  const cases = source("app/cases/page.tsx");
  const reports = source("app/reports/page.tsx");
  const instrumentedFiles = ["app", "components", "lib"]
    .flatMap(sourceFiles)
    .filter((path) => source(path).includes("DM3Oi PERF"))
    .sort();

  assert.deepEqual(instrumentedFiles, [
    "app/cases/page.tsx",
    "app/page.tsx",
    "app/reports/page.tsx",
  ]);
  assert.equal(existsSync("lib/server-performance.ts"), false);

  for (const page of [dashboard, cases, reports]) {
    assert.doesNotMatch(page, /measureServerPerformance|["']use client["']/);
    assert.doesNotMatch(
      page,
      /setInterval|setTimeout|fetch\(|createClient|postgres_changes|\.channel\(|visibilitychange|router\.refresh/,
    );
  }

  assert.match(
    dashboard,
    /Promise\.all\(\[\s*getLiveOrganizationData\(\),[\s\S]*getUnreadNotificationCount\([\s\S]*getGoalDashboardSummary\(\),\s*\]\)/,
  );
  assert.match(
    cases,
    /Promise\.all\(\[\s*getCasesRegisterData\(\),\s*searchParams,\s*getAccessContext\(\),\s*\]\)/,
  );
  assert.ok(
    reports.indexOf("await getOperationalReport(params)") <
      reports.indexOf("await getBusinessReach()"),
  );

  for (const path of [
    "lib/auth/context.ts",
    "lib/data/case-repository.ts",
    "lib/data/goals-repository.ts",
    "lib/data/operational-intelligence-repository.ts",
    "lib/data/reports-repository.ts",
  ]) {
    assert.doesNotMatch(
      source(path),
      /DM3Oi PERF|measureServerPerformance/,
    );
  }
});
