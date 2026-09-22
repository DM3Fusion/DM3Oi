import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const css = source("app/globals.css");
const dashboard = source("components/dashboard/dashboard.tsx");
const intelligence = source("components/dashboard/operational-intelligence.tsx");
const navigation = source("lib/application-navigation.ts");
const shell = source("components/layout/app-shell.tsx");

test("authenticated application uses a shared desktop tablet and phone typography hierarchy", () => {
  assert.match(css, /Authenticated application typography and density system\. Portal surfaces remain independent\./);
  assert.match(css, /\.main-column>main \.page-header h1[^}]*font-size:40px/);
  assert.match(css, /\.main-column>main \.section-head h2[^}]*font-size:25px/);
  assert.match(css, /@media\(max-width:850px\)[^{]*\{[\s\S]*?font-size:34px[\s\S]*?font-size:24px/);
  assert.match(css, /@media\(max-width:600px\)[^{]*\{[\s\S]*?font-size:30px[\s\S]*?font-size:22px/);
});

test("redundant Operational Dashboard explanations are absent while operational content remains", () => {
  const combined = dashboard + intelligence;
  for (const copy of [
    "Authorized cases by current workflow state",
    "Current task completion and exceptions",
    "Deterministic signals from current operational data",
    "Open the related workspace",
    "Latest authorized case workflow changes",
    "Explainable signals from authorized Cases, Questions, Tasks, and Rules.",
    "Current Cases by required-work completion",
    "Most common current completion requirements",
    "Explicit current blockers and incomplete requirements",
    "Current matches versus durable generated Tasks",
  ]) assert.doesNotMatch(combined, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const content of [
    "Case Progress", "Task Status", "All Needing Attention", "Recent Activity",
    "Readiness Distribution", "Top Bottlenecks", "Cases Needing Attention", "Rule Activity",
    "Completed", "Open", "Blocked", "Overdue",
  ]) assert.match(combined, new RegExp(content));
  assert.match(intelligence, /\$\{item\.incompleteCount\} incomplete/);
  assert.match(intelligence, /\$\{item\.overdueCount\} overdue/);
});

test("shared forms tables lists and actions use readable internal application sizing", () => {
  assert.match(css, /\.main-column>main input:not\(\[type="hidden"\]\)[^}]*font-size:16px/);
  assert.match(css, /\.main-column>main \.form-grid label>span[^}]*font-size:16px/);
  assert.match(css, /\.main-column>main th\{[^}]*font-size:14px/);
  assert.match(css, /\.main-column>main td\{[^}]*font-size:16px/);
  assert.match(css, /\.main-column>main \.table-secondary[^}]*font-size:14px/);
  assert.match(css, /\.main-column>main \.primary-button[^}]*min-height:44px[^}]*font-size:16px/);
});

test("Dashboard KPI cards remain text only and three by two on phone", () => {
  assert.match(css, /@media\(max-width:600px\)\{\.operations-kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);gap:6px\}/);
  assert.match(dashboard, /className="operations-kpi-label"/);
  assert.match(dashboard, /<strong>\{item\.value\}<\/strong>/);
  assert.doesNotMatch(dashboard, /operations-kpi-icon/);
});

test("Dashboard metric-summary cards center labels values and supporting metrics only", () => {
  assert.match(css, /Dashboard metric-summary cards share one centered label\/value\/supporting-metric treatment\./);
  assert.match(css, /\.intelligence-kpi\{align-items:center;text-align:center\}/);
  for (const label of ["Ready Cases", "Not Ready", "Blocked Cases", "Average Progress"]) {
    assert.match(intelligence, new RegExp(`label="${label}"`));
  }
  assert.match(intelligence, /<small>\{label\}<\/small>[\s\S]*<strong>\{value\}<\/strong>[\s\S]*<span>\{detail\}<\/span>/);
  assert.doesNotMatch(css, /\.intelligence-panel\{[^}]*text-align:center/);
  assert.doesNotMatch(css, /\.attention-list\{[^}]*text-align:center/);
  assert.match(css, /\.intelligence-kpis\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:760px\)\{\.intelligence-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("phone Dashboard hides Rule and Recent Activity without changing their data behavior", () => {
  const needsAttention = dashboard.indexOf("panel needs-attention");
  const operationalIntelligence = dashboard.indexOf("<OperationalIntelligenceSection intelligence={intelligence}");
  const recentActivity = dashboard.indexOf('className="panel recent-activity"');
  assert.ok(needsAttention > -1 && needsAttention < operationalIntelligence);
  assert.ok(operationalIntelligence < recentActivity);
  assert.equal(dashboard.match(/<OperationalIntelligenceSection intelligence=\{intelligence\}/g)?.length, 1);
  assert.equal(dashboard.match(/className="panel recent-activity"/g)?.length, 1);
  assert.match(dashboard, /data\.activities\.slice\(0,8\)\.map/);
  assert.match(dashboard, /href=\{`\/cases\/\$\{activity\.case_id\}`\}/);
  assert.match(intelligence, /className="panel intelligence-panel rule-activity"/);
  assert.match(intelligence, /activeRuleActivity\.slice\(0, 5\)\.map/);
  assert.match(intelligence, /href="\/questions\?view=rules">View Rules/);
  assert.match(css, /@media\(max-width:600px\)\{\.operational-intelligence \.rule-activity,\.operations-lower>\.recent-activity\{display:none\}\}/);
  assert.doesNotMatch(css, /@media\(min-width:601px\)\{[^}]*rule-activity[^}]*display:none/);
});

test("tablet and desktop pair attention panels before Intelligence and finish with Recent Activity", () => {
  assert.match(css, /@media\(min-width:601px\)\{\.operations-lower\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\.operations-lower>\.needs-attention\{order:1\}\.operations-lower>\.cases-needing-attention\{order:2\}\.operations-lower>\.operational-intelligence\{grid-column:1\/-1;order:3\}\.operations-lower>\.recent-activity\{grid-column:1\/-1;order:4\}\}/);
  assert.match(css, /\.operations-visuals,\.operations-lower\{display:grid;gap:16px\}/);
  assert.match(css, /\.operations-visuals,\.operations-lower\{grid-template-columns:minmax\(0,1\.35fr\) minmax\(310px,\.8fr\)\}/);
});

test("phone Dashboard retains complete readiness content and centered KPI summaries", () => {
  for (const content of [
    "Current completion readiness",
    "Readiness Distribution",
    "Top Bottlenecks",
    "Cases Needing Attention",
  ]) assert.match(intelligence, new RegExp(content));
  assert.match(css, /\.intelligence-kpi\{align-items:center;text-align:center\}/);
  assert.match(css, /@media\(max-width:600px\)\{\.operations-kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);gap:6px\}/);
  assert.doesNotMatch(css, /@media\(max-width:600px\)\{[^}]*\.operational-intelligence\{display:none/);
});

test("Inbox is the shared navigation label while Communications remains the workspace", () => {
  assert.match(navigation, /href: "\/communications", label: "Inbox", icon: "communications", permission: "VIEW_COMMUNICATIONS"/);
  assert.match(navigation, /mobilePrimaryDestinations = new Set\(\["\/", "\/cases", "\/communications"\]\)/);
  assert.match(shell, /item\.href === "\/communications" \? unreadNotificationCount/);
  assert.match(source("app/communications/page.tsx"), /title="Communications"/);
  assert.match(source("lib/data/communications-repository.ts"), /export async function getNotifications/);
  assert.doesNotMatch(navigation, /href: "\/inbox"/);
});

test("responsive shell architecture and representative width rules remain safe", () => {
  assert.match(css, /@media\(max-width:600px\)\{\.sidebar,\.scrim,\.menu-button\{display:none!important\}/);
  assert.match(css, /@media\(max-width:850px\)[^\n]*\.sidebar\.open\{transform:translateX\(0\)\}/);
  assert.match(css, /\.mobile-bottom-navigation>a\{[^}]*min-height:64px[^}]*font-size:15px/);
  assert.match(css, /\.mobile-navigation-icon \.application-icon\{width:25px;height:25px\}/);
  assert.match(css, /grid-auto-columns:1fr/);
  assert.match(css, /min-width:0/);
  for (const width of [320, 375, 390, 430, 601, 768, 820, 850, 1024, 1280, 1440]) assert.ok(width > 0);
});

test("Portal security navigation performance and icon architecture stay isolated", () => {
  assert.doesNotMatch(source("app/portal/layout.tsx") + source("components/portal-nav.tsx"), /AppShell|MobileBottomNavigation|organizationNavigation/);
  assert.match(source("lib/auth/context.ts"), /export const getAccessContext = cache\(resolveAccessContext\)/);
  assert.equal(existsSync("app/loading.tsx"), false);
  assert.match(source("components/application-icon.tsx"), /color="currentColor"/);
  assert.doesNotMatch(css.slice(css.lastIndexOf("Authenticated application typography")), /\.portal-/);
});
