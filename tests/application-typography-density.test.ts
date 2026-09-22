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
    "Case Progress", "Task Status", "Needs Attention", "Recent Activity",
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
