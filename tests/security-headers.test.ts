import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import nextConfig from "../next.config.ts";

const source = (path: string) => readFileSync(path, "utf8");

async function configuredHeaders() {
  const resolveHeaders = nextConfig.headers;
  if (typeof resolveHeaders !== "function") {
    assert.fail("next.config.ts must define headers().");
  }

  const rules = await resolveHeaders();
  assert.equal(rules.length, 1);
  assert.equal(rules[0]?.source, "/:path*");

  return new Map(
    rules[0]!.headers.map(({ key, value }) => [key, value]),
  );
}

test("the repository owns an exact broad security-header baseline", async () => {
  const headers = await configuredHeaders();

  assert.deepEqual(
    Object.fromEntries(headers),
    {
      "Content-Security-Policy": "frame-ancestors 'none'",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  );
  assert.equal(nextConfig.poweredByHeader, false);
});

test("frame and MIME protection are enforcing without a broad resource CSP", async () => {
  const headers = await configuredHeaders();
  const csp = headers.get("Content-Security-Policy");

  assert.equal(csp, "frame-ancestors 'none'");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.has("Content-Security-Policy-Report-Only"), false);
  assert.doesNotMatch(csp!, /default-src|script-src|style-src|img-src|connect-src/);
  assert.doesNotMatch(csp!, /unsafe-inline|unsafe-eval|\*/);
});

test("transport, referrer, and browser capability policies remain conservative", async () => {
  const headers = await configuredHeaders();

  assert.equal(
    headers.get("Referrer-Policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(
    headers.get("Permissions-Policy"),
    "camera=(), microphone=(), geolocation=()",
  );
  assert.equal(
    headers.get("Strict-Transport-Security"),
    "max-age=31536000",
  );
  assert.doesNotMatch(
    headers.get("Strict-Transport-Security")!,
    /includeSubDomains|preload/i,
  );
  assert.equal(headers.has("Cross-Origin-Opener-Policy"), false);
  assert.equal(headers.has("Cross-Origin-Embedder-Policy"), false);
  assert.equal(headers.has("Cross-Origin-Resource-Policy"), false);

  for (const value of headers.values()) {
    assert.doesNotMatch(value, /https?:\/\/\*|\*\./);
  }
});

test("broad headers do not change auth, public routes, or typed tracking images", () => {
  const config = source("next.config.ts");
  const proxy = source("proxy.ts");
  const callback = source("app/auth/callback/route.ts");
  const trackingPixel = source("app/api/email/open/[token]/route.ts");

  assert.doesNotMatch(
    config,
    /proxy|session-policy|prefetch|exchangeCodeForSession|signInWithOtp/,
  );
  assert.match(proxy, /pathname==="\/auth\/callback"\) return response/);
  assert.match(
    proxy,
    /const publicRoutes=\[[^\]]*"\/login"[^\]]*"\/auth\/callback"[^\]]*"\/auth\/sign-out"/,
  );
  assert.match(
    proxy,
    /const publicAnalyticsRoutes=new Set\(\["\/api\/analytics\/page-view","\/api\/analytics\/interaction"\]\)/,
  );
  assert.match(callback, /supabase\.auth\.exchangeCodeForSession\(code\)/);
  assert.match(trackingPixel, /"Content-Type": "image\/png"/);
});

test("navigation prefetch and meaningful-activity session policy stay intact", () => {
  const shell = source("components/layout/app-shell.tsx");
  const mobile = source("components/layout/mobile-bottom-navigation.tsx");
  const navigation = `${shell}\n${mobile}`;
  const sessionPolicy = source("lib/auth/session-policy.ts");

  assert.equal(
    navigation.match(/<Link\b/g)?.length,
    navigation.match(/prefetch=\{true\}/g)?.length,
  );
  assert.doesNotMatch(navigation, /prefetch=\{false\}/);
  assert.match(
    sessionPolicy,
    /SESSION_ACTIVITY_MARKER_COOKIE = "dm3oi-session-activity"/,
  );
  assert.match(
    sessionPolicy,
    /if \(isPrefetchRequest\(request\.headers\)\) return false/,
  );
  assert.match(
    sessionPolicy,
    /request\.cookies\.get\(SESSION_ACTIVITY_MARKER_COOKIE\)\?\.value !== "1"/,
  );
});
