import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

test("authenticated shell presents DM3Oi branding and preserves operational navigation", () => {
  const shell = source("components/layout/app-shell.tsx");
  assert.match(shell, /className="dm3oi-wordmark"/);
  assert.match(shell, /className="dm3oi-wordmark-main"/);
  assert.match(shell, /className="brand-dm3">DM3<\/span>/);
  assert.match(shell, /className="brand-oi">Oi<\/span>/);
  assert.match(shell, /className="dm3oi-wordmark-tm">™<\/span>/);
  assert.match(shell, /OPERATIONAL<br\/>INTELLIGENCE/);
  assert.match(shell, /People\.<\/span> Work\. Progress\. Intelligence\./);
  assert.match(shell, /<>for <b>\{org\?\.name \?\? "No active organization"\}<\/b><\/>/);
  assert.doesNotMatch(shell, /Mimms['’] Tax Service/);
  for (const label of ["Dashboard", "Cases", "Service Desk", "Communications", "Customers", "Tasks", "Questions & Rules", "Reports", "Users", "Settings"]) assert.match(shell, new RegExp(`label: "${label}"`));
  assert.doesNotMatch(shell, /label: "Administration"/);
  assert.match(shell, /aria-label="Administration navigation"/);
  assert.doesNotMatch(shell, /Case Management Intelligence/);
});

test("operational dashboard exposes six linked primary KPIs", () => {
  const metrics = source("lib/live-dashboard-metrics.ts");
  for (const [label, href] of [
    ["Active Cases", "/cases?status=active"],
    ["Open Tasks", "/tasks?status=open"],
    ["Due Today", "/tasks?due=today"],
    ["Open Service Requests", "/service-desk/requests?status=open"],
    ["Unread Communications", "/communications?status=unread"],
    ["Customers", "/customers"],
  ]) {
    assert.match(metrics, new RegExp(`label:\\"${label}\\",value:[^,]+,href:\\"${href.replace(/[?]/g, "\\?")}\\"`));
  }
});

test("dashboard includes deterministic attention, progress, task status, and linked recent activity", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const metrics = source("lib/live-dashboard-metrics.ts");
  for (const heading of ["Case Progress", "Task Status", "Needs Attention", "Recent Activity"]) assert.match(dashboard, new RegExp(`>${heading}<`));
  for (const signal of ["Overdue tasks", "Tasks due today", "Unassigned service requests", "Requests awaiting staff response", "Unread communications"]) assert.match(metrics, new RegExp(signal));
  assert.match(dashboard, /href=\{`\/cases\/\$\{activity\.case_id\}`\}/);
  assert.match(dashboard, /formatOrganizationDateTime\(activity\.created_at,data\.timezone\)/);
  assert.match(dashboard, /Future Operational Pulse insights/);
});

test("approved dashboard panel order is preserved", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const caseProgress = dashboard.indexOf(">Case Progress<");
  const taskStatus = dashboard.indexOf(">Task Status<");
  const needsAttention = dashboard.indexOf(">Needs Attention<");
  const recentActivity = dashboard.indexOf(">Recent Activity<");
  assert.ok(caseProgress > -1 && caseProgress < taskStatus);
  assert.ok(taskStatus < needsAttention && needsAttention < recentActivity);
});

test("case progress uses an accessible vertical bar chart with preserved categories", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const metrics = source("lib/live-dashboard-metrics.ts");
  const css = source("app/globals.css");
  assert.match(dashboard, /className="case-progress-chart" role="group"/);
  assert.match(dashboard, /className="case-progress-column"/);
  assert.match(dashboard, /style=\{\{height:`\$\{item\.value\/maxCases\*100\}%`\}\}/);
  assert.doesNotMatch(dashboard, /progress-distribution-row|distribution-track/);
  for (const label of ["New", "Assigned", "In Progress", "Waiting", "Completed"]) assert.match(metrics, new RegExp(`label:\\"${label}\\"`));
  assert.match(css, /\.case-progress-plot\{display:flex;align-items:center;justify-content:flex-end;flex-direction:column/);
});

test("case progress and task status expose semantic drill-down links", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const metrics = source("lib/live-dashboard-metrics.ts");
  for (const href of ["/cases?status=new", "/cases?status=assigned", "/cases?status=in-progress", "/cases?status=waiting", "/cases?status=completed"]) assert.match(metrics, new RegExp(`href:\"${href.replace("?", "\\?")}\"`));
  for (const href of ["/tasks?status=completed", "/tasks?status=open", "/tasks?status=blocked", "/tasks?due=overdue"]) assert.match(dashboard, new RegExp(`href=\"${href.replace("?", "\\?")}\"`));
  assert.match(dashboard, /<Link className="case-progress-column" href=\{item\.href\}/);
  assert.match(dashboard, /aria-label=\{`View \$\{item\.label\.toLowerCase\(\)\} cases`\}/);
});

test("destination filters reuse authorized organization data and shared semantics", () => {
  const tasks = source("app/tasks/page.tsx");
  const cases = source("app/cases/page.tsx");
  const requests = source("app/service-desk/requests/page.tsx");
  const filters = source("lib/operational-filters.ts");
  assert.match(tasks, /getLiveOrganizationData\(\)/);
  assert.match(tasks, /matchesTaskFilter\(task, status, due, data\.timezone\)/);
  assert.match(cases, /matchesCaseRegisterFilters\(item, filters, data\.timezone\)/);
  assert.match(filters, /!\["COMPLETED", "NOT_APPLICABLE"\]\.includes\(task\.status\)/);
  assert.match(filters, /startOfOrganizationDay\(now, timezone\)/);
  assert.match(requests, /q\?\.status === "open"/);
  assert.match(requests, /serviceRequestStatuses\.includes/);
});

test("dashboard queries remain authorized and recipient scoped", () => {
  const page = source("app/page.tsx");
  const repository = source("lib/data/case-repository.ts");
  const communications = source("lib/data/communications-repository.ts");
  assert.match(page, /getLiveOrganizationData\(\)/);
  assert.match(page, /getUnreadNotificationCount\(\{organizationId:access\.activeOrganization!/);
  assert.match(repository, /hasTenantInternalAccess\(access\)/);
  assert.match(repository, /\.eq\("organization_id", organizationId\)/);
  assert.match(communications, /\.eq\("recipient_user_id", userId\)/);
});

test("dashboard layout has responsive six, three, and two-column KPI states", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.operations-kpis\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:1300px\)\{\.operations-kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:620px\)\{\.operations-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /route-progress|navigation-progress/);
});
