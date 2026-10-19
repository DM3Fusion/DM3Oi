import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const actions = fs.readFileSync("lib/auth/actions.ts", "utf8");
const service = fs.readFileSync(
  "lib/data/authentication-security-audit.ts",
  "utf8",
);
const geography = fs.readFileSync(
  "lib/analytics-geography.ts",
  "utf8",
);

test("OTP verification precedes authentication security recording", () => {
  assert.ok(
    actions.indexOf("supabase.auth.verifyOtp") <
      actions.indexOf("recordAuthenticationSecuritySuccess("),
  );
});

test("verified claims must match the authenticated user", () => {
  assert.match(actions, /supabase\.auth\.getClaims\(\)/);
  assert.match(actions, /claims\?\.sub !== authenticatedUserId/);
  assert.match(actions, /typeof sessionId !== "string"/);
});

test("existing authentication audit precedes security audit", () => {
  const existing = actions.indexOf(
    "await recordSuccessfulAuthentication(authenticatedUserId)",
  );
  const security = actions.indexOf(
    "await recordAuthenticationSecuritySuccess(",
  );
  const membership = actions.indexOf(
    'supabase.rpc("verify_my_membership_invitation")',
  );

  assert.ok(existing >= 0);
  assert.ok(security > existing);
  assert.ok(membership > security);
});

test("security audit remains inside fail-closed sign-in handling", () => {
  assert.match(
    actions,
    /await recordAuthenticationSecuritySuccess\([\s\S]*?\);\s*}catch\{await supabase\.auth\.signOut\(\)/,
  );
});

test("authentication event uses the deployed security RPC", () => {
  assert.match(
    service,
    /"record_authentication_security_event"/,
  );
  assert.match(
    service,
    /target_event_type: "AUTHENTICATION_SUCCESS"/,
  );
  assert.match(
    service,
    /target_authentication_method: "EMAIL_OTP"/,
  );
});

test("authentication identity and session IDs are validated", () => {
  assert.match(service, /UUID_PATTERN\.test\(userId\)/);
  assert.match(service, /UUID_PATTERN\.test\(sessionId\)/);
});

test("network geography uses bounded, coarse coordinates", () => {
  assert.match(service, /analyticsGeographyFromHeaders/);
  assert.match(geography, /normalizedCoordinate\(latitude, -90, 90\)/);
  assert.match(geography, /normalizedCoordinate\(longitude, -180, 180\)/);
  assert.match(geography, /coordinate\.toFixed\(2\)/);
});

test("device and browser classification reuse existing utilities", () => {
  assert.match(service, /analyticsDeviceType\(userAgent\)/);
  assert.match(service, /analyticsBrowser\(userAgent\)/);
  assert.match(service, /analyticsOperatingSystem\(userAgent\)/);
});

test("analytics correlation is disabled during Stage A", () => {
  assert.match(service, /target_analytics_session_id: null/);
  assert.doesNotMatch(
    service,
    /getAnalyticsSessionId|correlate_authentication_analytics_session/,
  );
});

test("security event payload excludes credentials and tokens", () => {
  assert.doesNotMatch(
    service,
    /target_access_token|target_refresh_token|target_otp|target_password/,
  );
});

test("optional geography rejects control characters and excessive length", () => {
  assert.match(
    geography,
    /normalized\.slice\(0, maximumLength\)/,
  );

  assert.ok(
    geography.includes(String.raw`/[\u0000-\u001f\u007f]/`),
  );

  assert.doesNotMatch(
    service,
    /target_city: decodeAnalyticsHeader/,
  );
});

test("security service remains server-only", () => {
  assert.match(service, /import "server-only"/);
  assert.match(service, /createAdminClient/);
});
