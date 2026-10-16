import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20261016120000_dm3oi_authentication_security_audit_foundation.sql";
const migration = readFileSync(migrationPath, "utf8");
const analyticsIngestionMigration = readFileSync(
  "supabase/migrations/20261008100000_dm3oi_platform_analytics_network_geography.sql",
  "utf8",
);
const analyticsAuthenticatedAccessMigration = readFileSync(
  "supabase/migrations/20261007140000_dm3oi_authenticated_access_analytics.sql",
  "utf8",
);
const analyticsIngestionGuardMigration = readFileSync(
  "supabase/migrations/20261004150000_dm3oi_analytics_ingestion_guard.sql",
  "utf8",
);
const analyticsFoundationMigration = readFileSync(
  "supabase/migrations/20260923210000_dm3oi_platform_analytics.sql",
  "utf8",
);
const analyticsDurabilityMigration = readFileSync(
  "supabase/migrations/20261003100000_dm3oi_platform_analytics_durable_attribution.sql",
  "utf8",
);
const analyticsPageViewRoute = readFileSync(
  "app/api/analytics/page-view/route.ts",
  "utf8",
);

// These tests statically verify the prepared migration contract. They do not
// execute PostgreSQL, exercise RLS roles, or prove runtime concurrency. Those
// behaviors remain mandatory post-apply validation in an approved environment.

function section(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);

  assert.ok(startIndex >= 0, `Missing migration section: ${start}`);
  assert.ok(endIndex > startIndex, `Missing migration section boundary: ${end}`);

  return migration.slice(startIndex, endIndex);
}

const eventTable = section(
  "create table public.authentication_security_events",
  "comment on table public.authentication_security_events",
);
const detailTable = section(
  "create table public.authentication_security_event_details",
  "comment on table public.authentication_security_event_details",
);
const correlationTable = section(
  "create table public.authentication_session_correlations",
  "comment on table public.authentication_session_correlations",
);
const correlationWriter = section(
  "create function public.correlate_authentication_analytics_session",
  "alter function public.correlate_authentication_analytics_session",
);
const eventWriter = section(
  "create function public.record_authentication_security_event",
  "alter function public.record_authentication_security_event",
);
const eventReader = section(
  "create function public.get_platform_authentication_security_events",
  "alter function public.get_platform_authentication_security_events",
);
const sessionReader = section(
  "create function public.get_platform_authentication_session_history",
  "alter function public.get_platform_authentication_session_history",
);
const correlationReader = section(
  "create function public.get_platform_authentication_event_correlations",
  "alter function public.get_platform_authentication_event_correlations",
);
const retentionFunction = section(
  "create function public.purge_authentication_security_audit_retention",
  "alter function public.purge_authentication_security_audit_retention",
);

function privilegeSection(functionName: string, nextMarker: string) {
  return section(
    `revoke all on function public.${functionName}`,
    nextMarker,
  );
}

function returnColumns(functionSection: string) {
  return sectionFromText(functionSection, "returns table (", ")\nlanguage");
}

function sectionFromText(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  assert.ok(startIndex >= 0, `Missing section: ${start}`);
  assert.ok(endIndex > startIndex, `Missing section boundary: ${end}`);

  return source.slice(startIndex, endIndex);
}

test("security audit foundation preserves existing authentication and analytics definitions", () => {
  assert.doesNotMatch(
    migration,
    /alter table public\.(?:authentication_events|authenticated_session_activity|analytics_live_sessions|analytics_page_views)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /(?:create or replace|drop) function public\.(?:get_platform_analytics|get_platform_authenticated_access_analytics|record_analytics_page_view_guarded)/i,
  );
  assert.doesNotMatch(migration, /truncate table/i);
});

test("core events support every approved lifecycle category with evidence constraints", () => {
  for (const eventType of [
    "AUTHENTICATION_SUCCESS",
    "AUTHENTICATION_FAILURE",
    "EXPLICIT_SIGN_OUT",
    "INACTIVITY_EXPIRATION",
    "ABSOLUTE_SESSION_EXPIRATION",
    "ADMINISTRATIVE_REVOCATION",
  ]) {
    assert.match(eventTable, new RegExp(`'${eventType}'`));
  }

  assert.match(eventTable, /authentication_security_event_outcome_check/);
  assert.match(eventTable, /authentication_security_event_method_check/);
  assert.match(eventTable, /authentication_security_event_user_evidence_check/);
  assert.match(eventTable, /authentication_security_event_session_evidence_check/);
  assert.match(eventTable, /authentication_security_failure_anonymous_check/);
  assert.match(
    eventTable,
    /event_type <> 'AUTHENTICATION_FAILURE'[\s\S]*user_id is null[\s\S]*authentication_session_id is null[\s\S]*access_category is null/,
  );
});

test("network and device detail is a separate 90-day approximate authentication location", () => {
  assert.match(
    detailTable,
    /network_location_type text not null[\s\S]*'AUTHENTICATION_NETWORK_LOCATION'/,
  );
  assert.match(detailTable, /network_latitude numeric\(4, 2\)/);
  assert.match(detailTable, /network_longitude numeric\(5, 2\)/);
  assert.match(detailTable, /network_latitude between -90\.00 and 90\.00/);
  assert.match(detailTable, /network_longitude between -180\.00 and 180\.00/);
  assert.match(detailTable, /device_category in \('DESKTOP', 'TABLET', 'MOBILE', 'OTHER'\)/);
  assert.match(
    detailTable,
    /retention_eligible_at = recorded_at \+ interval '90 days'/,
  );
  assert.match(eventWriter, /round\(target_network_latitude, 2\)/);
  assert.match(eventWriter, /round\(target_network_longitude, 2\)/);
  assert.doesNotMatch(migration, /getCurrentPosition|geolocation provider/i);
});

test("new tables persist no raw IP, credential, token, cookie, or browser fingerprint fields", () => {
  const persistedSchema = [eventTable, detailTable, correlationTable].join("\n");

  assert.doesNotMatch(
    persistedSchema,
    /\b(?:raw_ip|ip_address|originating_ip|password|otp_code|access_token|refresh_token|session_cookie|authorization_header|browser_fingerprint)\b/i,
  );
});

test("forensic identifiers cannot disappear through cascading source-record deletion", () => {
  assert.doesNotMatch(eventTable, /references auth\.(?:users|sessions)/i);
  assert.doesNotMatch(eventTable, /references public\.organizations/i);
  assert.doesNotMatch(correlationTable, /references auth\.(?:users|sessions)/i);
  assert.doesNotMatch(correlationTable, /references public\.analytics_/i);
  assert.match(
    detailTable,
    /references public\.authentication_security_events\(id\) on delete restrict/,
  );
  assert.match(
    correlationTable,
    /references public\.authentication_security_events\(id\) on delete restrict/,
  );
  assert.doesNotMatch(
    [eventTable, detailTable, correlationTable].join("\n"),
    /on delete cascade/i,
  );
});

test("RLS and table privileges deny anonymous, ordinary authenticated, and direct service-role access", () => {
  for (const table of [
    "authentication_security_events",
    "authentication_security_event_details",
    "authentication_session_correlations",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`,
      ),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`grant (?:select|insert|update|delete|all)[\\s\\S]*public\\.${table}`, "i"),
    );
  }
});

test("static contract: trusted writers fail closed and validate Supabase session ownership", () => {
  for (const writer of [eventWriter, correlationWriter]) {
    assert.match(writer, /security definer/);
    assert.match(writer, /set search_path = ''/);
    assert.match(
      writer,
      /if auth\.role\(\) is distinct from 'service_role'/,
    );
  }

  assert.match(
    eventWriter,
    /from auth\.sessions authentication_session[\s\S]*authentication_session\.id = target_authentication_session_id[\s\S]*authentication_session\.user_id = target_user_id/,
  );
  assert.match(
    correlationWriter,
    /from auth\.sessions authentication_session[\s\S]*authentication_session\.id = target_authentication_session_id[\s\S]*authentication_session\.user_id = target_user_id/,
  );

  for (const writerName of [
    "record_authentication_security_event",
    "correlate_authentication_analytics_session",
  ]) {
    const privileges = privilegeSection(
      writerName,
      writerName === "correlate_authentication_analytics_session"
        ? "create function public.record_authentication_security_event"
        : "create function public.get_platform_authentication_security_events",
    );

    assert.match(
      privileges,
      new RegExp(`grant execute on function public\\.${writerName}[\\s\\S]*?to service_role`),
    );
    assert.doesNotMatch(
      privileges,
      /grant execute[\s\S]*?to (?:anon|authenticated)/,
    );
  }

  assert.doesNotMatch(migration, /auth\.role\(\) <> 'service_role'/);
});

test("static contract: analytics correlation requires one matching durable identity and rejects ambiguity", () => {
  assert.match(
    correlationWriter,
    /from public\.analytics_page_views page_view[\s\S]*page_view\.session_id = target_analytics_session_id/,
  );
  assert.match(
    correlationWriter,
    /count\(distinct page_view\.analytics_user_key\)::integer/,
  );
  assert.match(
    correlationWriter,
    /page_view\.analytics_user_key = target_user_id/,
  );
  assert.match(
    correlationWriter,
    /page_view\.user_id is not null[\s\S]*page_view\.analytics_user_key is distinct from page_view\.user_id/,
  );

  // COUNT(DISTINCT) ignores public NULL identities. Requiring exactly one
  // durable identity and at least one matching row rejects both no-page-view
  // and public-only sessions, as well as multi-identity sessions.
  assert.match(correlationWriter, /authenticated_identity_count <> 1/);
  assert.match(correlationWriter, /matching_identity_page_views < 1/);
  assert.match(
    correlationWriter,
    /raise exception 'analytics session identity is ambiguous'/,
  );

  assert.match(
    correlationWriter,
    /correlation\.analytics_session_id = target_analytics_session_id[\s\S]*correlation\.user_id <> target_user_id/,
  );
  assert.match(
    correlationTable,
    /analytics_identity_first_seen_at timestamptz not null[\s\S]*analytics_identity_last_seen_at timestamptz not null[\s\S]*analytics_authenticated_page_views bigint not null/,
  );
});

test("static contract: correlation follows the guarded ingestion lock order before identity verification", () => {
  assert.match(
    correlationWriter,
    /pg_catalog\.pg_advisory_xact_lock\(143690001\)/,
  );
  assert.match(
    correlationWriter,
    /pg_catalog\.pg_advisory_xact_lock\([\s\S]*pg_catalog\.hashtextextended\([\s\S]*target_analytics_session_id::text/,
  );

  const globalLock = correlationWriter.indexOf(
    "pg_catalog.pg_advisory_xact_lock(143690001)",
  );
  const sessionLock = correlationWriter.indexOf("pg_catalog.hashtextextended");
  const sessionOwnershipRead = correlationWriter.indexOf(
    "from auth.sessions authentication_session",
  );
  const identityRead = correlationWriter.indexOf(
    "from public.analytics_page_views page_view",
  );
  const conflictRead = correlationWriter.indexOf(
    "from public.authentication_session_correlations correlation",
  );
  const insert = correlationWriter.indexOf(
    "insert into public.authentication_session_correlations",
  );

  assert.ok(globalLock >= 0 && sessionLock > globalLock);
  assert.ok(sessionOwnershipRead > sessionLock);
  assert.ok(identityRead > sessionOwnershipRead);
  assert.ok(conflictRead > identityRead);
  assert.ok(insert > conflictRead);

  const ingestionLock = analyticsIngestionMigration.indexOf(
    "pg_catalog.pg_advisory_xact_lock(143690001)",
  );
  const ingestionInsert = analyticsIngestionMigration.indexOf(
    "insert into public.analytics_page_views",
  );
  assert.ok(ingestionLock >= 0 && ingestionInsert > ingestionLock);
  assert.match(
    correlationWriter,
    /Lock ordering contract shared with source-managed analytics ingestion/,
  );
});

test("static contract: correlation timestamps verified evidence at execution time", () => {
  assert.match(correlationWriter, /correlation_time timestamptz;/);
  assert.doesNotMatch(
    correlationWriter,
    /correlation_time timestamptz\s*:=/,
  );

  const identityRead = correlationWriter.indexOf(
    "from public.analytics_page_views page_view",
  );
  const ambiguityRejection = correlationWriter.indexOf(
    "if attribution_is_inconsistent",
  );
  const conflictRead = correlationWriter.indexOf(
    "from public.authentication_session_correlations correlation",
  );
  const timestamp = correlationWriter.indexOf(
    "correlation_time := pg_catalog.clock_timestamp()",
  );
  const temporalRejection = correlationWriter.indexOf(
    "if identity_last_seen_at > correlation_time then",
  );
  const insert = correlationWriter.indexOf(
    "insert into public.authentication_session_correlations",
  );

  assert.ok(identityRead >= 0 && ambiguityRejection > identityRead);
  assert.ok(conflictRead > ambiguityRejection);
  assert.ok(timestamp > conflictRead);
  assert.ok(temporalRejection > timestamp);
  assert.ok(insert > temporalRejection);
  assert.match(
    correlationTable,
    /authentication_session_correlation_verified_before_created_check[\s\S]*analytics_identity_last_seen_at <= created_at/,
  );
});

test("static contract: direct service-role analytics INSERT is revoked without broader privilege changes", () => {
  assert.match(
    analyticsFoundationMigration,
    /grant select, insert, update, delete[\s\S]*on public\.analytics_page_views[\s\S]*to service_role/,
  );
  assert.match(
    analyticsDurabilityMigration,
    /revoke delete on table public\.analytics_page_views from service_role/,
  );
  assert.doesNotMatch(
    analyticsDurabilityMigration,
    /revoke insert on table public\.analytics_page_views from service_role/,
  );
  assert.match(
    migration,
    /revoke insert\s+on table public\.analytics_page_views\s+from service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /revoke (?:select|update|delete|all)\s+on table public\.analytics_page_views\s+from service_role;/,
  );
  assert.match(
    migration,
    /Table owners and[\s\S]*superusers remain privileged PostgreSQL bypass paths/,
  );
  assert.match(
    analyticsPageViewRoute,
    /admin\.rpc\([\s\S]*"record_analytics_page_view_guarded"/,
  );
  assert.doesNotMatch(
    analyticsPageViewRoute,
    /\.from\("analytics_page_views"\)[\s\S]*\.insert\(/,
  );
});

test("static contract: guarded SECURITY DEFINER ingestion remains executable after direct INSERT revocation", () => {
  for (const guardedMigration of [
    analyticsIngestionGuardMigration,
    analyticsAuthenticatedAccessMigration,
    analyticsIngestionMigration,
  ]) {
    const guardedWriter = sectionFromText(
      guardedMigration,
      guardedMigration.includes("create or replace function public.record_analytics_page_view_guarded")
        ? "create or replace function public.record_analytics_page_view_guarded"
        : "create function public.record_analytics_page_view_guarded",
      "revoke all",
    );

    assert.match(guardedWriter, /security definer/);
    assert.match(guardedWriter, /set search_path = ''/);
    assert.match(
      guardedWriter,
      /pg_catalog\.pg_advisory_xact_lock\(143690001\)/,
    );
    assert.match(
      guardedWriter,
      /insert into public\.analytics_page_views/,
    );
    assert.match(
      guardedMigration,
      /grant execute[\s\S]*record_analytics_page_view_guarded[\s\S]*to service_role/,
    );
  }

  // SECURITY DEFINER uses the function owner's privileges, not the caller's
  // revoked table INSERT privilege. PostgreSQL ownership and actual role
  // behavior still require post-apply runtime verification.
  assert.match(
    migration,
    /postgres-owned[\s\S]*SECURITY DEFINER functions[\s\S]*service_role callers retain RPC ingestion/,
  );
});

test("correlation is idempotent, supports multiple analytics sessions, and permits no analytics session", () => {
  assert.match(
    correlationTable,
    /unique \(security_event_id, analytics_session_id\)/,
  );
  assert.doesNotMatch(
    correlationTable,
    /unique \(authentication_session_id\)/,
  );
  assert.match(
    correlationWriter,
    /on conflict \(security_event_id, analytics_session_id\) do nothing/,
  );
  assert.match(
    eventWriter,
    /if target_analytics_session_id is not null then[\s\S]*perform public\.correlate_authentication_analytics_session/,
  );

  const eventInsert = eventWriter.indexOf(
    "insert into public.authentication_security_events",
  );
  const optionalCorrelation = eventWriter.indexOf(
    "if target_analytics_session_id is not null then",
  );
  assert.ok(eventInsert >= 0 && optionalCorrelation > eventInsert);
});

test("security audit records are immutable outside the explicit retention path", () => {
  assert.match(
    migration,
    /create function public\.guard_authentication_security_audit_immutability\(\)[\s\S]*authentication security audit records are immutable/,
  );

  for (const trigger of [
    "authentication_security_events_immutable",
    "authentication_security_event_details_immutable",
    "authentication_session_correlations_immutable",
  ]) {
    assert.match(migration, new RegExp(`create trigger ${trigger}`));
  }

  assert.match(
    retentionFunction,
    /set_config\([\s\S]*'dm3oi\.authentication_security_retention_cleanup'[\s\S]*'enabled'[\s\S]*true/,
  );
  assert.match(
    retentionFunction,
    /if auth\.role\(\) is distinct from 'service_role'/,
  );
  assert.match(
    migration,
    /tg_op = 'DELETE'[\s\S]*auth\.role\(\) is not distinct from 'service_role'[\s\S]*current_setting\([\s\S]*authentication_security_retention_cleanup/,
  );
  assert.match(
    migration,
    /grant execute on function public\.purge_authentication_security_audit_retention\(\)[\s\S]*to service_role/,
  );
});

test("retention separates 90-day detail from 365-day events and correlations without scheduling cleanup", () => {
  assert.match(
    eventTable,
    /retention_eligible_at = occurred_at \+ interval '365 days'/,
  );
  assert.match(
    correlationTable,
    /retention_eligible_at = created_at \+ interval '365 days'/,
  );
  assert.match(
    retentionFunction,
    /delete from public\.authentication_security_event_details[\s\S]*delete from public\.authentication_session_correlations[\s\S]*delete from public\.authentication_security_events/,
  );
  assert.doesNotMatch(migration, /pg_cron|cron\.schedule|schedule\s*\(/i);
});

test("each read RPC independently authorizes active SUPER_ADMIN access", () => {
  for (const reader of [eventReader, sessionReader, correlationReader]) {
    assert.match(reader, /security definer/);
    assert.match(reader, /set search_path = ''/);
    assert.match(
      reader,
      /actor uuid := auth\.uid\(\)[\s\S]*actor is null or not public\.is_super_admin\(actor\)[\s\S]*raise exception 'not authorized'/,
    );
  }

  assert.match(
    migration,
    /grant execute on function public\.get_platform_authentication_security_events[\s\S]*to authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_platform_authentication_session_history[\s\S]*to authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_platform_authentication_event_correlations[\s\S]*to authenticated/,
  );
});

test("read RPCs use bounded deterministic keyset pagination", () => {
  for (const reader of [eventReader, sessionReader]) {
    assert.match(reader, /target_limit < 1/);
    assert.match(reader, /target_limit > 200/);
    assert.match(
      reader,
      /\(security_event\.occurred_at, security_event\.id\)[\s\S]*< \(target_before_occurred_at, target_before_event_id\)/,
    );
    assert.match(
      reader,
      /order by security_event\.occurred_at desc, security_event\.id desc[\s\S]*limit target_limit/,
    );
  }

  assert.match(eventReader, /security_event\.user_id = target_user_id/);
  assert.match(eventReader, /security_event\.event_type = target_event_type/);
  assert.match(sessionReader, /security_event\.authentication_session_id =/);

  assert.match(correlationReader, /target_limit < 1/);
  assert.match(correlationReader, /target_limit > 200/);
  assert.match(
    correlationReader,
    /\(correlation\.created_at, correlation\.id\)[\s\S]*< \(target_before_correlated_at, target_before_correlation_id\)/,
  );
  assert.match(
    correlationReader,
    /order by correlation\.created_at desc, correlation\.id desc[\s\S]*limit target_limit/,
  );
});

test("broad readers omit complete session identifiers and unbounded nested aggregation", () => {
  const eventColumns = returnColumns(eventReader);
  const sessionColumns = returnColumns(sessionReader);
  const correlationColumns = returnColumns(correlationReader);

  assert.doesNotMatch(eventColumns, /authentication_session_id uuid/);
  assert.doesNotMatch(eventColumns, /analytics_session_id uuid/);
  assert.match(sessionColumns, /authentication_session_id uuid/);
  assert.doesNotMatch(sessionColumns, /analytics_session_id uuid/);
  assert.match(correlationColumns, /authentication_session_id uuid/);
  assert.match(correlationColumns, /analytics_session_id uuid/);

  assert.doesNotMatch(eventReader, /jsonb_agg|analytics_sessions jsonb/);
  assert.doesNotMatch(sessionReader, /jsonb_agg|analytics_sessions jsonb/);
  assert.doesNotMatch(correlationReader, /jsonb_agg/);
  assert.match(
    correlationReader,
    /target_security_event_id uuid[\s\S]*correlation\.security_event_id = target_security_event_id/,
  );
});

test("all new functions use secure search paths and narrowly scoped grants", () => {
  const functionCount = migration.match(/create function public\./g)?.length ?? 0;
  const secureSearchPathCount = migration.match(/set search_path = ''/g)?.length ?? 0;

  assert.equal(functionCount, 7);
  assert.equal(secureSearchPathCount, 7);
  assert.doesNotMatch(migration, /security definer set search_path = public/i);

  for (const functionName of [
    "correlate_authentication_analytics_session",
    "record_authentication_security_event",
    "get_platform_authentication_security_events",
    "get_platform_authentication_session_history",
    "get_platform_authentication_event_correlations",
    "purge_authentication_security_audit_retention",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `alter function public\\.${functionName}\\([\\s\\S]*?\\)\\s+owner to postgres`,
      ),
    );
  }
});
