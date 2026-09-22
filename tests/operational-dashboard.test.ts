import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

test("authenticated shell presents DM3Oi branding and preserves operational navigation", () => {
  const shell = source("components/layout/app-shell.tsx");
  const navigation = source("lib/application-navigation.ts");
  assert.match(shell, /className="dm3oi-wordmark"/);
  assert.match(shell, /className="dm3oi-wordmark-main"/);
  assert.match(shell, /className="brand-dm3">DM3<\/span>/);
  assert.match(shell, /className="brand-oi">Oi<\/span>/);
  assert.match(shell, /className="dm3oi-wordmark-tm">™<\/span>/);
  assert.match(shell, /OPERATIONAL<br\/>INTELLIGENCE/);
  assert.match(shell, /People\.<\/span> Work\. Progress\. Intelligence\./);
  assert.match(shell, /className="organization-context-prefix">for<\/span><b className="organization-context-name">\{org\?\.name \?\? "No active organization"\}<\/b>/);
  assert.doesNotMatch(shell, /Mimms['’] Tax Service/);
  for (const label of ["Dashboard", "Cases", "Service Desk", "Inbox", "Customers", "Tasks", "Questions & Rules", "Reports", "Users", "Settings"]) assert.match(navigation, new RegExp(`label: "${label}"`));
  assert.doesNotMatch(navigation, /label: "Administration"/);
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
  assert.match(dashboard, /<OperationalIntelligenceSection intelligence=\{intelligence\}/);
});

test("Dashboard DOM preserves the streamlined phone order with Recent Activity once and last", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const caseProgress = dashboard.indexOf(">Case Progress<");
  const taskStatus = dashboard.indexOf(">Task Status<");
  const needsAttention = dashboard.indexOf(">Needs Attention<");
  const intelligence = dashboard.indexOf("<OperationalIntelligenceSection intelligence={intelligence}");
  const casesNeedingAttention = dashboard.indexOf("<CasesNeedingAttention intelligence={intelligence}");
  const recentActivity = dashboard.indexOf(">Recent Activity<");
  assert.ok(caseProgress > -1 && caseProgress < taskStatus);
  assert.ok(taskStatus < needsAttention && needsAttention < intelligence);
  assert.ok(intelligence < casesNeedingAttention && casesNeedingAttention < recentActivity);
  assert.equal(dashboard.match(/>Recent Activity</g)?.length, 1);
  assert.equal(dashboard.match(/<OperationalIntelligenceSection intelligence=\{intelligence\}/g)?.length, 1);
  assert.equal(dashboard.match(/<CasesNeedingAttention intelligence=\{intelligence\}/g)?.length, 1);
});

test("desktop and tablet pair attention cards before Intelligence and place Recent Activity last", () => {
  const css = source("app/globals.css");
  assert.match(css, /@media\(min-width:601px\)\{\.operations-lower\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\.operations-lower>\.needs-attention\{order:1\}\.operations-lower>\.cases-needing-attention\{order:2\}\.operations-lower>\.operational-intelligence\{grid-column:1\/-1;order:3\}\.operations-lower>\.recent-activity\{grid-column:1\/-1;order:4\}\}/);
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

test("phone Task Status keeps its visualization and uses a compact aligned value column", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const css = source("app/globals.css");
  assert.match(css, /@media\(max-width:600px\)\{\.task-status-layout\{grid-template-columns:98px minmax\(0,1fr\);gap:10px\}/);
  assert.match(css, /\.task-status-list\{justify-self:start;width:min\(100%,200px\)\}/);
  assert.match(css, /\.task-status-list>a\{display:grid;grid-template-columns:minmax\(0,1fr\) 5ch;gap:12px\}/);
  assert.match(css, /\.task-status-list>a>strong\{text-align:right;font-variant-numeric:tabular-nums\}/);
  assert.match(dashboard, /className="task-ring"[\s\S]*?taskCompletion\*3\.6/);
  assert.match(dashboard, />View tasks <ApplicationIcon name="forward"/);
  assert.match(dashboard, /<strong>\{summary\.tasks\.(?:completed|open|blocked|overdue)\}<\/strong>/);
  assert.match(css, /\.task-status-layout\{display:grid;grid-template-columns:135px 1fr/);
});

test("Needs Attention donut summarizes only the existing actionable row counts", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const css = source("app/globals.css");
  assert.match(dashboard, /function AttentionSummaryRing\(\{items\}/);
  assert.match(dashboard, /const total=items\.reduce\(\(sum,item\)=>sum\+item\.value,0\)/);
  assert.match(dashboard, /<AttentionSummaryRing items=\{summary\.attention\}/);
  assert.match(dashboard, /needs-attention\$\{summary\.attention\.length \? " has-attention-summary" : ""\}/);
  assert.match(dashboard, /summary\.attention\.map\(item=><Link href=\{item\.href\}/);
  assert.match(dashboard, /aria-label=\{`\$\{total\} current attention items`\}/);
  assert.match(dashboard, /<small>Items<\/small>/);
  assert.doesNotMatch(dashboard, /attention-summary-ring[\s\S]{0,300}(?:Complete|Progress|Readiness)/);
  assert.doesNotMatch(dashboard, /getLiveOrganizationData|getOperationalIntelligence/);
  assert.match(css, /@media\(min-width:601px\)\{\.needs-attention\.has-attention-summary\{[^}]*grid-template-areas:"attention-summary attention-heading" "attention-rows attention-rows"/);
  assert.match(css, /\.has-attention-summary>\.attention-summary-layout\{display:contents\}/);
  assert.match(css, /\.has-attention-summary \.attention-summary-layout \.attention-list\{grid-area:attention-rows;padding:0 18px 12px\}/);
  assert.match(css, /\.has-attention-summary \.attention-heading-icon\{display:none\}/);
  assert.match(css, /@media\(max-width:600px\)\{\.attention-summary-layout\{grid-template-columns:72px minmax\(0,1fr\)/);
});

test("a single Case needing attention moves its existing progress ring to the wide heading", () => {
  const intelligence = source("components/dashboard/operational-intelligence.tsx");
  const css = source("app/globals.css");
  assert.match(intelligence, /const displayedCases = intelligence\.attentionCases\.slice\(0, 6\)/);
  assert.match(intelligence, /const singleCase = capabilities\.viewCases && displayedCases\.length === 1 \? displayedCases\[0\] : null/);
  assert.match(intelligence, /singleCase \? <CaseProgressRing progressPercent=\{singleCase\.progressPercent\} heading \/> : null/);
  assert.match(intelligence, /style=\{\{ "--case-progress": `\$\{progressPercent \* 3\.6\}deg`/);
  assert.match(intelligence, /aria-label=\{`\$\{progressPercent\}% case progress`\}/);
  assert.match(intelligence, /<strong>\{progressPercent\}%<\/strong>/);
  assert.match(intelligence, /heading \? <small>Progress<\/small> : null/);
  assert.match(intelligence, /attention-level level-\$\{item\.level\.toLowerCase\(\)\}/);
  assert.doesNotMatch(intelligence, /<b>\{(?:item\.)?progressPercent\}%<\/b>/);
  assert.match(css, /\.case-attention-progress\{[^}]*width:58px;height:58px[^}]*conic-gradient\(#2d8fa9 var\(--case-progress\),#e7edf3 0\)/);
  assert.match(css, /\.case-heading-progress\{display:none\}/);
  assert.match(css, /@media\(min-width:601px\)[^\n]*\.single-attention-case \.case-heading-progress\{display:grid;width:64px;height:64px\}/);
  assert.match(css, /\.single-attention-case \.case-row-progress\{display:none\}/);
  assert.match(css, /\.single-attention-case \.attention-case-list>a,\.single-attention-case \.attention-case-list>div\{grid-template-columns:64px minmax\(0,1fr\)\}/);
  assert.match(css, /@media\(max-width:600px\)[^\n]*\.attention-case-list \.case-attention-progress\{grid-column:2;justify-self:end/);
});

test("multiple Cases needing attention keep one progress ring associated with every row", () => {
  const intelligence = source("components/dashboard/operational-intelligence.tsx");
  const css = source("app/globals.css");
  assert.match(intelligence, /singleCase \? <CaseProgressRing progressPercent=\{singleCase\.progressPercent\} heading \/> : null/);
  assert.match(intelligence, /displayedCases\.map\(\(item\)/);
  assert.match(intelligence, /<CaseProgressRing progressPercent=\{item\.progressPercent\} \/>/);
  assert.doesNotMatch(intelligence, /displayedCases\.(?:reduce|find)|attentionCases\.(?:reduce|find)/);
  assert.match(css, /\.attention-case-list>a,\.attention-case-list>div\{display:grid;grid-template-columns:64px minmax\(0,1fr\) auto/);
  assert.match(css, /\.attention-case-list>a>\.case-attention-progress,\.attention-case-list>div>\.case-attention-progress\{justify-self:end\}/);
});

test("phone Top Bottlenecks contains the blocked-work message in normal flow", () => {
  const intelligence = source("components/dashboard/operational-intelligence.tsx");
  const css = source("app/globals.css");
  assert.match(intelligence, /<h2>Top Bottlenecks<\/h2>[\s\S]*?<div className="blocked-work-empty">No Cases currently have blocked required work\.<\/div>/);
  assert.match(intelligence, /className=\{`panel intelligence-panel cases-needing-attention\$\{singleCase \? " single-attention-case" : ""\}`\}[\s\S]*?<h2>Cases Needing Attention<\/h2>/);
  const containment = css.match(/\.blocked-work-empty\{([^}]*)\}/)?.[1] ?? "";
  assert.match(containment, /min-width:0/);
  assert.match(containment, /margin:0/);
  assert.match(containment, /padding:8px 16px 18px/);
  assert.match(containment, /white-space:normal/);
  assert.match(containment, /overflow-wrap:anywhere/);
  assert.doesNotMatch(containment, /position:absolute|(?:^|;)(?:min-|max-)?height:/);
  assert.match(intelligence, /intelligence\.blockedWork\.cases\.length/);
  assert.match(intelligence, /intelligence\.blockedWork\.topTasks\.map/);
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

test("dashboard KPI cards remain three columns on wide and phone layouts", () => {
  const css = source("app/globals.css");
  assert.match(css, /\/\* Operational summary: intentionally compact, text-only KPI cards\. \*\/[\s\S]*\.operations-kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
  assert.match(css, /@media\(max-width:850px\)\{\.operations-kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}\}/);
  assert.match(css, /@media\(max-width:600px\)\{\.operations-kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);gap:6px\}/);
  assert.match(css, /\.operations-kpi\{min-height:82px;gap:4px;padding:9px 5px\}/);
  assert.match(css, /\.operations-kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);gap:6px\}/);
  assert.match(css, /\.operations-kpi-label\{[^}]*overflow-wrap:anywhere\}/);
  assert.doesNotMatch(css.slice(css.lastIndexOf("/* Operational summary")), /overflow-x:(?:auto|scroll)/);
  assert.doesNotMatch(css, /route-progress|navigation-progress/);
});

test("dashboard KPIs render only the existing labels and model values", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const metrics = source("lib/live-dashboard-metrics.ts");
  for (const label of ["Active Cases", "Open Tasks", "Due Today", "Open Service Requests", "Unread Communications", "Customers"]) {
    assert.match(metrics, new RegExp(`label:\\"${label}\\"`));
  }
  assert.match(dashboard, /<span className="operations-kpi-label">\{item\.label\}<\/span>/);
  assert.match(dashboard, /<strong>\{item\.value\}<\/strong>/);
  assert.doesNotMatch(dashboard, /operations-kpi-icon|iconFor\(item\.label\)|item\.detail/);
  for (const detail of ["Current authorized caseload", "Not completed or excluded", "Organization-local date", "Active Service Desk workload", "Your unread notifications", "Visible organization records"]) {
    assert.doesNotMatch(dashboard, new RegExp(detail));
  }
});
