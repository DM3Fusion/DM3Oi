import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const rootPage = source("app/page.tsx");
const dashboard = source("components/platform/platform-dashboard.tsx");
const organizationTable = source(
  "components/platform/organization-table.tsx",
);
const organizationsPage = source("app/admin/organizations/page.tsx");
const repository = source("lib/data/platform-repository.ts");
const styles = source("app/globals.css");

test("Platform Console loads the complete authorized organization collection", () => {
  assert.match(rootPage, /getPlatformAdministration\(\)/);
  assert.match(
    rootPage,
    /organizations=\{administration\.organizations\}/,
  );
  assert.doesNotMatch(
    rootPage,
    /administration\.organizations\.(?:filter|slice)|organizations=\{[^}]*items/,
  );
  assert.match(repository, /async function loadPlatformData\(\)[\s\S]*await requireSuperAdmin\(\)/);
});

test("Platform Console renders the shared organization directory table", () => {
  assert.match(dashboard, /Organization workspaces/);
  assert.doesNotMatch(dashboard, /View organizations/);
  assert.match(
    dashboard,
    /<OrganizationTable organizations=\{organizations\}/,
  );
  assert.match(
    organizationsPage,
    /<OrganizationTable organizations=\{items\}/,
  );
});

test("shared organization table preserves every directory column", () => {
  for (const heading of [
    "Organization",
    "Status",
    "License",
    "Created",
    "Users",
    "Owners",
    "Admins",
    "Open Cases",
  ]) {
    assert.match(organizationTable, new RegExp(`<th>${heading}</th>`));
  }
});

test("organization rows are fully navigable and retain a real accessible link", () => {
  assert.match(organizationTable, /<NavigableRow/);
  assert.match(
    organizationTable,
    /const href = `\/admin\/organizations\/\$\{organization\.id\}`/,
  );
  assert.match(
    organizationTable,
    /label=\{`Open organization \$\{organization\.displayName\}`\}/,
  );
  assert.match(organizationTable, /className="entity-row-link" href=\{href\}/);
});

test("organization table remains responsive and introduces no background refresh", () => {
  assert.match(organizationTable, /className="table-scroll"/);
  assert.match(
    styles,
    /\.platform-ready\{[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0[^}]*overflow:hidden/,
  );
  assert.match(
    styles,
    /\.platform-ready \.table-scroll\{[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0[^}]*overflow-x:auto/,
  );
  assert.doesNotMatch(
    [rootPage, dashboard, organizationTable].join("\n"),
    /setInterval|setTimeout|useEffect|\.channel\(|postgres_changes|router\.refresh/,
  );
});
