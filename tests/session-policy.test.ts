import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ABSOLUTE_SESSION_LIFETIME_MS,
  CUSTOMER_PORTAL_INACTIVITY_TIMEOUT_MS,
  INTERNAL_INACTIVITY_TIMEOUT_MS,
  isMeaningfulSessionActivity,
  SESSION_ACTIVITY_MARKER_COOKIE,
} from "../lib/auth/session-policy.ts";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20261007130000_dm3oi_authenticated_session_policy.sql",
);

function request({
  method = "GET",
  pathname = "/cases",
  headers = {},
  marker = false,
}: {
  method?: string;
  pathname?: string;
  headers?: Record<string, string>;
  marker?: boolean;
}) {
  return {
    method,
    url: `https://dm3oi.example${pathname}`,
    headers: new Headers(headers),
    cookies: {
      get(name: string) {
        return marker && name === SESSION_ACTIVITY_MARKER_COOKIE
          ? { value: "1" }
          : undefined;
      },
    },
  };
}

type PolicyScope = "INTERNAL" | "CUSTOMER_PORTAL";

function initialLastActivityAt(sessionStartedAt: number, rolloutStartedAt: number) {
  return Math.max(sessionStartedAt, rolloutStartedAt);
}

function applySessionPolicy({
  scope,
  sessionStartedAt,
  lastActivityAt,
  policyNow,
  meaningfulActivity = false,
}: {
  scope: PolicyScope;
  sessionStartedAt: number;
  lastActivityAt: number;
  policyNow: number;
  meaningfulActivity?: boolean;
}) {
  const inactivityTimeout =
    scope === "CUSTOMER_PORTAL"
      ? CUSTOMER_PORTAL_INACTIVITY_TIMEOUT_MS
      : INTERNAL_INACTIVITY_TIMEOUT_MS;
  const valid =
    policyNow < sessionStartedAt + ABSOLUTE_SESSION_LIFETIME_MS &&
    policyNow < lastActivityAt + inactivityTimeout;

  return {
    valid,
    lastActivityAt:
      valid && meaningfulActivity
        ? Math.max(lastActivityAt, policyNow)
        : lastActivityAt,
  };
}

test("approved inactivity and absolute session limits are exact", () => {
  assert.equal(INTERNAL_INACTIVITY_TIMEOUT_MS, 2 * 60 * 60 * 1000);
  assert.equal(CUSTOMER_PORTAL_INACTIVITY_TIMEOUT_MS, 30 * 60 * 1000);
  assert.equal(ABSOLUTE_SESSION_LIFETIME_MS, 24 * 60 * 60 * 1000);
  assert.match(migration, /policy_scope = 'CUSTOMER_PORTAL' then interval '30 minutes'/);
  assert.match(migration, /else interval '2 hours'/);
  assert.match(
    migration,
    /policy_now < activity_row\.session_started_at \+ interval '24 hours'/,
  );
});

test("server activity refreshes inactivity without extending absolute lifetime", () => {
  assert.match(
    migration,
    /session\.created_at[\s\S]*from auth\.sessions session[\s\S]*session\.id = actor_session_id[\s\S]*session\.user_id = actor_id/,
  );
  assert.match(
    migration,
    /if policy_valid and coalesce\(target_is_meaningful_activity, false\) then[\s\S]*set last_activity_at = greatest\(activity\.last_activity_at, policy_now\)/,
  );
  assert.doesNotMatch(
    migration,
    /set[\s\S]{0,100}session_started_at\s*=/,
  );
  assert.ok(
    migration.indexOf("policy_now < activity_row.session_started_at + interval '24 hours'") <
      migration.indexOf(
        "set last_activity_at = greatest(activity.last_activity_at, policy_now)",
      ),
  );
});

test("legacy sessions receive only the fixed rollout inactivity grace", () => {
  const rolloutStartedAt = Date.UTC(2026, 9, 7, 17, 0, 0);
  const legacyInternalStartedAt =
    rolloutStartedAt - 3 * 60 * 60 * 1000;
  const legacyPortalStartedAt = rolloutStartedAt - 45 * 60 * 1000;
  const overAbsoluteLimitStartedAt =
    rolloutStartedAt - ABSOLUTE_SESSION_LIFETIME_MS - 1;

  const internalLastActivityAt = initialLastActivityAt(
    legacyInternalStartedAt,
    rolloutStartedAt,
  );
  const portalLastActivityAt = initialLastActivityAt(
    legacyPortalStartedAt,
    rolloutStartedAt,
  );
  const expiredLastActivityAt = initialLastActivityAt(
    overAbsoluteLimitStartedAt,
    rolloutStartedAt,
  );

  assert.equal(internalLastActivityAt, rolloutStartedAt);
  assert.equal(
    applySessionPolicy({
      scope: "INTERNAL",
      sessionStartedAt: legacyInternalStartedAt,
      lastActivityAt: internalLastActivityAt,
      policyNow: rolloutStartedAt,
    }).valid,
    true,
  );
  assert.equal(portalLastActivityAt, rolloutStartedAt);
  assert.equal(
    applySessionPolicy({
      scope: "CUSTOMER_PORTAL",
      sessionStartedAt: legacyPortalStartedAt,
      lastActivityAt: portalLastActivityAt,
      policyNow: rolloutStartedAt,
    }).valid,
    true,
  );
  assert.equal(
    applySessionPolicy({
      scope: "INTERNAL",
      sessionStartedAt: overAbsoluteLimitStartedAt,
      lastActivityAt: expiredLastActivityAt,
      policyNow: rolloutStartedAt,
    }).valid,
    false,
  );

  assert.match(
    migration,
    /values \(true, transaction_timestamp\(\)\)/,
  );
  assert.match(
    migration,
    /greatest\(authoritative_started_at, rollout_started_at\)/,
  );
  assert.doesNotMatch(
    migration,
    /greatest\(authoritative_started_at, (?:policy_now|statement_timestamp\(\)|now\(\))\)/,
  );
});

test("new post-rollout sessions initialize from their authoritative session start", () => {
  const rolloutStartedAt = Date.UTC(2026, 9, 7, 17, 0, 0);
  const sessionStartedAt = rolloutStartedAt + 5 * 60 * 1000;
  const lastActivityAt = initialLastActivityAt(
    sessionStartedAt,
    rolloutStartedAt,
  );

  assert.equal(lastActivityAt, sessionStartedAt);
  assert.equal(
    applySessionPolicy({
      scope: "CUSTOMER_PORTAL",
      sessionStartedAt,
      lastActivityAt,
      policyNow: sessionStartedAt,
    }).valid,
    true,
  );
});

test("activity updates are monotonic and cannot extend the absolute lifetime", () => {
  const sessionStartedAt = Date.UTC(2026, 9, 7, 12, 0, 0);
  const newerStoredActivity = sessionStartedAt + 60 * 60 * 1000;
  const staleConcurrentStatement = newerStoredActivity - 5_000;

  assert.deepEqual(
    applySessionPolicy({
      scope: "INTERNAL",
      sessionStartedAt,
      lastActivityAt: newerStoredActivity,
      policyNow: staleConcurrentStatement,
      meaningfulActivity: true,
    }),
    { valid: true, lastActivityAt: newerStoredActivity },
  );
  assert.equal(
    applySessionPolicy({
      scope: "INTERNAL",
      sessionStartedAt,
      lastActivityAt: sessionStartedAt + 23 * 60 * 60 * 1000,
      policyNow: sessionStartedAt + ABSOLUTE_SESSION_LIFETIME_MS,
      meaningfulActivity: true,
    }).valid,
    false,
  );
  assert.match(
    migration,
    /set last_activity_at = greatest\(activity\.last_activity_at, policy_now\)/,
  );
});

test("simultaneous authenticated sessions remain isolated by session id", () => {
  const sessionStartedAt = Date.UTC(2026, 9, 7, 12, 0, 0);
  const sessions = new Map([
    ["session-a", sessionStartedAt],
    ["session-b", sessionStartedAt],
  ]);
  const updated = applySessionPolicy({
    scope: "INTERNAL",
    sessionStartedAt,
    lastActivityAt: sessions.get("session-a")!,
    policyNow: sessionStartedAt + 1_000,
    meaningfulActivity: true,
  });
  sessions.set("session-a", updated.lastActivityAt);

  assert.equal(sessions.get("session-a"), sessionStartedAt + 1_000);
  assert.equal(sessions.get("session-b"), sessionStartedAt);
  assert.match(migration, /session_id uuid primary key/);
  assert.match(
    migration,
    /where activity\.session_id = actor_session_id/,
  );
  assert.match(
    migration,
    /where session\.id = actor_session_id\s+and session\.user_id = actor_id/,
  );
});

test("prefetch and background requests never refresh activity", () => {
  const fullPrefetchWithoutHeader = request({
    headers: {
      rsc: "1",
      "next-router-state-tree": "tree",
    },
  });
  assert.equal(isMeaningfulSessionActivity(fullPrefetchWithoutHeader), false);

  const prefetchHeaders: Array<Record<string, string>> = [
    { "next-router-prefetch": "1" },
    { "next-router-segment-prefetch": "/_tree" },
    { "x-middleware-prefetch": "1" },
    { purpose: "prefetch" },
    { "sec-purpose": "prefetch" },
  ];
  for (const headers of prefetchHeaders) {
    assert.equal(
      isMeaningfulSessionActivity(
        request({
          headers: {
            rsc: "1",
            "next-router-state-tree": "tree",
            ...headers,
          },
          marker: true,
        }),
      ),
      false,
    );
  }

  assert.equal(
    isMeaningfulSessionActivity(
      request({ pathname: "/api/private/background", marker: true }),
    ),
    false,
  );
  assert.equal(
    isMeaningfulSessionActivity(
      request({ pathname: "/api/analytics/interaction", marker: true }),
    ),
    false,
  );
});

test("user navigation and actions require an attributable activity signal", () => {
  assert.equal(
    isMeaningfulSessionActivity(
      request({
        method: "POST",
        headers: { "next-action": "action-id" },
      }),
    ),
    false,
  );
  assert.equal(
    isMeaningfulSessionActivity(
      request({
        headers: {
          rsc: "1",
          "next-router-state-tree": "tree",
        },
        marker: true,
      }),
    ),
    true,
  );
  assert.equal(
    isMeaningfulSessionActivity(
      request({
        method: "POST",
        headers: { "next-action": "action-id" },
        marker: true,
      }),
    ),
    true,
  );
  assert.equal(
    isMeaningfulSessionActivity(
      request({
        headers: {
          "sec-fetch-mode": "navigate",
          "sec-fetch-dest": "document",
        },
      }),
    ),
    false,
  );
  assert.equal(
    isMeaningfulSessionActivity(
      request({
        headers: {
          "sec-fetch-mode": "navigate",
          "sec-fetch-dest": "document",
        },
        marker: true,
      }),
    ),
    true,
  );
});

test("zero-argument route state compatibility and boolean overload stay explicit", () => {
  const originalRouteStateMigration = source(
    "supabase/migrations/20261003200000_dm3oi_customer_portal_identity_database_hardening.sql",
  );
  const proxy = source("proxy.ts");

  assert.match(
    originalRouteStateMigration,
    /create or replace function public\.get_my_route_access_state\(\)/,
  );
  assert.match(
    migration,
    /create or replace function public\.get_my_route_access_state\(\s*target_is_meaningful_activity boolean\s*\)/,
  );
  assert.doesNotMatch(
    migration,
    /target_is_meaningful_activity boolean\s+default/i,
  );
  assert.match(migration, /from public\.get_my_route_access_state\(\)/);
  assert.match(
    proxy,
    /rpc\("get_my_route_access_state",\{target_is_meaningful_activity:meaningfulActivity\}\)/,
  );
});

test("session metadata is self-only server state and fails closed", () => {
  assert.match(migration, /references auth\.sessions\(id\) on delete cascade/);
  assert.match(migration, /alter table public\.authenticated_session_activity enable row level security/);
  assert.match(
    migration,
    /alter table public\.authenticated_session_policy_configuration enable row level security/,
  );
  assert.match(
    migration,
    /revoke all on table public\.authenticated_session_activity[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /revoke all on table public\.authenticated_session_policy_configuration[\s\S]*from public, anon, authenticated/,
  );
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /policy_valid boolean := false/);
  assert.match(
    migration,
    /if authoritative_started_at is not null\s+and rollout_started_at is not null then/,
  );
  assert.match(migration, /session_policy_valid boolean/);
  assert.match(
    migration,
    /from public\.get_my_route_access_state\(\)/,
  );
});

test("expired internal sessions use the two-hour policy and safe login redirect", () => {
  const proxy = source("proxy.ts");
  assert.match(
    migration,
    /when route_state\.has_active_customer_portal_access then 'CUSTOMER_PORTAL'[\s\S]*else 'INTERNAL'/,
  );
  assert.match(migration, /else interval '2 hours'/);
  assert.match(proxy, /routeState\?\.session_policy_valid!==true/);
  assert.match(proxy, /target\.searchParams\.set\("error","Your session has ended\. Sign in again\."\)/);
  assert.match(proxy, /safeInternalPath\(`\$\{pathname\}\$\{request\.nextUrl\.search\}`\)/);
});

test("expired Customer Portal sessions use the thirty-minute policy and same safe termination", () => {
  const proxy = source("proxy.ts");
  assert.match(
    migration,
    /route_state\.has_active_customer_portal_access then 'CUSTOMER_PORTAL'/,
  );
  assert.match(migration, /policy_scope = 'CUSTOMER_PORTAL' then interval '30 minutes'/);
  assert.match(proxy, /await supabase\.auth\.signOut\(\{scope:"local"\}\)/);
  assert.match(proxy, /responseWithCookies\(target,response\)/);
});

test("proxy enforces expiry safely without changing public analytics or sign-out", () => {
  const proxy = source("proxy.ts");
  const actions = source("lib/auth/actions.ts");
  const signOutRoute = source("app/auth/sign-out/route.ts");

  assert.ok(
    proxy.indexOf("if(publicAnalyticsRoutes.has(pathname)) return response") <
      proxy.indexOf("supabase.auth.getClaims()"),
  );
  assert.match(
    proxy,
    /protectedRoute\|\|pathname==="\/"\|\|pathname==="\/login"/,
  );
  assert.match(proxy, /const enforceSession=authenticated&&/);
  assert.match(proxy, /routeState\?\.session_policy_valid!==true/);
  assert.match(proxy, /supabase\.auth\.signOut\(\{scope:"local"\}\)/);
  assert.match(proxy, /new URL\("\/login",request\.url\)/);
  assert.match(proxy, /if\(pathname==="\/login"\)return response/);
  assert.match(proxy, /response\.cookies\.delete\(ACTIVE_ORGANIZATION_COOKIE\)/);
  assert.match(proxy, /response\.cookies\.delete\(ACTIVE_PORTAL_ACCESS_COOKIE\)/);

  assert.match(actions, /signOutAction\(\)[\s\S]*supabase\.auth\.signOut\(\)[\s\S]*redirect\("\/"\)/);
  assert.match(signOutRoute, /supabase\.auth\.signOut\(\)/);
  assert.match(signOutRoute, /NextResponse\.redirect\(new URL\("\/",request\.url\),303\)/);
});

test("activity marking adds no polling and preserves explicit navigation prefetch", () => {
  const shell = source("components/layout/app-shell.tsx");
  const mobile = source("components/layout/mobile-bottom-navigation.tsx");
  const navigation = `${shell}\n${mobile}`;

  assert.match(shell, /if \(!event\.isTrusted\) return/);
  assert.match(shell, /onPointerDownCapture=\{markAuthenticatedActivity\}/);
  assert.match(shell, /onKeyDownCapture=\{markAuthenticatedActivity\}/);
  assert.doesNotMatch(shell, /setInterval|visibilitychange|addEventListener\("focus"/);
  assert.equal(
    navigation.match(/<Link\b/g)?.length,
    navigation.match(/prefetch=\{true\}/g)?.length,
  );
  assert.doesNotMatch(navigation, /prefetch=\{false\}/);
});
