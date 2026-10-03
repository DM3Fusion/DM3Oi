import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

const attributionMigration = source(
  "supabase/migrations/20261003100000_dm3oi_platform_analytics_durable_attribution.sql",
);
const resetMigration = source(
  "supabase/migrations/20261003101000_dm3oi_reset_preserves_platform_analytics.sql",
);
const deleteMigration = source(
  "supabase/migrations/20261003102000_dm3oi_permanent_delete_preserves_platform_analytics.sql",
);
const repository = source("lib/data/platform-analytics-repository.ts");
const ingestion = source("app/api/analytics/page-view/route.ts");
const dashboard = source("components/platform/platform-dashboard.tsx");
const resetUi = source("components/super-admin-organization-reset.tsx");
const deleteUi = source("components/super-admin-organization-delete.tsx");

test("page-view attribution snapshots are nullable, non-FK, backfilled, and immutable", () => {
  assert.match(attributionMigration, /add column analytics_user_key uuid/);
  assert.match(
    attributionMigration,
    /add column analytics_organization_key uuid/,
  );
  assert.match(attributionMigration, /analytics_user_key = user_id/);
  assert.match(
    attributionMigration,
    /analytics_organization_key = organization_id/,
  );
  assert.doesNotMatch(
    attributionMigration,
    /analytics_(?:user|organization)_key[^;]*references/i,
  );
  assert.match(
    attributionMigration,
    /analytics_page_views_attribution_keys_immutable/,
  );
  assert.match(
    attributionMigration,
    /new\.analytics_user_key is distinct from old\.analytics_user_key/,
  );
});

test("page-view ingestion snapshots the same resolved live identities", () => {
  assert.match(ingestion, /user_id: userId/);
  assert.match(ingestion, /organization_id: organizationId/);
  assert.match(ingestion, /analytics_user_key: userId/);
  assert.match(ingestion, /analytics_organization_key: organizationId/);
});

test("reset and permanent deletion preserve durable page views", () => {
  assert.doesNotMatch(
    resetMigration,
    /delete from public\.analytics_page_views/i,
  );
  assert.doesNotMatch(
    deleteMigration,
    /delete from public\.analytics_page_views/i,
  );
  assert.match(resetMigration, /delete from public\.analytics_live_sessions/i);
  assert.match(deleteMigration, /delete from public\.analytics_live_sessions/i);
  assert.match(resetMigration, /result - 'analyticsPageViews'/);
  assert.match(deleteMigration, /result - 'analyticsPageViews'/);
});

test("database aggregation uses exact KPI and durable attribution semantics", () => {
  assert.match(
    attributionMigration,
    /create function public\.get_platform_analytics\(/,
  );
  assert.match(
    attributionMigration,
    /'pageViews', \(select count\(\*\) from filtered\)/,
  );
  assert.match(
    attributionMigration,
    /'sessions', \(select count\(distinct session_id\) from filtered\)/,
  );
  assert.match(
    attributionMigration,
    /count\(distinct analytics_user_key\)/,
  );
  assert.match(
    attributionMigration,
    /count\(distinct analytics_organization_key\)/,
  );
  assert.match(
    attributionMigration,
    /actor is null or not public\.is_super_admin\(actor\)/,
  );
  assert.match(
    attributionMigration,
    /revoke all on function public\.get_platform_analytics[\s\S]*?from public, anon/,
  );
  assert.match(
    attributionMigration,
    /grant execute on function public\.get_platform_analytics[\s\S]*?to authenticated/,
  );
  assert.match(
    attributionMigration,
    /revoke delete on table public\.analytics_page_views from service_role/,
  );
});

test("repository uses the aggregation RPC instead of loading raw page-view rows", () => {
  assert.match(repository, /\.rpc\("get_platform_analytics"/);
  assert.match(repository, /const supabase = await createClient\(\)/);
  assert.doesNotMatch(repository, /\.from\("analytics_page_views"\)/);
  assert.doesNotMatch(repository, /analytics_live_sessions|createAdminClient|activeSessions/);
  assert.match(
    repository,
    /target_start: range\.start\?\.toISOString\(\) \?\? null/,
  );
});

test("All Time is a first-class unbounded range while existing ranges remain", () => {
  for (const range of ["today", "30d", "90d", "all", "custom"]) {
    assert.match(repository, new RegExp(`analyticsRange === "${range}"`));
  }
  assert.match(repository, /requestedRange === "all"[\s\S]*?start: null/);
  assert.match(dashboard, /key: "all", label: "All Time"/);
  assert.match(repository, /Custom reporting periods cannot exceed 366 days/);
  assert.match(repository, /: "7d"/);
});

test("period KPI labels and reset/delete copy describe durable history accurately", () => {
  assert.match(dashboard, /<span>Active Users<\/span>/);
  assert.match(dashboard, /<span>Active Organizations<\/span>/);
  assert.match(resetUi, /Historical Platform\s+Analytics are retained\./);
  assert.match(deleteUi, /Historical Platform Analytics are\s+retained\./);
  assert.doesNotMatch(resetUi, /analyticsPageViews/);
  assert.doesNotMatch(deleteUi, /analyticsPageViews/);
  assert.doesNotMatch(dashboard, /Live Activity|activeSessions/);
});

test("Auth and organization FK detachment cannot change historical distinct attribution", () => {
  const originalSchema = source(
    "supabase/migrations/20260923210000_dm3oi_platform_analytics.sql",
  );

  assert.match(
    originalSchema,
    /user_id uuid[\s\S]*?references auth\.users\(id\)[\s\S]*?on delete set null/,
  );
  assert.match(
    originalSchema,
    /organization_id uuid[\s\S]*?references public\.organizations\(id\)[\s\S]*?on delete set null/,
  );
  assert.match(repository, /users: aggregate\.users/);
  assert.match(repository, /organizations: aggregate\.organizations/);
});
