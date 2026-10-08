import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { coarseAnalyticsNetworkCoordinate } from "../lib/analytics.ts";

const source = (path: string) => readFileSync(path, "utf8");

const css = source("app/globals.css");
const geography = source("components/admin-geography.tsx");
const topPages = source("components/admin-top-pages.tsx");
const ingestion = source("app/api/analytics/page-view/route.ts");
const analytics = source("lib/analytics.ts");
const repository = source("lib/data/platform-analytics-repository.ts");
const generatedDatabase = source("types/database.generated.ts");
const databaseOverlay = source("types/database.ts");
const schemaMigration = source(
  "supabase/migrations/20260923210000_dm3oi_platform_analytics.sql",
);
const trustedMigration = source(
  "supabase/migrations/20261007140000_dm3oi_authenticated_access_analytics.sql",
);
const networkGeographyMigration = source(
  "supabase/migrations/20261008100000_dm3oi_platform_analytics_network_geography.sql",
);
const visitGeographyMigration = source(
  "supabase/migrations/20261008130000_dm3oi_platform_analytics_geography_visits.sql",
);
const geographySql = visitGeographyMigration.slice(
  visitGeographyMigration.indexOf(
    "create or replace function public.get_platform_analytics_before_trusted_baseline",
  ),
);
const authenticatedGeographySql = networkGeographyMigration.slice(
  networkGeographyMigration.indexOf(
    "create or replace function public.get_platform_authenticated_access_analytics",
  ),
);

test("Top Pages and Geography share a card-contained responsive control structure", () => {
  for (const component of [topPages, geography]) {
    assert.match(component, /<article className="admin-analytics-panel/);
    assert.match(component, /admin-analytics-panel-heading admin-top-pages-heading/);
    assert.match(component, /className="admin-top-pages-controls"/);
    assert.match(component, /className="admin-top-pages-search"/);
    assert.match(component, /className="admin-top-pages-toggle"/);
  }

  assert.match(css, /\.admin-analytics-panel\{min-width:0/);
  assert.match(css, /\.admin-top-pages-heading>div\{min-width:0\}/);
  assert.match(
    css,
    /\.admin-top-pages-controls\{min-width:0;max-width:100%;flex:0 1 auto;flex-wrap:wrap;justify-content:flex-end\}/,
  );
  assert.match(
    css,
    /\.admin-top-pages-search\{min-width:0;flex:1 1 10rem\}/,
  );
  assert.match(
    css,
    /\.admin-top-pages-search input\{width:100%;min-width:0\}/,
  );
  assert.match(
    css,
    /\.admin-top-pages-toggle\{flex:0 0 auto;white-space:nowrap\}/,
  );
});

test("analytics controls stack without losing the shrinkable input or count alignment", () => {
  assert.match(
    css,
    /@media\(max-width:700px\)[^\n]*\.admin-top-pages-heading\{display:grid\}[^\n]*\.admin-top-pages-controls\{width:100%\}/,
  );
  assert.match(
    css,
    /@media\(max-width:520px\)[^\n]*\.admin-top-pages-controls\{display:grid;grid-template-columns:minmax\(0,1fr\) auto\}/,
  );
  assert.match(
    css,
    /\.admin-analytics-breakdown code,\.admin-analytics-breakdown span\{min-width:0;overflow-wrap:anywhere/,
  );
  assert.match(css, /\.admin-analytics-breakdown strong\{flex:none/);
});

test("geography captures the approved Vercel network metadata without raw IP persistence", () => {
  for (const header of [
    "x-vercel-ip-country",
    "x-vercel-ip-country-region",
    "x-vercel-ip-city",
    "x-vercel-ip-postal-code",
    "x-vercel-ip-latitude",
    "x-vercel-ip-longitude",
  ]) {
    assert.match(ingestion, new RegExp(`request\\.headers\\.get\\("${header}"\\)`));
  }
  for (const argument of [
    "target_country_code: countryCode",
    "target_region_code: regionCode",
    "target_city: city",
    "target_postal_code: postalCode",
    "target_network_latitude: networkLatitude",
    "target_network_longitude: networkLongitude",
  ]) {
    assert.match(ingestion, new RegExp(argument));
  }
  assert.match(
    analytics,
    /export function decodeAnalyticsHeader[\s\S]*decodeURIComponent\(value\)/,
  );
  assert.match(schemaMigration, /country_code text/);
  assert.match(schemaMigration, /region_code text/);
  assert.match(schemaMigration, /city text/);
  assert.doesNotMatch(schemaMigration, /latitude|longitude|postal_code/);
  assert.match(networkGeographyMigration, /add column postal_code text/);
  assert.match(networkGeographyMigration, /add column network_latitude numeric\(4, 2\)/);
  assert.match(networkGeographyMigration, /add column network_longitude numeric\(5, 2\)/);
  assert.doesNotMatch(
    networkGeographyMigration,
    /add column (?:raw_)?ip|add column ip_address/i,
  );
  assert.doesNotMatch(
    ingestion.slice(ingestion.indexOf("admin.rpc")),
    /x-forwarded-for|x-real-ip|target_(?:raw_)?ip/,
  );
});

test("valid coordinates are rounded to two decimals and invalid coordinates fail closed", () => {
  assert.equal(
    coarseAnalyticsNetworkCoordinate("38.69678", -90, 90),
    38.7,
  );
  assert.equal(
    coarseAnalyticsNetworkCoordinate("-76.84775", -180, 180),
    -76.85,
  );
  assert.equal(coarseAnalyticsNetworkCoordinate("90.01", -90, 90), null);
  assert.equal(coarseAnalyticsNetworkCoordinate("-180.01", -180, 180), null);
  assert.equal(coarseAnalyticsNetworkCoordinate("not-a-coordinate", -90, 90), null);
  assert.equal(coarseAnalyticsNetworkCoordinate(null, -90, 90), null);
  assert.match(analytics, /Number\(coordinate\.toFixed\(2\)\)/);
});

test("Geography groups identical full tuples and reports unique visits and pages", () => {
  assert.match(
    geographySql,
    /group by\s+nullif\(trim\(city\), ''\),\s+nullif\(trim\(region_code\), ''\),\s+nullif\(trim\(country_code\), ''\),\s+nullif\(trim\(postal_code\), ''\),\s+network_latitude,\s+network_longitude/,
  );
  assert.match(
    geographySql,
    /count\(distinct session_id\) as visits/,
  );
  assert.match(
    geographySql,
    /count\(distinct normalized_path\) as unique_pages/,
  );
  assert.match(
    geographySql,
    /'postalCode', postal_code,[\s\S]*'latitude', network_latitude,[\s\S]*'longitude', network_longitude,[\s\S]*'visits', visits,[\s\S]*'uniquePages', unique_pages/,
  );
  const geographyAggregate = geographySql.slice(
    geographySql.indexOf("'geography', ("),
  );

  assert.doesNotMatch(
    geographyAggregate,
    /count\(\*\) as page_views/,
  );
  assert.match(
    geographySql,
    /concat_ws\(' ', region_code, postal_code\)/,
  );
  assert.match(geographySql, /else 'Unknown'/);
  assert.doesNotMatch(
    visitGeographyMigration,
    /(?:update|delete\s+from|truncate)\s+public\.analytics_page_views/i,
  );
});

test("there is no Maryland or Brandywine fallback in ingestion normalization or grouping", () => {
  const geographyPath = [
    ingestion,
    analytics,
    geographySql,
    repository,
    geography,
  ].join("\n");

  assert.doesNotMatch(geographyPath, /Brandywine|Maryland/i);
  assert.match(geographySql, /coalesce\([\s\S]*'Unknown'/);
});

test("Geography explains unique visit and page semantics without exposing PII", () => {
  assert.match(
    geography,
    /Unique visits grouped by approximate network\s+location, with the number of distinct pages viewed\s+from each location\./,
  );
  assert.deepEqual(
    geography.match(/type GeographyRow = \{[\s\S]*?\};/)?.[0]
      .match(/\b(?:label|postalCode|latitude|longitude|visits|uniquePages):/g),
    [
      "label:",
      "postalCode:",
      "latitude:",
      "longitude:",
      "visits:",
      "uniquePages:",
    ],
  );
  assert.match(
    geography,
    /row\.visits === 1 \? "visit" : "visits"/,
  );
  assert.match(
    geography,
    /row\.uniquePages === 1 \? "unique page" : "unique pages"/,
  );
  assert.match(geography, /Approx\. network: \{coordinateLabel\(row\)\}/);
  assert.match(geography, /row\.latitude\.toFixed\(2\)/);
  assert.match(geography, /row\.longitude\.toFixed\(2\)/);
  assert.doesNotMatch(
    geography,
    /customer|email|phone|address|userId|sessionId|organizationId|ipAddress|GPS|exact location|physical location/i,
  );
  assert.doesNotMatch(
    geographySql,
    /jsonb_build_object\([^)]*(?:user|session|organization|email|ip)/i,
  );
});

test("authenticated access uses the same coarse network tuple without changing identity rollups", () => {
  assert.match(
    authenticatedGeographySql,
    /geography_grouped as \([\s\S]*nullif\(trim\(postal_code\), ''\)[\s\S]*network_latitude,[\s\S]*network_longitude/,
  );
  assert.match(
    authenticatedGeographySql,
    /group by\s+analytics_user_key,\s+analytics_organization_key,\s+access_type,\s+access_role,\s+nullif\(trim\(city\), ''\),\s+nullif\(trim\(region_code\), ''\),\s+nullif\(trim\(country_code\), ''\),\s+nullif\(trim\(postal_code\), ''\),\s+network_latitude,\s+network_longitude/,
  );
  assert.match(
    authenticatedGeographySql,
    /' · Approx\. network: '[\s\S]*network_latitude::text[\s\S]*network_longitude::text/,
  );
  assert.match(
    authenticatedGeographySql,
    /rollups as \([\s\S]*count\(\*\) as page_views,[\s\S]*count\(distinct session_id\) as sessions/,
  );
  assert.match(
    authenticatedGeographySql,
    /actor is null or not public\.is_super_admin\(actor\)/,
  );
});

test("network geography preserves the trusted baseline and aggregate-only access", () => {
  assert.match(
    trustedMigration,
    /result := public\.get_platform_analytics_before_trusted_baseline\(\s*effective_start,/,
  );
  assert.match(
    networkGeographyMigration,
    /create or replace function public\.get_platform_analytics_before_trusted_baseline\(/,
  );
  assert.doesNotMatch(
    networkGeographyMigration,
    /create or replace function public\.get_platform_analytics\(/,
  );
  assert.match(
    authenticatedGeographySql,
    /when target_start is null then trusted_start[\s\S]*when target_start < trusted_start then trusted_start/,
  );
  assert.match(repository, /requireSuperAdmin\(\)/);
  assert.doesNotMatch(
    repository,
    /\.from\(\s*"analytics_page_views"\s*\)/,
  );
});

test("coarse network ingestion is additive and keeps deployed overloads callable", () => {
  const ingestionFunction = networkGeographyMigration.slice(
    networkGeographyMigration.indexOf(
      "create function public.record_analytics_page_view_guarded",
    ),
    networkGeographyMigration.indexOf(
      "-- Preserve the established KPI calculations",
    ),
  );

  for (const argument of [
    "target_postal_code text",
    "target_network_latitude numeric",
    "target_network_longitude numeric",
  ]) {
    assert.match(ingestionFunction, new RegExp(argument));
  }
  assert.match(
    ingestionFunction,
    /revoke all on function public\.record_analytics_page_view_guarded\([\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    ingestionFunction,
    /grant execute on function public\.record_analytics_page_view_guarded\([\s\S]*to service_role/,
  );
  assert.doesNotMatch(
    networkGeographyMigration,
    /drop function public\.record_analytics_page_view_guarded/,
  );
});

test("regenerated database types own the network geography schema and overload", () => {
  const analyticsTable = generatedDatabase.slice(
    generatedDatabase.indexOf("analytics_page_views:"),
    generatedDatabase.indexOf("authenticated_session_activity:"),
  );
  const ingestionTypes = generatedDatabase.slice(
    generatedDatabase.indexOf("record_analytics_page_view_guarded:"),
    generatedDatabase.indexOf("record_goal_progress:"),
  );

  for (const field of [
    "postal_code: string | null",
    "network_latitude: number | null",
    "network_longitude: number | null",
  ]) {
    assert.match(analyticsTable, new RegExp(field.replace("|", "\\|")));
  }
  for (const argument of [
    "target_postal_code: string",
    "target_network_latitude: number",
    "target_network_longitude: number",
  ]) {
    assert.match(ingestionTypes, new RegExp(argument));
  }
  assert.doesNotMatch(
    databaseOverlay,
    /CoarseNetworkAnalyticsIngestionFunction|AnalyticsPageViewIngestionFunction|pending remote migration/,
  );
  assert.match(
    databaseOverlay,
    /record_analytics_page_view_guarded: WithNullableFunctionArgs<[\s\S]*"target_postal_code"[\s\S]*"target_network_latitude"[\s\S]*"target_network_longitude"/,
  );
});
