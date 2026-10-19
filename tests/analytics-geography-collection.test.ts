import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  analyticsGeographyFromHeaders,
  analyticsGeographyFromRequest,
  evaluateAnalyticsGeographyRequest,
  normalizeAnalyticsGeography,
} from "../lib/analytics-geography.ts";
import { logAnalyticsGeographyDiagnostic } from "../lib/analytics-geography-diagnostics.ts";

const source = (path: string) => readFileSync(path, "utf8");

const pageView = source("app/api/analytics/page-view/route.ts");
const interaction = source("app/api/analytics/interaction/route.ts");
const authentication = source(
  "lib/data/authentication-security-audit.ts",
);
const migration = source(
  "supabase/migrations/20261019170000_dm3oi_analytics_geography_source_alignment.sql",
);

test("supported Vercel request metadata has first precedence", () => {
  const headers = new Headers({
    "x-vercel-ip-city": "Vercel Header City",
    "x-vercel-ip-country-region": "VH",
    "x-vercel-ip-country": "VC",
    "x-vercel-ip-latitude": "10.1111",
    "x-vercel-ip-longitude": "-20.2222",
    "cf-ipcity": "Cloudflare City",
    "cf-region": "CF",
    "cf-ipcountry": "CC",
  });

  assert.deepEqual(
    normalizeAnalyticsGeography(headers, {
      city: "Provider City",
      countryRegion: "PM",
      country: "PC",
      latitude: "30.3333",
      longitude: "-40.4444",
      postalCode: "12345",
      timezone: "America/New_York",
    }),
    {
      city: "Provider City",
      region: "PM",
      country: "PC",
      postalCode: "12345",
      latitude: 30.33,
      longitude: -40.44,
      timezone: "America/New_York",
    },
  );
});

test("Next request extraction uses the supported Vercel request API", () => {
  const request = new Request("https://example.test", {
    headers: {
      "x-vercel-ip-city": "Request%20City",
      "x-vercel-ip-country-region": "RC",
      "x-vercel-ip-country": "US",
    },
  });

  assert.equal(analyticsGeographyFromRequest(request).city, "Request City");
});

test("Vercel headers precede Cloudflare fallback headers", () => {
  const geography = analyticsGeographyFromHeaders(new Headers({
    "x-vercel-ip-city": "Vercel%20City",
    "x-vercel-ip-country-region": "VR",
    "x-vercel-ip-country": "US",
    "x-vercel-ip-postal-code": "10001",
    "x-vercel-ip-latitude": "40.7128",
    "x-vercel-ip-longitude": "-74.0060",
    "x-vercel-ip-timezone": "America/New_York",
    "cf-ipcity": "Cloudflare City",
    "cf-region": "CR",
    "cf-ipcountry": "CA",
    "cf-postal-code": "A1A 1A1",
    "cf-iplatitude": "45.4215",
    "cf-iplongitude": "-75.6972",
    "cf-timezone": "America/Toronto",
  }));

  assert.deepEqual(geography, {
    city: "Vercel City",
    region: "VR",
    country: "US",
    postalCode: "10001",
    latitude: 40.71,
    longitude: -74.01,
    timezone: "America/New_York",
  });
});

test("Cloudflare headers supply every supported geographic fallback", () => {
  const geography = analyticsGeographyFromHeaders(new Headers({
    "cf-ipcity": "Montr%C3%A9al",
    "cf-region": "Quebec",
    "cf-ipcountry": "CA",
    "cf-postal-code": "H2Y%201C6",
    "cf-iplatitude": "45.5019",
    "cf-iplongitude": "-73.5674",
    "cf-timezone": "America/Toronto",
  }));

  assert.deepEqual(geography, {
    city: "Montréal",
    region: "Quebec",
    country: "CA",
    postalCode: "H2Y 1C6",
    latitude: 45.5,
    longitude: -73.57,
    timezone: "America/Toronto",
  });
});

test("missing geographic headers remain unknown rather than inferred", () => {
  assert.deepEqual(analyticsGeographyFromHeaders(new Headers()), {
    city: null,
    region: null,
    country: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    timezone: null,
  });
});

test("URI decoding and text normalization preserve provider labels", () => {
  const geography = analyticsGeographyFromHeaders(new Headers({
    "x-vercel-ip-city": "S%C3%A3o%20%20Paulo",
    "x-vercel-ip-country-region": " SP ",
    "x-vercel-ip-country": "BR",
  }));

  assert.equal(geography.city, "São Paulo");
  assert.equal(geography.region, "SP");
  assert.equal(geography.country, "BR");

  assert.equal(
    analyticsGeographyFromHeaders(new Headers({
      "x-vercel-ip-city": "%E0%A4%A",
    })).city,
    "%E0%A4%A",
  );
});

test("coordinates use field-specific validation and coarse precision", () => {
  assert.deepEqual(
    normalizeAnalyticsGeography(new Headers(), {
      latitude: "-0.004",
      longitude: "179.999",
    }),
    {
      city: null,
      region: null,
      country: null,
      postalCode: null,
      latitude: 0,
      longitude: 180,
      timezone: null,
    },
  );

  const invalid = normalizeAnalyticsGeography(new Headers(), {
    latitude: "90.0001",
    longitude: "-180.0001",
  });

  assert.equal(invalid.latitude, null);
  assert.equal(invalid.longitude, null);
});

test("page views persist normalized metadata through the guarded RPC", () => {
  assert.match(pageView, /evaluateAnalyticsGeographyRequest\(request\)/);

  for (const mapping of [
    "target_country_code: geography.country",
    "target_region_code: geography.region",
    "target_city: geography.city",
    "target_postal_code: geography.postalCode",
    "target_network_latitude: geography.latitude",
    "target_network_longitude: geography.longitude",
    "target_network_timezone: geography.timezone",
  ]) {
    assert.ok(pageView.includes(mapping));
  }
});

test("authorized diagnostics log sanitized candidates and per-field sources", () => {
  const token = "a".repeat(43);
  const request = new Request("https://example.test", {
    headers: {
      "x-analytics-geography-diagnostic-token": token,
      "x-vercel-id": "iad1::secret-request-suffix",
      "x-vercel-ip-city": "Arlington",
      "x-vercel-ip-country-region": "VA",
      "x-vercel-ip-country": "US",
      "x-vercel-ip-latitude": "38.8816",
      "x-vercel-ip-longitude": "-77.0910",
      "cf-ipcity": "Reston",
      "cf-region": "Virginia",
      "cf-ipcountry": "US",
      "cf-iplatitude": "38.9586",
      "cf-iplongitude": "-77.3570",
      cookie: "session=must-not-appear",
      authorization: "Bearer must-not-appear",
    },
  });
  const evaluation = evaluateAnalyticsGeographyRequest(request);
  const messages: Array<[string, string]> = [];

  const logged = logAnalyticsGeographyDiagnostic(
    request.headers,
    evaluation,
    {
      environment: {
        ANALYTICS_GEOGRAPHY_DIAGNOSTIC_TOKEN: token,
        ANALYTICS_GEOGRAPHY_DIAGNOSTIC_NOT_BEFORE: "2026-10-19T15:00:00.000Z",
        ANALYTICS_GEOGRAPHY_DIAGNOSTIC_EXPIRES_AT: "2026-10-19T17:00:00.000Z",
      },
      now: new Date("2026-10-19T16:00:00.000Z"),
      logger: (label, payload) => messages.push([label, payload]),
    },
  );

  assert.equal(logged, true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0][0], "ANALYTICS_GEOGRAPHY_DIAGNOSTIC");

  const payload = JSON.parse(messages[0][1]);
  assert.deepEqual(payload.selected, {
    city: "Arlington",
    region: "VA",
    country: "US",
    latitude: 38.88,
    longitude: -77.09,
  });
  assert.equal(payload.candidates.cloudflareHeadersUnverified.city, "Reston");
  assert.equal(payload.selectedSources.city, "vercel_adapter");
  assert.equal(payload.vercelIngressRegion, "iad1");

  const serialized = messages[0][1];
  assert.doesNotMatch(serialized, new RegExp(token));
  assert.doesNotMatch(serialized, /secret-request-suffix/);
  assert.doesNotMatch(serialized, /must-not-appear/);
});

test("diagnostics fail closed for invalid authorization and time windows", () => {
  const token = "b".repeat(43);
  const evaluation = evaluateAnalyticsGeographyRequest(new Request(
    "https://example.test",
    { headers: { "x-vercel-ip-city": "Clinton" } },
  ));
  const messages: Array<[string, string]> = [];
  const options = {
    environment: {
      ANALYTICS_GEOGRAPHY_DIAGNOSTIC_TOKEN: token,
      ANALYTICS_GEOGRAPHY_DIAGNOSTIC_NOT_BEFORE: "2026-10-19T15:00:00.000Z",
      ANALYTICS_GEOGRAPHY_DIAGNOSTIC_EXPIRES_AT: "2026-10-19T17:00:00.000Z",
    },
    now: new Date("2026-10-19T17:00:00.000Z"),
    logger: (label: string, payload: string) => messages.push([label, payload]),
  };

  assert.equal(logAnalyticsGeographyDiagnostic(new Headers({
    "x-analytics-geography-diagnostic-token": token,
  }), evaluation, options), false);
  assert.equal(logAnalyticsGeographyDiagnostic(new Headers({
    "x-analytics-geography-diagnostic-token": "wrong".repeat(11),
  }), evaluation, { ...options, now: new Date("2026-10-19T16:00:00.000Z") }), false);
  assert.equal(messages.length, 0);
});

test("the additive migration preserves old RPCs and stores timezone once", () => {
  assert.match(migration, /add column network_timezone text/);
  assert.match(migration, /target_network_timezone text/);
  assert.match(
    migration,
    /network_latitude,[\s\S]*network_longitude,[\s\S]*network_timezone/,
  );
  assert.match(
    migration,
    /grant execute on function public\.record_analytics_page_view_guarded[\s\S]*to service_role/,
  );
  assert.doesNotMatch(
    migration,
    /\b(drop table|truncate|delete from|update public\.analytics_page_views)\b/i,
  );
});

test("aggregation uses captured majority labels and preserves security", () => {
  assert.match(migration, /label_counts as/);
  assert.match(migration, /order by occurrences desc, label/);
  assert.match(migration, /preferred_labels as/);
  assert.doesNotMatch(migration, /reverse geocod|zipcodes|geocod/i);
  assert.match(migration, /public\.is_super_admin\(actor\)/);
  assert.match(migration, /platform_analytics_trusted_baseline/);
  assert.match(migration, /created_at >= effective_start/);
  assert.match(migration, /timezoneBreakdown/);
  assert.match(migration, /limit 8/);
});

test("interaction exclusions and authentication evidence share extraction", () => {
  assert.match(interaction, /analyticsGeographyFromRequest\(request\)/);
  assert.match(
    interaction,
    /isExcludedAnalyticsGeo\(\s*geography\.country,\s*geography\.region,\s*geography\.city/,
  );
  assert.match(authentication, /analyticsGeographyFromHeaders/);
  assert.match(authentication, /target_country_code: geography\.country/);
  assert.match(authentication, /target_region_code: geography\.region/);
  assert.match(authentication, /target_city: geography\.city/);
  assert.match(authentication, /createAdminClient/);
});

test("existing analytics exclusion and classification policies remain intact", () => {
  assert.match(pageView, /process\.env\.ANALYTICS_EXCLUDED_IPS/);
  assert.match(pageView, /bypassGeographicExclusion/);
  assert.match(pageView, /isExcludedAnalyticsGeo/);
  assert.match(pageView, /analyticsDeviceType/);
  assert.match(pageView, /analyticsTrafficClassification/);
  assert.match(pageView, /getOrCreateAnalyticsSessionId/);
});
