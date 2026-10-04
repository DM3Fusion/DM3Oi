import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(path, "utf8");

test("browser analytics never supplies analytics session ownership", () => {
  const tracker = source(
    "components/analytics-tracker.tsx",
  );

  assert.doesNotMatch(
    tracker,
    /analyticsSessionId/,
  );

  assert.doesNotMatch(
    tracker,
    /sessionId\s*:/,
  );

  assert.match(
    tracker,
    /fetch\("\/api\/analytics\/page-view"/,
  );

  assert.match(
    tracker,
    /fetch\("\/api\/analytics\/interaction"/,
  );
});

test("analytics session identity is HttpOnly server-owned state", () => {
  const session = source(
    "lib/analytics-session.ts",
  );

  assert.match(
    session,
    /dm3oi_analytics_session/,
  );

  assert.match(
    session,
    /httpOnly:\s*true/,
  );

  assert.match(
    session,
    /sameSite:\s*"lax"/,
  );

  assert.match(
    session,
    /secure:\s*process\.env\.NODE_ENV === "production"/,
  );

  assert.match(
    session,
    /crypto\.randomUUID\(\)/,
  );

  assert.doesNotMatch(
    session,
    /sessionStorage|localStorage/,
  );
});

test("page-view ingestion derives session ownership server-side", () => {
  const route = source(
    "app/api/analytics/page-view/route.ts",
  );

  assert.match(
    route,
    /getOrCreateAnalyticsSessionId/,
  );

  assert.match(
    route,
    /const \{ sessionId \} = await getOrCreateAnalyticsSessionId\(\)/,
  );

  assert.doesNotMatch(
    route,
    /body\.sessionId/,
  );

  assert.match(
    route,
    /session_id:\s*sessionId/,
  );
});

test("interaction evidence is scoped to the server-owned analytics session", () => {
  const route = source(
    "app/api/analytics/interaction/route.ts",
  );

  assert.match(
    route,
    /getAnalyticsSessionId/,
  );

  assert.match(
    route,
    /const sessionId = await getAnalyticsSessionId\(\)/,
  );

  assert.match(
    route,
    /if \(!sessionId\)/,
  );

  assert.match(
    route,
    /\.eq\("session_id", sessionId\)/,
  );

  assert.doesNotMatch(
    route,
    /body\.sessionId/,
  );
});

test("legacy privileged presence ingestion remains retired", () => {
  const proxy = source("proxy.ts");

  assert.doesNotMatch(
    proxy,
    /\/api\/analytics\/presence/,
  );

  assert.throws(
    () => source("app/api/analytics/presence/route.ts"),
  );
});

test("public page-view writes are admitted only through the bounded service-role RPC", () => {
  const route = source(
    "app/api/analytics/page-view/route.ts",
  );
  const migration = source(
    "supabase/migrations/20261004150000_dm3oi_analytics_ingestion_guard.sql",
  );

  assert.match(
    route,
    /record_analytics_page_view_guarded/,
  );

  assert.doesNotMatch(
    route,
    /\.from\("analytics_page_views"\)\s*\.insert/,
  );

  assert.match(
    migration,
    /security definer/,
  );

  assert.match(
    migration,
    /pg_advisory_xact_lock/,
  );

  assert.match(
    migration,
    /created_at >= pg_catalog\.clock_timestamp\(\) - interval '1 minute'/,
  );

  assert.match(
    migration,
    /recent_global_count >= 240/,
  );

  assert.match(
    migration,
    /session_id = target_session_id/,
  );

  assert.match(
    migration,
    /interval '5 minutes'/,
  );

  assert.match(
    migration,
    /recent_session_count >= 30/,
  );

  assert.match(
    migration,
    /grant execute[\s\S]*to service_role/,
  );

  assert.match(
    migration,
    /revoke all[\s\S]*from public,[\s\S]*anon,[\s\S]*authenticated/,
  );
});

test("guarded ingestion snapshots the same server-resolved durable attribution", () => {
  const route = source(
    "app/api/analytics/page-view/route.ts",
  );
  const migration = source(
    "supabase/migrations/20261004150000_dm3oi_analytics_ingestion_guard.sql",
  );

  assert.match(
    route,
    /target_user_id: userId/,
  );

  assert.match(
    route,
    /target_organization_id: organizationId/,
  );

  assert.match(
    migration,
    /analytics_user_key,[\s\S]*analytics_organization_key/,
  );

  assert.match(
    migration,
    /target_user_id,[\s\S]*target_organization_id,[\s\S]*target_user_id,[\s\S]*target_organization_id/,
  );
});
