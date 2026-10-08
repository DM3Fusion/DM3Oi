import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const page = source("app/page.tsx");
const dashboard = source("components/platform/platform-dashboard.tsx");
const repository = source("lib/data/platform-repository.ts");
const styles = source("app/globals.css");
const loader =
  repository.match(
    /async function loadPlatformData\(\)[\s\S]*?\n}\nexport async function getPlatformAdministration/,
  )?.[0] ?? "";
const administration =
  repository.match(
    /export async function getPlatformAdministration\(\)[\s\S]*?\n}\nexport async function getPlatformSummary/,
  )?.[0] ?? "";

test("Platform Console uses the exact Platform Administrators label", () => {
  assert.match(dashboard, /label: "Platform Administrators"/);
  assert.doesNotMatch(dashboard, /Platform Operationsistrators/);
});

test("Total Customers occupies the compact supporting KPI row", () => {
  assert.match(dashboard, /className="platform-supporting-metrics"/);
  assert.match(dashboard, /<span>Total Customers<\/span>/);
  assert.match(
    dashboard,
    /customerSummary\.totalCustomers\.toLocaleString\("en-US"\)/,
  );
  assert.match(
    styles,
    /\.platform-supporting-metrics\{[^}]*grid-template-columns:repeat\(2,minmax\(0,292px\)\)/,
  );
  assert.match(
    styles,
    /@media\(max-width:520px\)\{\.platform-supporting-metrics\{grid-template-columns:1fr\}/,
  );
});

test("customer totals reuse the aggregate-only organization query", () => {
  assert.match(loader, /await requireSuperAdmin\(\)/);
  assert.ok(
    loader.indexOf("await requireSuperAdmin()") <
      loader.indexOf("await createClient()"),
  );
  assert.match(
    loader,
    /\.from\("organizations"\)[\s\S]*\.select\("\*,organization_customers\(count\)"\)[\s\S]*\.order\("name"\)/,
  );
  const organizationQuery =
    loader.match(
      /supabase[\s\S]*?\.from\("organizations"\)[\s\S]*?\.order\("name"\)/,
    )?.[0] ?? "";
  assert.doesNotMatch(
    organizationQuery,
    /organization_customers\((?:email|phone|address|postal|notes|name)/,
  );
  assert.doesNotMatch(organizationQuery, /\.eq\("status"/);
});

test("aggregate total is the sum of nonzero organization counts", () => {
  assert.match(
    loader,
    /customerCount: customerCounts\[0\]\?\.count \?\? 0/,
  );
  assert.match(
    administration,
    /\.filter\(\(organization\) => organization\.customers > 0\)/,
  );
  assert.match(
    administration,
    /totalCustomers: byOrganization\.reduce\([\s\S]*total \+ organization\.customerCount[\s\S]*0,/,
  );
});

test("breakdown exposes only organization identity and aggregate count", () => {
  const breakdown =
    dashboard.match(
      /customerSummary\.byOrganization\.length[\s\S]*?\) : null}/,
    )?.[0] ?? "";

  assert.match(breakdown, /Customers by Organization/);
  assert.match(breakdown, /organization\.organizationName/);
  assert.match(breakdown, /organization\.customerCount/);
  assert.doesNotMatch(
    breakdown,
    /customer\.(?:name|email|phone|street|city|state|postal|address|notes)/,
  );
});

test("customer aggregate stays inside the existing parallel platform load", () => {
  const platformBranch =
    page.match(/if \(experience === "PLATFORM"\)[\s\S]*?if \(experience === "PORTAL"\)/)?.[0] ?? "";

  assert.match(platformBranch, /Promise\.all\(\[/);
  assert.match(platformBranch, /getPlatformAdministration\(\)/);
  assert.doesNotMatch(platformBranch, /getPlatformCustomerSummary\(\)/);
  assert.match(
    platformBranch,
    /customerSummary=\{administration\.customerSummary\}/,
  );
});
