import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatGeographyLastAccessed } from "../lib/platform-analytics-geography.ts";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20261015120000_dm3oi_platform_analytics_geography_last_accessed.sql",
);
const component = source("components/admin-geography.tsx");
const repository = source("lib/data/platform-analytics-repository.ts");
const css = source("app/globals.css");

test("Geography derives last accessed from the latest page view in the filtered aggregate", () => {
  assert.match(
    migration,
    /from public\.analytics_page_views[\s\S]*where \(target_start is null or created_at >= target_start\)[\s\S]*and \(target_end_exclusive is null or created_at < target_end_exclusive\)/,
  );
  assert.match(migration, /max\(created_at\) as last_accessed_at/);
  assert.match(
    migration,
    /'lastAccessedAt', last_accessed_at/,
  );
});

test("Geography preserves tuple, visit, page, and sorting semantics", () => {
  assert.match(
    migration,
    /group by\s+nullif\(trim\(city\), ''\),\s+nullif\(trim\(region_code\), ''\),\s+nullif\(trim\(country_code\), ''\),\s+nullif\(trim\(postal_code\), ''\),\s+network_latitude,\s+network_longitude/,
  );
  assert.match(migration, /count\(distinct session_id\) as visits/);
  assert.match(
    migration,
    /count\(distinct normalized_path\) as unique_pages/,
  );
  assert.match(
    migration,
    /order by\s+visits desc,\s+label,\s+postal_code nulls last,\s+network_latitude nulls last,\s+network_longitude nulls last/,
  );
});

test("Geography aggregate retains authorization and private helper permissions", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(
    migration,
    /actor is null or not public\.is_super_admin\(actor\)/,
  );
  assert.match(
    migration,
    /revoke all on function public\.get_platform_analytics_before_trusted_baseline\([\s\S]*from public, anon, authenticated/,
  );
});

test("Last accessed uses the required America/New_York display format", () => {
  assert.equal(
    formatGeographyLastAccessed("2026-10-13T19:01:00.000Z"),
    "10/13/2026 3:01 PM",
  );
  assert.equal(
    formatGeographyLastAccessed("2026-01-13T00:01:00.000Z"),
    "1/12/2026 7:01 PM",
  );
  assert.equal(formatGeographyLastAccessed(null), null);
  assert.equal(formatGeographyLastAccessed("invalid"), null);
});

test("Geography renders timestamp on the existing wrapping secondary line", () => {
  assert.match(repository, /lastAccessedAt: string \| null/);
  assert.match(component, /Approx\. network: \$\{coordinates\}/);
  assert.match(component, /Last accessed: \$\{lastAccessed\}/);
  assert.match(component, /\.join\(" · "\)/);
  assert.match(
    component,
    /className="admin-geography-coordinate"[\s\S]*\{secondaryLabel\}/,
  );
  assert.match(
    css,
    /\.admin-geography-coordinate\{[\s\S]*min-width:0;[\s\S]*overflow-wrap:anywhere;/,
  );
});

test("Geography keeps search and Top 6 behavior without per-location reads", () => {
  assert.match(component, /filteredRows\.slice\(0, 6\)/);
  assert.match(component, /placeholder="Filter geography\.\.\."/);
  assert.match(component, /"View All"/);
  assert.equal(
    (migration.match(/from public\.analytics_page_views/g) ?? []).length,
    1,
  );
});
