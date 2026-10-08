import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  "app/api/admin/diagnostics/vercel-geo/route.ts",
  "utf8",
);

test("Vercel geo diagnostic is gated by the existing SUPER_ADMIN authorization", () => {
  assert.match(route, /import \{ requireSuperAdmin \} from "@\/lib\/auth\/context"/);
  assert.match(
    route,
    /try \{\s*await requireSuperAdmin\(\);\s*\} catch \{[\s\S]*status: 403/,
  );
  assert.match(route, /"Cache-Control": "no-store"/);
});

test("Vercel geo diagnostic returns only the explicit geolocation allowlist", () => {
  const expectedHeaders = [
    "x-vercel-ip-city",
    "x-vercel-ip-country-region",
    "x-vercel-ip-country",
    "x-vercel-ip-postal-code",
    "x-vercel-ip-latitude",
    "x-vercel-ip-longitude",
    "x-vercel-ip-timezone",
    "x-vercel-ip-continent",
  ];
  const consumedHeaders = [
    ...route.matchAll(/request\.headers\.get\("([^"]+)"\)/g),
  ].map((match) => match[1]);

  assert.deepEqual(consumedHeaders, expectedHeaders);
  assert.deepEqual(
    [...route.matchAll(/^\s{6}(\w+): request\.headers\.get/gm)].map(
      (match) => match[1],
    ),
    [
      "city",
      "region",
      "country",
      "postalCode",
      "latitude",
      "longitude",
      "timezone",
      "continent",
    ],
  );
  assert.doesNotMatch(route, /x-forwarded-for|x-real-ip|x-vercel-forwarded-for/i);
  assert.doesNotMatch(route, /Object\.fromEntries|headers\.entries|headers\.forEach/);
});

test("Vercel geo diagnostic has no persistence, analytics, or logging side effects", () => {
  assert.doesNotMatch(
    route,
    /createClient|createAdminClient|\.from\(|\.rpc\(|insert\(|update\(|upsert\(|delete\(/,
  );
  assert.doesNotMatch(route, /console\.|analytics_page_views|record_analytics/);
  assert.doesNotMatch(
    route,
    /cookie|authorization|claim|session|token|customer/i,
  );
});
