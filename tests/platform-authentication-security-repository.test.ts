import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "lib/data/platform-authentication-security-repository.ts",
  "utf8",
);

test("authentication security repository is server-only", () => {
  assert.match(source, /import "server-only"/);
});

test("security queries require SUPER_ADMIN authorization", () => {
  assert.match(source, /import \{ requireSuperAdmin \}/);

  const events = source.indexOf(
    "export async function getPlatformAuthenticationSecurityEvents",
  );
  const sessions = source.indexOf(
    "export async function getPlatformAuthenticationSessionHistory",
  );

  assert.ok(events >= 0);
  assert.ok(sessions > events);

  assert.match(
    source.slice(events, sessions),
    /await requireSuperAdmin\(\)/,
  );

  assert.match(
    source.slice(sessions),
    /await requireSuperAdmin\(\)/,
  );
});

test("security reads use authenticated Supabase client", () => {
  assert.match(
    source,
    /import \{ createClient \} from "@\/lib\/supabase\/server"/,
  );

  assert.doesNotMatch(source, /createAdminClient/);
  assert.doesNotMatch(source, /@\/lib\/supabase\/admin/);
});

test("security event RPC uses the existing database contract", () => {
  assert.match(
    source,
    /get_platform_authentication_security_events/,
  );

  for (const parameter of [
    "target_start",
    "target_end_exclusive",
    "target_user_id",
    "target_event_type",
    "target_limit",
    "target_before_occurred_at",
    "target_before_event_id",
  ]) {
    assert.ok(source.includes(parameter), parameter);
  }
});

test("session history RPC uses the existing database contract", () => {
  assert.match(
    source,
    /get_platform_authentication_session_history/,
  );

  assert.match(
    source,
    /target_authentication_session_id: sessionId/,
  );
});

test("event queries use bounded cursor pagination", () => {
  assert.match(
    source,
    /SECURITY_EVENTS_PAGE_SIZE = 50/,
  );

  assert.match(
    source,
    /target_limit: SECURITY_EVENTS_PAGE_SIZE \+ 1/g,
  );

  assert.match(
    source,
    /rows\.slice\(0, SECURITY_EVENTS_PAGE_SIZE\)/g,
  );

  assert.match(source, /nextCursor:/g);
});

test("security UUID inputs are validated", () => {
  assert.match(source, /UUID_PATTERN/);
  assert.match(source, /Invalid security audit UUID/);
  assert.match(source, /normalizeUuid\(query\.userId\)/);
  assert.match(source, /normalizeUuid\(query\.sessionId\)/);
});

test("timestamps and date ranges are validated", () => {
  assert.match(source, /normalizeTimestamp/);
  assert.match(source, /Date\.parse/);
  assert.match(
    source,
    /Invalid authentication security date range/,
  );
});

test("event types are restricted to the database allowlist", () => {
  for (const eventType of [
    "AUTHENTICATION_SUCCESS",
    "AUTHENTICATION_FAILURE",
    "EXPLICIT_SIGN_OUT",
    "INACTIVITY_EXPIRATION",
    "ABSOLUTE_SESSION_EXPIRATION",
    "ADMINISTRATIVE_REVOCATION",
  ]) {
    assert.ok(source.includes(`"${eventType}"`));
  }

  assert.match(
    source,
    /Invalid authentication security event type/,
  );
});

test("pagination requires complete cursor pairs", () => {
  assert.match(
    source,
    /Boolean\(timestamp\) !== Boolean\(id\)/,
  );

  assert.match(
    source,
    /Incomplete authentication security cursor/,
  );
});

test("security RPC failures do not return empty success results", () => {
  assert.match(source, /if \(result\.error\)/g);

  assert.match(
    source,
    /Authentication security events are temporarily unavailable/,
  );

  assert.match(
    source,
    /Authentication session history is temporarily unavailable/,
  );
});

test("general event results exclude authentication session IDs", () => {
  const start = source.indexOf(
    "export type AuthenticationSecurityEvent =",
  );

  const end = source.indexOf(
    "export type AuthenticationSessionEvent =",
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  assert.doesNotMatch(
    source.slice(start, end),
    /authentication_session_id/,
  );

  assert.match(
    source.slice(end),
    /authentication_session_id: string/,
  );
});
