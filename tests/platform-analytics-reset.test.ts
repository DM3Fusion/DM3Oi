import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const resetMigration = source(
  "supabase/migrations/20261008110000_dm3oi_reset_platform_analytics.sql",
);
const originalAnalyticsMigration = source(
  "supabase/migrations/20260923210000_dm3oi_platform_analytics.sql",
);
const overviewCounterMigration = source(
  "supabase/migrations/20261004100000_dm3oi_overview_download_counter.sql",
);
const guardedIngestionMigration = source(
  "supabase/migrations/20261004150000_dm3oi_analytics_ingestion_guard.sql",
);
const trustedAnalyticsMigration = source(
  "supabase/migrations/20261007140000_dm3oi_authenticated_access_analytics.sql",
);
const networkGeographyMigration = source(
  "supabase/migrations/20261008100000_dm3oi_platform_analytics_network_geography.sql",
);
const diagnosticRoute = source(
  "app/api/admin/diagnostics/vercel-geo/route.ts",
);

function truncatedTables(sql: string) {
  const statement = sql.match(/truncate table([\s\S]*?);/i)?.[1] ?? "";

  return [...statement.matchAll(/public\.([a-z0-9_]+)/gi)]
    .map((match) => match[1])
    .sort();
}

function guardedIngestionArgumentCount(sql: string) {
  const signature = sql.match(
    /(?:create|create or replace) function public\.record_analytics_page_view_guarded\(([\s\S]*?)\)\s*returns boolean/i,
  )?.[1] ?? "";

  return [...signature.matchAll(/^\s*target_[a-z0-9_]+\s+/gim)].length;
}

test("the one-time reset clears only the complete Platform Analytics telemetry set", () => {
  assert.deepEqual(truncatedTables(resetMigration), [
    "analytics_event_counters",
    "analytics_live_sessions",
    "analytics_page_views",
  ]);
  assert.match(originalAnalyticsMigration, /create table public\.analytics_page_views/);
  assert.match(originalAnalyticsMigration, /create table public\.analytics_live_sessions/);
  assert.match(overviewCounterMigration, /create table public\.analytics_event_counters/);

  assert.doesNotMatch(resetMigration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(resetMigration, /restart identity/i);
  assert.doesNotMatch(
    resetMigration,
    /public\.(?:organizations|profiles|organization_members|organization_customers|customers|cases|case_tasks|service_requests|customer_portal_users|audit_events|email_templates)\b/i,
  );
});

test("the reset performs no historical geography fabrication or schema rewrite", () => {
  assert.doesNotMatch(resetMigration, /update\s+public\.analytics_page_views/i);
  assert.doesNotMatch(resetMigration, /insert\s+into\s+public\.analytics_page_views/i);
  assert.doesNotMatch(
    resetMigration,
    /alter\s+table\s+public\.analytics_page_views|drop\s+(?:table|column)/i,
  );

  for (const definition of [
    /add column postal_code text/,
    /add column network_latitude numeric\(4, 2\)/,
    /add column network_longitude numeric\(5, 2\)/,
  ]) {
    assert.match(networkGeographyMigration, definition);
  }
});

test("the trusted baseline is reset once with database time and is immutable again before commit", () => {
  const dropTriggerAt = resetMigration.indexOf(
    "drop trigger platform_analytics_trusted_baseline_immutable",
  );
  const resetTimestampAt = resetMigration.indexOf(
    "trusted_data_started_at = marker.reset_started_at",
  );
  const createTriggerAt = resetMigration.indexOf(
    "create trigger platform_analytics_trusted_baseline_immutable",
  );
  const commitAt = resetMigration.lastIndexOf("commit;");

  assert.match(
    resetMigration,
    /lock table public\.platform_analytics_trusted_baseline\s+in access exclusive mode/,
  );
  assert.match(
    resetMigration,
    /values \(pg_catalog\.clock_timestamp\(\)\)/,
  );
  assert.match(
    resetMigration,
    /pg_catalog\.pg_advisory_xact_lock\(143690001\)/,
  );
  assert.match(
    resetMigration,
    /set trusted_data_started_at = marker\.reset_started_at/,
  );
  assert.ok(dropTriggerAt >= 0);
  assert.ok(resetTimestampAt > dropTriggerAt);
  assert.ok(createTriggerAt > resetTimestampAt);
  assert.ok(commitAt > createTriggerAt);
  assert.match(
    resetMigration,
    /if not found then[\s\S]*trusted baseline is unavailable[\s\S]*errcode = '55000'/,
  );
  assert.match(
    resetMigration,
    /before update or delete[\s\S]*execute function public\.guard_platform_analytics_trusted_baseline\(\)/,
  );
  assert.doesNotMatch(
    resetMigration,
    /drop function public\.guard_platform_analytics_trusted_baseline|disable trigger/i,
  );
});

test("trusted aggregates retain baseline clamping and SUPER_ADMIN authorization", () => {
  assert.match(
    trustedAnalyticsMigration,
    /when target_start is null then trusted_start[\s\S]*when target_start < trusted_start then trusted_start/,
  );
  assert.match(
    trustedAnalyticsMigration,
    /actor is null or not public\.is_super_admin\(actor\)/,
  );
  assert.match(
    networkGeographyMigration,
    /actor is null or not public\.is_super_admin\(actor\)/,
  );
  assert.doesNotMatch(
    resetMigration,
    /(?:create|replace|alter|drop)\s+function|\bgrant\b|\brevoke\b|disable row level security/i,
  );
});

test("all ingestion overloads and coarse-geography ingestion survive unchanged", () => {
  assert.deepEqual(
    [
      guardedIngestionArgumentCount(guardedIngestionMigration),
      guardedIngestionArgumentCount(trustedAnalyticsMigration),
      guardedIngestionArgumentCount(networkGeographyMigration),
    ],
    [15, 17, 20],
  );
  for (const argument of [
    "target_postal_code text",
    "target_network_latitude numeric",
    "target_network_longitude numeric",
  ]) {
    assert.match(networkGeographyMigration, new RegExp(argument));
  }
  assert.doesNotMatch(
    resetMigration,
    /record_analytics_page_view_guarded|get_platform_analytics\s*\(/,
  );
});

test("the temporary allowlisted Vercel geography diagnostic remains", () => {
  assert.match(diagnosticRoute, /requireSuperAdmin\(\)/);
  assert.match(diagnosticRoute, /x-vercel-ip-postal-code/);
  assert.match(diagnosticRoute, /x-vercel-ip-latitude/);
  assert.match(diagnosticRoute, /x-vercel-ip-longitude/);
});
