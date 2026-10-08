import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const css = source("app/globals.css");
const geography = source("components/admin-geography.tsx");
const topPages = source("components/admin-top-pages.tsx");
const ingestion = source("app/api/analytics/page-view/route.ts");
const analytics = source("lib/analytics.ts");
const repository = source("lib/data/platform-analytics-repository.ts");
const schemaMigration = source(
  "supabase/migrations/20260923210000_dm3oi_platform_analytics.sql",
);
const aggregateMigration = source(
  "supabase/migrations/20261003100000_dm3oi_platform_analytics_durable_attribution.sql",
);
const geographySql = aggregateMigration.slice(
  aggregateMigration.indexOf("'geography'"),
  aggregateMigration.indexOf("into result;"),
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

test("geography is captured only from Vercel network geolocation headers", () => {
  assert.match(
    ingestion,
    /request\.headers\.get\("x-vercel-ip-country"\)/,
  );
  assert.match(
    ingestion,
    /request\.headers\.get\("x-vercel-ip-country-region"\)/,
  );
  assert.match(
    ingestion,
    /decodeAnalyticsHeader\(\s*request\.headers\.get\("x-vercel-ip-city"\)/,
  );
  assert.match(ingestion, /target_country_code: countryCode/);
  assert.match(ingestion, /target_region_code: regionCode/);
  assert.match(ingestion, /target_city: city/);
  assert.match(
    analytics,
    /export function decodeAnalyticsHeader[\s\S]*decodeURIComponent\(value\)/,
  );
  assert.match(schemaMigration, /country_code text/);
  assert.match(schemaMigration, /region_code text/);
  assert.match(schemaMigration, /city text/);
  assert.doesNotMatch(schemaMigration, /latitude|longitude|postal_code/);
});

test("Geography counts page views grouped by the stored city region and country tuple", () => {
  assert.match(
    geographySql,
    /concat_ws\(\s*', ',\s*nullif\(trim\(city\), ''\),\s*nullif\(trim\(region_code\), ''\),\s*nullif\(trim\(country_code\), ''\)/,
  );
  assert.match(geographySql, /count\(\*\) as page_views/);
  assert.match(geographySql, /group by 1/);
  assert.match(
    geographySql,
    /jsonb_build_object\('label', label, 'pageViews', page_views\)/,
  );
  assert.doesNotMatch(
    geographySql,
    /count\(distinct (?:session_id|analytics_user_key)\)/,
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
  assert.doesNotMatch(
    geographySql,
    /case[\s\S]*region_code[\s\S]*(?:city|Brandywine)/i,
  );
});

test("Geography explains its approximate page-view metric without exposing PII", () => {
  assert.match(
    geography,
    /Page views grouped by approximate network\s+location\. Different physical locations can\s+resolve to the same city\./,
  );
  assert.deepEqual(
    geography.match(/type GeographyRow = \{[\s\S]*?\};/)?.[0]
      .match(/\b(?:label|pageViews):/g),
    ["label:", "pageViews:"],
  );
  assert.doesNotMatch(
    geography,
    /customer|email|phone|address|userId|sessionId|organizationId|ipAddress/i,
  );
  assert.doesNotMatch(
    geographySql,
    /jsonb_build_object\([^)]*(?:user|session|organization|email|ip)/i,
  );
});
