import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20261019160000_dm3oi_platform_analytics_details.sql",
);
const repository = source("lib/data/platform-analytics-repository.ts");
const details = source("components/platform/platform-analytics-details.tsx");
const actions = source(
  "components/platform/platform-analytics-details-actions.ts",
);
const dashboard = source("components/platform/platform-dashboard.tsx");
const topPages = source("components/admin-top-pages.tsx");
const styles = source("app/globals.css");

function functionBody(name: string): string {
  const start = migration.indexOf(`create function public.${name}(`);
  assert.notEqual(start, -1, `Missing function: ${name}`);

  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `Missing function terminator: ${name}`);

  return migration.slice(start, end);
}

const aggregate = functionBody("get_platform_analytics_details");
const history = functionBody("get_platform_page_view_history");

test("Analytics Details RPCs retain SUPER_ADMIN and trusted-baseline boundaries", () => {
  for (const body of [aggregate, history]) {
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
    assert.match(body, /auth\.uid\(\)/);
    assert.match(body, /public\.is_super_admin\(actor\)/);
    assert.match(body, /platform_analytics_trusted_baseline/);
    assert.match(body, /greatest\(/);
    assert.match(body, /created_at >= effective_start/);
    assert.match(body, /created_at < target_end_exclusive/);
  }
});

test("Device Type is derived from captured device_type without model substitution", () => {
  assert.match(aggregate, /select device_type/);
  assert.match(aggregate, /'DESKTOP', 'MOBILE', 'TABLET', 'OTHER'/);
  assert.match(aggregate, /else 'UNKNOWN'/);
  assert.doesNotMatch(aggregate, /device_model/);

  for (const label of ["Desktop", "Mobile", "Tablet", "Other", "Unknown"]) {
    assert.ok(details.includes(`"${label}"`));
  }
  assert.match(details, /analytics\.deviceTypeBreakdown/);
});

test("supported detail cards map existing OS, browser, location, and session data", () => {
  assert.match(details, /analytics\.operatingSystemBreakdown/);
  assert.match(details, /analytics\.browserBreakdown/);
  assert.match(details, /right\.pageViews - left\.pageViews/);
  assert.match(details, /point\.city/);
  assert.match(details, /point\.region/);
  assert.match(details, /point\.country/);
  assert.match(details, /analytics\.sessions\.toLocaleString/);
  assert.match(details, /Distinct 12-hour analytics session cookies/);
  assert.doesNotMatch(details, /analytics\.users\.toLocaleString/);
});

test("unsupported metrics remain unavailable while timezone requires captured data", () => {
  assert.match(details, /Browser platform is not persisted/);
  assert.match(details, /operating system is not substituted/);
  assert.match(details, /duration and heartbeat events are not captured/);
  assert.match(details, /analytics\.timezoneBreakdown/);
  assert.match(details, /timezoneBreakdownAvailable/);

  assert.doesNotMatch(aggregate, /timezone|duration|heartbeat/i);
});

test("the Location View All dialog reuses loaded points and preserves Location History", () => {
  assert.match(dashboard, /points=\{geographicDeviceActivity\.points\}/);
  assert.match(details, />\s*View All\s*</);
  assert.match(details, /aria-modal="true"/);
  assert.match(details, /role="dialog"/);
  assert.match(details, /Search city, region, or country/);
  assert.match(details, /filteredLocations/);
  assert.match(details, /GeographicLocationHistoryModal/);
  assert.match(details, /onClose=\{\(\) => setSelectedLocation\(null\)\}/);
  assert.match(details, /event\.key === "Escape"/);
  assert.match(details, /event\.target === event\.currentTarget/);
  assert.match(styles, /\.platform-all-locations-modal > header[\s\S]*position: sticky/);
});

test("page-view history is bounded, searchable, paginated, and privacy-safe", () => {
  assert.match(history, /target_limit is null/);
  assert.match(history, /target_limit not in \(10, 25, 50, 100\)/);
  assert.match(history, /target_offset > 100000/);
  assert.match(history, /effective_search/);
  assert.match(history, /limit target_limit/);
  assert.match(history, /offset target_offset/);
  assert.match(history, /created_at desc, id desc/);

  for (const field of [
    "normalized_path",
    "device_type",
    "browser",
    "operating_system",
    "city",
    "region_code",
    "country_code",
  ]) {
    assert.match(history, new RegExp(`\\b${field}\\b`));
  }

  assert.doesNotMatch(history, /\buser_id\b|\bsession_id\b|\borganization_id\b|\bemail\b/);
  assert.match(details, /HISTORY_PAGE_SIZES = \[10, 25, 50, 100\]/);
  assert.match(details, /setHistoryOffset\(0\)/);
  assert.match(details, /requestId === historyRequestId\.current/);
});

test("activity actions forward the selected reporting period", () => {
  assert.match(actions, /analyticsRange: request\.analyticsRange/);
  assert.match(actions, /analyticsFrom: request\.analyticsFrom/);
  assert.match(actions, /analyticsThrough: request\.analyticsThrough/);
  assert.match(actions, /request\.search/);
  assert.match(actions, /request\.limit/);
  assert.match(actions, /request\.offset/);

  assert.match(repository, /target_start: range\.start\?\.toISOString\(\) \?\? null/);
  assert.match(repository, /target_end_exclusive: range\.endExclusive\.toISOString\(\)/);
});

test("new RPC execution is limited to authenticated callers and migration is non-destructive", () => {
  for (const name of [
    "get_platform_analytics_details",
    "get_platform_page_view_history",
  ]) {
    const grant = migration.slice(
      migration.indexOf(`revoke all on function public.${name}`),
    );

    assert.match(grant, /from public, anon, authenticated;/);
    assert.match(grant, /to authenticated;/);
  }

  assert.doesNotMatch(
    migration,
    /\b(drop table|truncate|delete from|update public\.analytics_page_views)\b/i,
  );
});

test("Top Pages uses fixed desktop columns and a stacked mobile bar", () => {
  assert.match(topPages, /admin-top-pages-path/);
  assert.match(topPages, /admin-top-pages-track/);
  assert.match(topPages, /admin-top-pages-count/);
  assert.match(
    styles,
    /grid-template-columns: minmax\(180px, 0\.8fr\) minmax\(140px, 2fr\) auto/,
  );
  assert.match(styles, /\.admin-top-pages-track[\s\S]*grid-column: 1 \/ -1/);
});
