import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applicationIcons } from "../lib/application-icons.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("application icon catalog covers canonical destinations, actions, and statuses", () => {
  for (const name of [
    "dashboard", "cases", "service-desk", "communications", "customers",
    "tasks", "questions", "reports", "users", "settings", "account",
    "sign-out", "add", "search", "filter", "close", "back", "forward",
    "unread", "due", "completed", "blocked", "overdue", "organization",
  ] as const) assert.ok(applicationIcons[name], `${name} icon is registered`);
});

test("central renderer supplies consistent vector and accessibility defaults", () => {
  const component = source("components/application-icon.tsx");
  assert.match(component, /color="currentColor"/);
  assert.match(component, /strokeWidth = 1\.9/);
  assert.match(component, /strokeLinecap="round"/);
  assert.match(component, /strokeLinejoin="round"/);
  assert.match(component, /aria-hidden=\{label \? undefined : true\}/);
  assert.match(component, /role=\{label \? "img" : undefined\}/);
});

test("shared navigation and responsive shells consume semantic icon names", () => {
  const catalog = source("lib/application-navigation.ts");
  const shell = source("components/layout/app-shell.tsx");
  const mobile = source("components/layout/mobile-bottom-navigation.tsx");
  const account = source("app/account/page.tsx");
  assert.match(catalog, /icon: ApplicationIconName/);
  assert.match(shell, /<ApplicationIcon name=\{icon\} \/>/);
  assert.match(mobile, /<ApplicationIcon name=\{icon\} \/>/);
  assert.match(account, /<ApplicationIcon name=\{item\.icon\} \/>/);
});

test("responsive optical sizes preserve established touch targets", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.sidebar nav a svg\{width:17px;height:17px/);
  assert.match(css, /\.mobile-navigation-icon \.application-icon\{width:24px;height:24px/);
  assert.match(css, /\.mobile-bottom-navigation>a\{[^}]*min-height:58px/);
  assert.match(css, /\.mobile-account-navigation nav a\{[^}]*min-height:56px/);
});

test("navigation and action icons remain centralized when dashboard KPIs are text only", () => {
  const shell = source("components/layout/app-shell.tsx");
  const dashboard = source("components/dashboard/dashboard.tsx");
  assert.match(shell, /<ApplicationIcon name=\{icon\} \/>/);
  assert.match(dashboard, /<ApplicationIcon name="forward" \/>/);
  assert.match(dashboard, /<ApplicationIcon name="completed"/);
  assert.doesNotMatch(dashboard, /operations-kpi-icon/);
});

test("UI icon catalog adds no raster or icon-font implementation", () => {
  const catalog = source("lib/application-icons.ts");
  const component = source("components/application-icon.tsx");
  assert.doesNotMatch(catalog + component, /\.png|\.jpe?g|icon-font|@font-face/i);
  assert.match(catalog, /from "lucide-react"/);
});
