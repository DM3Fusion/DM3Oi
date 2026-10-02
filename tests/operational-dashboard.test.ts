import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

test("authenticated shell presents DM3Oi branding and preserves operational navigation", () => {
  const shell = source("components/layout/app-shell.tsx");
  const navigation = source("lib/application-navigation.ts");
  assert.match(shell, /className="brand brand-hero"/);
  assert.match(shell, /aria-label="DM3Oi Operational Intelligence home"/);
  assert.match(shell, /src="\/images\/dm3oi-operations-hero\.jpg"/);
  assert.match(shell, /className="brand-hero-image"/);
  assert.match(shell, /className="sidebar-brand-version">\{applicationVersionLabel\}<\/div>/);
  assert.match(shell, /People\.<\/span> Work\. Progress\. Intelligence\./);
  assert.match(shell, /className="organization-context-prefix">for<\/span><b className="organization-context-name">\{org\?\.name \?\? "No active organization"\}<\/b>/);
  assert.doesNotMatch(shell, /Mimms['’] Tax Service/);
  for (const label of ["Dashboard", "Cases", "Service Desk", "Inbox", "Customers", "Tasks", "Questions & Rules", "Reports", "Users", "Settings"]) assert.match(navigation, new RegExp(`label: "${label}"`));
  assert.doesNotMatch(navigation, /label: "Administration"/);
  assert.match(shell, /aria-label="Administration navigation"/);
  assert.doesNotMatch(shell, /Case Management Intelligence/);
});

test("operational dashboard exposes the canonical workload row and Customer Metrics", () => {
  const metrics = source("lib/live-dashboard-metrics.ts");

  for (const [label, href] of [
    ["Due Today", "/tasks?due=today"],
    ["Open Cases", "/cases?status=active"],
    ["Open Tasks", "/tasks?status=open"],
    ["Open Requests", "/service-desk/requests?status=open"],
    ["Current Tax-Year Customers", "/customers"],
    ["Prior Tax-Year Customers", "/customers"],
    ["Repeat Customers", "/customers"],
    ["New Customers", "/customers"],
    ["Inactive Prior-Year Customers", "/customers"],
    ["Customers Without an Active Case", "/customers"],
    ["Lifetime Customers", "/customers"],
  ]) {
    assert.match(
      metrics,
      new RegExp(
        `label:\\"${label}\\",value:[^,]+,href:\\"${href.replace(/[?]/g, "\\?")}\\"`,
      ),
    );
  }

  assert.match(metrics, /label:"Tax-Year Case Coverage"/);
  assert.match(metrics, /valueSuffix:"%"/);
});

test("dashboard includes deterministic attention, progress, task status, and linked recent activity", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const metrics = source("lib/live-dashboard-metrics.ts");
  for (const heading of ["Case Progress", "Task Status", "All Needing Attention", "Recent Activity"]) assert.match(dashboard, new RegExp(`>${heading}<`));
  for (const signal of ["Overdue tasks", "Tasks due today", "Unassigned service requests", "Requests awaiting staff response", "Unread communications"]) assert.match(metrics, new RegExp(signal));
  assert.match(dashboard, /href=\{`\/cases\/\$\{activity\.case_id\}`\}/);
  assert.match(dashboard, /formatOrganizationDateTime\(activity\.created_at,data\.timezone\)/);
  assert.match(dashboard, /<OperationalIntelligenceSection intelligence=\{intelligence\}/);
});

test("Dashboard DOM places attention directly after workload KPIs and before Customer Metrics", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const workload = dashboard.indexOf('aria-label="Action and workload summary"');
  const attention = dashboard.indexOf('className="operations-attention-row"');
  const needsAttention = dashboard.indexOf(">All Needing Attention<");
  const casesNeedingAttention = dashboard.indexOf("<CasesNeedingAttention intelligence={intelligence}");
  const customerMetrics = dashboard.indexOf(">Customer Metrics<");
  const caseProgress = dashboard.indexOf(">Case Progress<");
  const intelligence = dashboard.indexOf("<OperationalIntelligenceSection intelligence={intelligence}");
  const recentActivity = dashboard.indexOf(">Recent Activity<");

  assert.ok(workload > -1 && workload < attention);
  assert.ok(attention < needsAttention && needsAttention < casesNeedingAttention);
  assert.ok(casesNeedingAttention < customerMetrics);
  assert.ok(customerMetrics < caseProgress);
  assert.ok(caseProgress < intelligence && intelligence < recentActivity);

  assert.equal(dashboard.match(/>Recent Activity</g)?.length, 1);
  assert.equal(dashboard.match(/<OperationalIntelligenceSection intelligence=\{intelligence\}/g)?.length, 1);
  assert.equal(dashboard.match(/<CasesNeedingAttention intelligence=\{intelligence\}/g)?.length, 1);
});

test("desktop and tablet pair the attention cards in their dedicated row", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.operations-attention-row\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(css, /@media\(max-width:1050px\)\{\.operations-visuals,\.operations-lower,\.operations-attention-row\{grid-template-columns:1fr\}\}/);
  assert.match(css, /@media\(max-width:600px\)\{[\s\S]*?\.operations-attention-row\{grid-template-columns:1fr\}/);
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
  for (const href of ["/tasks?status=completed", "/tasks?status=open", "/tasks?status=waiting-on-customer", "/tasks?due=overdue"]) assert.match(dashboard, new RegExp(`href=\"${href.replace("?", "\\?")}\"`));
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
  assert.match(dashboard, /<strong>\{summary\.tasks\.(?:completed|open|waitingOnCustomer|overdue)\}<\/strong>/);
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
  assert.match(dashboard, /attention-summary-heading/);
  assert.match(dashboard, /<AttentionSummaryRing\s+items=\{summary\.attention\}\s*\/>/);
  assert.match(dashboard, /<h2>All Needing Attention<\/h2>/);
  assert.match(dashboard, /<div className="attention-summary-layout"><div className="attention-list">/);
  assert.doesNotMatch(css, /grid-template-areas:"attention-summary attention-heading"/);
  assert.match(css, /\.attention-summary-heading\{display:block\}/);
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
  assert.match(css, /\.attention-summary-heading \.attention-summary-ring,[\s\S]*?\.single-attention-case \.case-heading-progress\{[\s\S]*?width:96px;[\s\S]*?height:96px;[\s\S]*?flex:0 0 96px/);
  assert.match(css, /\.single-attention-case \.case-heading-progress\s*\{[^}]*display:grid/);
  assert.match(css, /\.single-attention-case \.case-row-progress\s*\{[^}]*display:none/);
  assert.match(css, /\.single-attention-case \.attention-case-list>a,\s*\.single-attention-case \.attention-case-list>div\s*\{[^}]*grid-template-columns:64px minmax\(0,1fr\)/);
  assert.match(css, /@media\(max-width:600px\)\{[\s\S]*?\.attention-case-list \.case-attention-progress\{grid-column:2;justify-self:end/);
});

test("wide attention cards share structural header geometry and equivalent donut treatment", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const css = source("app/globals.css");

  assert.match(dashboard, /attention-summary-heading/);
  assert.match(dashboard, /<AttentionSummaryRing\s+items=\{summary\.attention\}\s*\/>/);

  assert.match(
    css,
    /\.attention-summary-heading,\s*\.single-attention-case \.cases-attention-heading\{[\s\S]*?min-block-size:124px;[\s\S]*?display:flex;[\s\S]*?align-items:center;[\s\S]*?justify-content:flex-start;[\s\S]*?gap:24px;[\s\S]*?padding:14px 32px/,
  );

  assert.match(
    css,
    /\.attention-summary-heading \.attention-summary-ring,\s*\.single-attention-case \.case-heading-progress\{[\s\S]*?width:96px;[\s\S]*?height:96px;[\s\S]*?flex:0 0 96px/,
  );

  assert.match(
    css,
    /\.attention-summary-heading \.attention-ring-track,\s*\.attention-summary-heading \.attention-ring-segment\{[\s\S]*?stroke-width:9;[\s\S]*?vector-effect:non-scaling-stroke/,
  );

  assert.match(
    css,
    /\.attention-summary-heading \.attention-summary-ring strong,\s*\.single-attention-case \.case-heading-progress strong\{[\s\S]*?font-size:12px/,
  );

  assert.match(
    css,
    /\.attention-summary-heading \.attention-summary-ring small,\s*\.single-attention-case \.case-heading-progress small\{[\s\S]*?font-size:7px/,
  );

  assert.match(
    css,
    /\.single-attention-case \.case-heading-progress:after\{\s*inset:9px/,
  );

  assert.doesNotMatch(
    css,
    /grid-template-areas:"attention-summary attention-heading"/,
  );
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

test("phone Top Bottlenecks contains the customer-waiting message in normal flow", () => {
  const intelligence = source("components/dashboard/operational-intelligence.tsx");
  const css = source("app/globals.css");
  assert.match(intelligence, /<h2>Top Bottlenecks<\/h2>[\s\S]*?<div className="blocked-work-empty">No Cases currently have required work waiting on the Customer\.<\/div>/);
  assert.match(intelligence, /className=\{`panel intelligence-panel cases-needing-attention\$\{singleCase \? " single-attention-case" : ""\}`\}[\s\S]*?<h2>Cases Needing Attention<\/h2>/);
  const containment = css.match(/\.blocked-work-empty\{([^}]*)\}/)?.[1] ?? "";
  assert.match(containment, /min-width:0/);
  assert.match(containment, /margin:0/);
  assert.match(containment, /padding:8px 16px 18px/);
  assert.match(containment, /white-space:normal/);
  assert.match(containment, /overflow-wrap:anywhere/);
  assert.doesNotMatch(containment, /position:absolute|(?:^|;)(?:min-|max-)?height:/);
  assert.match(intelligence, /intelligence\.waitingOnCustomerWork\.cases\.length/);
  assert.match(intelligence, /intelligence\.waitingOnCustomerWork\.topTasks\.map/);
});

test("destination filters reuse authorized organization data and shared semantics", () => {
  const tasks = source("app/tasks/page.tsx");
  const cases = source("app/cases/page.tsx");
  const requests = source("app/service-desk/requests/page.tsx");
  const filters = source("lib/operational-filters.ts");
  assert.match(tasks, /getTaskRegisterData\(\)/);
  assert.doesNotMatch(tasks, /getLiveOrganizationData\(\)/);
  assert.match(tasks, /matchesTaskFilter\(task, status, due, data\.timezone\)/);
  assert.match(cases, /matchesCaseRegisterFilters\(item, filters, data\.timezone\)/);
  assert.match(filters, /!\["COMPLETED", "NOT_APPLICABLE", "REQUIRED_UNAVAILABLE"\]\.includes\(task\.status\)/);
  assert.match(filters, /startOfOrganizationDay\(now, timezone\)/);
  assert.match(requests, /q\?\.status === "open"/);
  assert.match(requests, /serviceRequestStatuses\.includes/);
});

test("dashboard queries remain authorized and recipient scoped", () => {
  const page = source("app/page.tsx");
  const repository = source("lib/data/case-repository.ts");
  const communications = source("lib/data/communications-repository.ts");
  assert.match(page, /getLiveOrganizationData\(\)/);
  assert.match(
    page,
    /getUnreadNotificationCount\(\{[\s\S]*?organizationId:\s*[\s\S]*?access\.activeOrganization!\.id,[\s\S]*?userId:\s*access\.user\.id,[\s\S]*?\}\)/,
  );
  assert.match(repository, /hasTenantInternalAccess\(access\)/);
  assert.match(repository, /\.eq\("organization_id", organizationId\)/);
  assert.match(communications, /get_my_unread_notification_count/);
  assert.match(
    communications,
    /target_organization_id:\s*organizationId/,
  );
  const unreadCountMigration = source(
    "supabase/migrations/20260930003000_dm3oi_notification_unread_count_rpc.sql",
  );
  assert.match(unreadCountMigration, /actor uuid := auth\.uid\(\)/);
  assert.match(
    unreadCountMigration,
    /notification\.recipient_user_id = actor/,
  );
});

test("dashboard KPI cards remain four columns on wide and two on narrow layouts", () => {
  const css = source("app/globals.css");
  assert.match(css, /\/\* Operational summary: intentionally compact, text-only KPI cards\. \*\/[\s\S]*\.operations-kpis\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/);
  assert.match(css, /@media\(max-width:850px\)\{\.operations-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/);
  assert.match(css, /@media\(max-width:600px\)\{\.operations-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:6px\}/);
  assert.match(css, /\.operations-kpi\{min-height:82px;gap:4px;padding:9px 5px\}/);
  assert.match(css, /\.operations-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:6px\}/);
  assert.match(css, /\.operations-kpi-label\{[^}]*overflow-wrap:anywhere\}/);
  const operationalSummaryStart = css.indexOf(
      "/* Operational summary: intentionally compact, text-only KPI cards. */",
    );
    const operationalSummaryEnd = css.indexOf(
      "/* Desktop and tablet product identity; the phone header remains independent. */",
      operationalSummaryStart,
    );
    const operationalSummary = css.slice(
      operationalSummaryStart,
      operationalSummaryEnd,
    );

    assert.ok(operationalSummaryStart >= 0);
    assert.ok(operationalSummaryEnd > operationalSummaryStart);
    assert.doesNotMatch(
      operationalSummary,
      /overflow-x:(?:auto|scroll)/,
    );
  assert.doesNotMatch(css, /route-progress|navigation-progress/);
});

test("dashboard KPIs render the canonical workload and Customer Metrics labels", () => {
  const dashboard = source("components/dashboard/dashboard.tsx");
  const metrics = source("lib/live-dashboard-metrics.ts");

  const workloadLabels = [
    'label:"Due Today"',
    'label:"Open Cases"',
    'label:"Open Tasks"',
    'label:"Open Requests"',
  ];

  const workloadIndexes = workloadLabels.map((label) => metrics.indexOf(label));
  assert.ok(workloadIndexes.every((index) => index >= 0));
  assert.ok(workloadIndexes[1] > workloadIndexes[0]);
  assert.ok(workloadIndexes[2] > workloadIndexes[1]);
  assert.ok(workloadIndexes[3] > workloadIndexes[2]);

  const coverageIndex = metrics.indexOf('label:"Tax-Year Case Coverage"');
  const currentTaxYearIndex = metrics.indexOf('label:"Current Tax-Year Customers"');
  const priorTaxYearIndex = metrics.indexOf('label:"Prior Tax-Year Customers"');
  const repeatCustomersIndex = metrics.indexOf('label:"Repeat Customers"');
  const newCustomersIndex = metrics.indexOf('label:"New Customers"');
  const inactivePriorYearIndex = metrics.indexOf('label:"Inactive Prior-Year Customers"');
  const withoutActiveCaseIndex = metrics.indexOf('label:"Customers Without an Active Case"');
  const lifetimeCustomersIndex = metrics.indexOf('label:"Lifetime Customers"');

  assert.ok(coverageIndex >= 0);
  assert.ok(currentTaxYearIndex > coverageIndex);
  assert.ok(priorTaxYearIndex > currentTaxYearIndex);
  assert.ok(repeatCustomersIndex > priorTaxYearIndex);
  assert.ok(newCustomersIndex > repeatCustomersIndex);
  assert.ok(inactivePriorYearIndex > newCustomersIndex);
  assert.ok(withoutActiveCaseIndex > inactivePriorYearIndex);
  assert.ok(lifetimeCustomersIndex > withoutActiveCaseIndex);

  assert.match(
    dashboard,
    /<h2 id="customer-metrics-heading">Customer Metrics<\/h2>/,
  );
  assert.match(
    dashboard,
    /<span className="operations-kpi-label">\{item\.label\}<\/span>/,
  );
  assert.match(
    dashboard,
    /<strong>\{item\.value\}\{"valueSuffix" in item \? item\.valueSuffix : ""\}<\/strong>/,
  );
  assert.doesNotMatch(
    dashboard,
    /operations-kpi-icon|iconFor\(item\.label\)/,
  );
  assert.match(dashboard, /<small>\{item\.detail\}<\/small>/);
});
