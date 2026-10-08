import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20261007140000_dm3oi_authenticated_access_analytics.sql",
);
const ingestion = source(
  "app/api/analytics/page-view/route.ts",
);
const repository = source(
  "lib/data/platform-analytics-repository.ts",
);
const dashboard = source(
  "components/platform/platform-dashboard.tsx",
);
const component = source(
  "components/platform/authenticated-access-analytics.tsx",
);
const originalSchema = source(
  "supabase/migrations/20260923210000_dm3oi_platform_analytics.sql",
);
const guardedIngestionMigration = source(
  "supabase/migrations/20261004150000_dm3oi_analytics_ingestion_guard.sql",
);

test("existing page views already retain first-party identity, route, session, time, and approximate geography", () => {
  for (const field of [
    "session_id uuid",
    "user_id uuid",
    "organization_id uuid",
    "path text",
    "normalized_path text",
    "country_code text",
    "region_code text",
    "city text",
    "created_at timestamptz",
  ]) {
    assert.match(originalSchema, new RegExp(field));
  }

  assert.doesNotMatch(
    originalSchema,
    /\b(?:ip|ip_address|raw_ip)\b/i,
  );
});

test("new events snapshot server-resolved access category and role without trusting browser identity", () => {
  assert.match(ingestion, /auth\.getClaims\(\)/);
  assert.match(
    ingestion,
    /rpc\(\s*"get_my_analytics_identity_context"/,
  );
  assert.match(
    ingestion,
    /target_access_type:\s*accessType/,
  );
  assert.match(
    ingestion,
    /target_access_role:\s*accessRole/,
  );
  assert.doesNotMatch(
    ingestion,
    /body\.(?:userId|organizationId|accessType|accessRole|sessionId)/,
  );

  assert.match(
    migration,
    /add column analytics_access_type text/,
  );
  assert.match(
    migration,
    /add column analytics_access_role text/,
  );
  assert.match(
    migration,
    /analytics_access_type is distinct from old\.analytics_access_type/,
  );
  assert.doesNotMatch(
    migration,
    /update public\.analytics_page_views[\s\S]*analytics_access_type\s*=/,
  );
});

test("identity resolution is caller-only and distinguishes effective internal and portal access", () => {
  const resolver = migration.slice(
    migration.indexOf(
      "create function public.get_my_analytics_identity_context",
    ),
    migration.indexOf(
      "-- Keep the previous 15-argument",
    ),
  );

  assert.match(resolver, /actor_id uuid := auth\.uid\(\)/);
  assert.match(
    resolver,
    /member\.user_id = actor_id[\s\S]*member\.status = 'ACTIVE'[\s\S]*organization\.status = 'ACTIVE'/,
  );
  assert.match(
    resolver,
    /portal_user\.user_id = actor_id[\s\S]*public\.is_customer_portal_user\(/,
  );
  assert.match(resolver, /'INTERNAL'::text/);
  assert.match(resolver, /'CUSTOMER_PORTAL'::text/);
  assert.match(
    resolver,
    /'AUTHENTICATED_UNCLASSIFIED'::text/,
  );
  assert.match(
    resolver,
    /revoke all on function public\.get_my_analytics_identity_context\(uuid, uuid\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    resolver,
    /grant execute on function public\.get_my_analytics_identity_context\(uuid, uuid\)[\s\S]*to authenticated/,
  );
});

test("SUPER_ADMIN aggregate keeps public rows separate and never fabricates historical identity", () => {
  const aggregate = migration.slice(
    migration.indexOf(
      "create function public.get_platform_authenticated_access_analytics",
    ),
  );

  assert.match(
    aggregate,
    /actor is null or not public\.is_super_admin\(actor\)/,
  );
  assert.match(
    aggregate,
    /when analytics_user_key is null then 'PUBLIC'/,
  );
  assert.match(
    aggregate,
    /when analytics_access_type is not null then analytics_access_type/,
  );
  assert.match(
    aggregate,
    /when analytics_organization_key is not null then 'INTERNAL'/,
  );
  assert.match(
    aggregate,
    /else 'AUTHENTICATED_HISTORICAL'/,
  );
  assert.match(
    aggregate,
    /where analytics_user_key is not null/,
  );
  assert.match(
    aggregate,
    /'publicPageViews', count\(\*\) filter \(where access_type = 'PUBLIC'\)/,
  );
  assert.match(
    aggregate,
    /revoke all on function public\.get_platform_authenticated_access_analytics[\s\S]*from public, anon, authenticated/,
  );
});

test("authenticated access is grouped by user, organization, category, and role with aggregate-only measures", () => {
  const aggregate = migration.slice(
    migration.indexOf("rollups as"),
  );

  assert.match(
    aggregate,
    /group by\s+analytics_user_key,\s+analytics_organization_key,\s+access_type,\s+access_role/,
  );
  assert.match(
    aggregate,
    /count\(distinct session_id\) as sessions/,
  );
  assert.match(
    aggregate,
    /max\(created_at\) as last_activity/,
  );
  assert.match(
    aggregate,
    /row_number\(\) over \([\s\S]*order by page_views desc, normalized_path/,
  );
  assert.match(
    aggregate,
    /left join public\.profiles profile/,
  );
  assert.match(
    aggregate,
    /left join public\.organizations organization/,
  );
  assert.doesNotMatch(
    aggregate,
    /join public\.customers|customer_(?:name|email)|street_address|phone/,
  );
  assert.doesNotMatch(
    aggregate,
    /'sessionId'|'ipAddress'|'rawIp'/,
  );
});

test("repository runs existing and authenticated aggregates in parallel for the same date range", () => {
  const loader = repository.slice(
    repository.indexOf("export async function getPlatformAnalytics"),
  );

  assert.match(
    loader,
    /await Promise\.all\(\s*\[[\s\S]*?supabase\.rpc\(\s*"get_platform_analytics"[\s\S]*?supabase\.rpc\(\s*"get_platform_authenticated_access_analytics"/,
  );
  assert.match(
    loader,
    /target_start: range\.start\?\.toISOString\(\) \?\? null/,
  );
  assert.match(
    loader,
    /target_end_exclusive: range\.endExclusive\.toISOString\(\)/,
  );
  assert.doesNotMatch(
    loader,
    /\.from\(\s*"analytics_page_views"\s*\)/,
  );
});

test("Platform Analytics presents searchable identities and keeps geography secondary", () => {
  assert.match(
    dashboard,
    /<AuthenticatedAccessAnalytics[\s\S]*data=\{analytics\.authenticatedAccess\}/,
  );
  assert.match(
    component,
    /<h3 id="authenticated-access-heading">[\s\S]*Authenticated Access[\s\S]*<\/h3>/,
  );
  assert.match(component, /<th>User<\/th>/);
  assert.match(component, /<th>Account<\/th>/);
  assert.match(component, /<th>Access Type \/ Role<\/th>/);
  assert.match(component, /<th>Organization<\/th>/);
  assert.match(component, /<th>Page Views<\/th>/);
  assert.match(component, /<th>Sessions<\/th>/);
  assert.match(component, /<th>Last Activity<\/th>/);
  assert.match(component, /<th>Top Route<\/th>/);
  assert.match(
    component,
    /<th>Approx\. Network Geography<\/th>/,
  );
  assert.match(
    component,
    /Filter authenticated access by user or organization/,
  );
  assert.match(component, /Authenticated Internal/);
  assert.match(component, /Customer Portal/);
  assert.match(component, /Public \/ Anonymous/);
  assert.match(
    component,
    /Network geography is[\s\S]*supporting context only/,
  );
  assert.doesNotMatch(
    component,
    /ip address|raw ip|session token|cookie/i,
  );
});

test("migration-before-source rollout retains the legacy guarded ingestion signature", () => {
  assert.match(
    migration,
    /Keep the previous 15-argument guarded ingestion function intact/,
  );

  const guardedFunctions =
    migration.match(
      /create function public\.record_analytics_page_view_guarded\(/g,
    ) ?? [];

  assert.equal(guardedFunctions.length, 1);
  assert.match(
    migration,
    /record_analytics_page_view_guarded\([\s\S]*target_access_type text,[\s\S]*target_access_role text/,
  );

  assert.match(
    guardedIngestionMigration,
    /create or replace function public\.record_analytics_page_view_guarded\([\s\S]*target_traffic_signal text\s*\)/,
  );
  assert.doesNotMatch(
    guardedIngestionMigration,
    /target_access_type|target_access_role/,
  );
  assert.doesNotMatch(
    migration,
    /drop function public\.record_analytics_page_view_guarded/,
  );
});

test("trusted analytics baseline is database-owned, immutable, and preserves historical rows", () => {
  assert.match(
    migration,
    /create table public\.platform_analytics_trusted_baseline/,
  );
  assert.match(
    migration,
    /trusted_data_started_at timestamptz not null\s+default pg_catalog\.clock_timestamp\(\)/,
  );
  assert.match(
    migration,
    /insert into public\.platform_analytics_trusted_baseline \(singleton\)\s+values \(true\)/,
  );
  assert.match(
    migration,
    /platform_analytics_trusted_baseline_immutable[\s\S]*before update or delete/,
  );
  assert.match(
    migration,
    /revoke all on table public\.platform_analytics_trusted_baseline[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    migration,
    /delete\s+from\s+public\.analytics_page_views|update\s+public\.analytics_page_views/i,
  );
});

test("all Platform Analytics aggregates clamp to the same trusted baseline", () => {
  const platformAggregate = migration.slice(
    migration.indexOf(
      "create function public.get_platform_analytics(",
    ),
    migration.indexOf(
      "create function public.get_platform_authenticated_access_analytics(",
    ),
  );
  const accessAggregate = migration.slice(
    migration.indexOf(
      "create function public.get_platform_authenticated_access_analytics(",
    ),
  );

  for (const aggregate of [platformAggregate, accessAggregate]) {
    assert.match(
      aggregate,
      /from public\.platform_analytics_trusted_baseline baseline/,
    );
    assert.match(
      aggregate,
      /when target_start is null then trusted_start[\s\S]*when target_start < trusted_start then trusted_start/,
    );
    assert.match(
      aggregate,
      /'trustedDataStartedAt', trusted_start/,
    );
    assert.match(
      aggregate,
      /actor is null or not public\.is_super_admin\(actor\)/,
    );
  }

  assert.match(
    accessAggregate,
    /where created_at >= effective_start/,
  );
});

test("repository and UI expose the effective trusted-data boundary without client authority", () => {
  assert.match(
    repository,
    /trustedDataStartedAt: string/,
  );
  assert.match(
    repository,
    /requestedStart < trustedStart\s+\? trustedStart\s+: requestedStart/,
  );
  assert.match(
    dashboard,
    /Trusted analytics data begins/,
  );
  assert.match(
    dashboard,
    /dateTime=\{analytics\.trustedDataStartedAt\}/,
  );
  assert.doesNotMatch(
    ingestion,
    /trustedDataStartedAt|trusted_data_started_at/,
  );
});
