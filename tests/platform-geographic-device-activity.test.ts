import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  GEOGRAPHIC_ALL_LOCATIONS,
  GEOGRAPHIC_DEVICE_COLORS,
  GEOGRAPHIC_RADIUS_CENTER,
  GEOGRAPHIC_RADIUS_OPTIONS,
  geographicMarkerDiameter,
  geographicPointsForRadius,
  summarizeGeographicPoints,
} from "../lib/platform-geographic-map.ts";

const migration = readFileSync(
  "supabase/migrations/20261019120000_dm3oi_platform_geographic_device_activity.sql",
  "utf8",
);
const geography = readFileSync(
  "components/platform/platform-geography.tsx",
  "utf8",
);
const dashboard = readFileSync(
  "components/platform/platform-dashboard.tsx",
  "utf8",
);
const historyModal = readFileSync(
  "components/platform/geographic-location-history-modal.tsx",
  "utf8",
);
const geographicMap = readFileSync(
  "components/platform/geographic-device-map.tsx",
  "utf8",
);
const globalStyles = readFileSync("app/globals.css", "utf8");

function functionBody(name: string): string {
  const start = migration.indexOf(`create function public.${name}(`);
  assert.notEqual(start, -1, `Missing function: ${name}`);

  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `Missing function terminator: ${name}`);

  return migration.slice(start, end);
}

const activity = functionBody("get_platform_geographic_device_activity");
const history = functionBody("get_platform_geographic_location_history");

test("both RPCs require SUPER_ADMIN authorization", () => {
  for (const body of [activity, history]) {
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = ''/i);
    assert.match(body, /auth\.uid\(\)/);
    assert.match(body, /public\.is_super_admin\(actor\)/);
    assert.match(body, /errcode = '42501'/);
  }
});

test("both RPCs enforce the trusted analytics baseline", () => {
  for (const body of [activity, history]) {
    assert.match(body, /platform_analytics_trusted_baseline/);
    assert.match(body, /trusted_data_started_at/);
    assert.match(body, /greatest\(/);
    assert.match(body, /created_at >= effective_start/);
    assert.match(body, /created_at < target_end_exclusive/);
  }
});

test("map aggregates device activity without exposing identities", () => {
  assert.match(activity, /from public\.analytics_page_views/);

  for (const device of ["DESKTOP", "MOBILE", "TABLET", "OTHER"]) {
    assert.ok(activity.includes(`device_type = '${device}'`));
  }

  assert.match(activity, /group by/);
  assert.match(activity, /network_latitude/);
  assert.match(activity, /network_longitude/);
  assert.match(activity, /unknownCoordinatePageViews/);

  assert.doesNotMatch(activity, /\buser_id\b/);
  assert.doesNotMatch(activity, /\borganization_id\b/);
  assert.doesNotMatch(activity, /\bemail\b/);
});

test("Location History validates coordinates and pagination", () => {
  assert.match(history, /target_latitude not between -90 and 90/);
  assert.match(history, /target_longitude not between -180 and 180/);
  assert.match(history, /target_limit > 100/);
  assert.match(history, /target_offset < 0/);
  assert.match(history, /target_offset > 100000/);
  assert.match(history, /errcode = '22023'/);
});

test("Location History returns page views in descending order", () => {
  assert.match(history, /normalized_path/);
  assert.match(history, /device_type/);
  assert.match(history, /created_at desc, id desc/);
  assert.match(history, /limit effective_limit/);
  assert.match(history, /offset target_offset/);

  assert.doesNotMatch(history, /\buser_id\b/);
  assert.doesNotMatch(history, /\borganization_id\b/);
  assert.doesNotMatch(history, /\bemail\b/);
});

test("RPC execution is granted only to authenticated users", () => {
  for (const name of [
    "get_platform_geographic_device_activity",
    "get_platform_geographic_location_history",
  ]) {
    const section = migration.slice(
      migration.indexOf(`revoke all on function\n  public.${name}`),
    );

    assert.match(section, /from public, anon, authenticated;/);
    assert.match(section, /to authenticated;/);
  }
});

test("migration preserves existing analytics data", () => {
  assert.doesNotMatch(
    migration,
    /\b(drop table|truncate|delete from|update public\.analytics_page_views)\b/i,
  );

  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
});

test("Location History can select from the loaded location breakdown", () => {
  assert.match(geography, /points=\{activity\.points\}/);
  assert.match(geography, /onSelectLocation=\{setSelectedLocation\}/);

  assert.match(historyModal, /Device Usage by Location/);
  assert.match(historyModal, /points\.map\(\(location\) =>/);
  assert.match(historyModal, /aria-pressed=\{selected\}/);
  assert.match(historyModal, /setOffset\(0\)/);
  assert.match(historyModal, /onSelectLocation\(nextPoint\)/);
});

test("Location History ignores stale location responses", () => {
  assert.match(historyModal, /const requestId = \+\+requestIdRef\.current/);
  assert.match(
    historyModal,
    /requestId === requestIdRef\.current/,
  );
  assert.match(historyModal, /setHistory\(null\)/);
});

test("Platform Analytics follows the approved compact section order", () => {
  const sections = [
    'admin-analytics-panel admin-analytics-traffic',
    "<PlatformGeography",
    'admin-analytics-panel admin-analytics-composition',
    "<DeviceSummary",
    "<PlatformAnalyticsDetails",
    "<AdminTopPages",
  ].map((marker) => dashboard.indexOf(marker));

  assert.ok(sections.every((index) => index >= 0));
  assert.deepEqual(sections, [...sections].sort((left, right) => left - right));
});

test("geography uses a heading radius control and compact radius summary", () => {
  assert.match(geography, /platform-geography-radius-control/);
  assert.match(geography, /GEOGRAPHIC_RADIUS_OPTIONS\.map/);
  assert.match(geography, /Views inside radius/);
  assert.match(geography, /Views across all locations/);
  assert.match(geography, /All Locations/);
  assert.match(geography, /radius=\{radius\}/);
});

test("geography offers every approved radius and All Locations", () => {
  assert.deepEqual(GEOGRAPHIC_RADIUS_OPTIONS, [
    25,
    50,
    75,
    100,
    250,
    500,
    1000,
    GEOGRAPHIC_ALL_LOCATIONS,
  ]);
});

test("map uses the 3DCM dashed radius boundary and boundary framing", () => {
  assert.match(geographicMap, /dashArray: "7 6"/);
  assert.match(geographicMap, /weight: 2/);
  assert.match(geographicMap, /opacity: 0\.78/);
  assert.match(geographicMap, /fillOpacity: 0\.045/);
  assert.match(
    geographicMap,
    /if \(boundary\) \{[\s\S]*fitBounds\(boundary\.getBounds\(\), \{[\s\S]*padding: \[18, 18\]/,
  );
});

test("All Locations hides the boundary and frames every valid point", () => {
  assert.match(
    geographicMap,
    /const boundary = radius === GEOGRAPHIC_ALL_LOCATIONS[\s\S]*\? null[\s\S]*: leaflet\.circle/,
  );
  assert.match(
    geographicMap,
    /const pointBounds = leaflet\.latLngBounds\([\s\S]*visiblePoints\.map/,
  );
  assert.match(
    geographicMap,
    /fitBounds\(pointBounds, \{[\s\S]*padding: \[18, 18\][\s\S]*maxZoom: 10/,
  );
  assert.match(
    geographicMap,
    /leafletMap\.setView\(center, 8, \{ animate: false \}\)/,
  );
});

test("map renders individual offset device markers without clusters", () => {
  assert.match(geographicMap, /const activeDevices = GEOGRAPHIC_DEVICES\.filter/);
  assert.match(geographicMap, /for \(const device of activeDevices\)/);
  assert.match(geographicMap, /leaflet\.divIcon\(/);
  assert.match(geographicMap, /leaflet\.marker\(/);
  assert.match(geographicMap, /markerOffset\(device, activeDevices\.length > 1\)/);
  assert.doesNotMatch(geographicMap, /markerCluster|clusterGroup|cluster bubble/i);
  assert.doesNotMatch(
    geographicMap,
    /html:.*(?:pageViews|toLocaleString)/,
  );
});

test("map matches 3DCM marker sizing, borders, and device colors", () => {
  assert.equal(geographicMarkerDiameter(1), 16);
  assert.equal(geographicMarkerDiameter(4), 21);
  assert.equal(geographicMarkerDiameter(1_000_000), 34);

  assert.deepEqual(GEOGRAPHIC_DEVICE_COLORS, {
    desktop: "#2f4a6f",
    mobile: "#c99a4e",
    tablet: "#2f7d5b",
    other: "#8a4f7d",
    unknown: "#7b8794",
  });

  assert.match(globalStyles, /\.platform-geographic-marker-dot \{[\s\S]*border: 2px solid #fff;[\s\S]*border-radius: 50%;/);
  assert.match(globalStyles, /\.platform-geographic-marker-desktop[\s\S]*background: #2f4a6f;/);
  assert.match(globalStyles, /\.platform-geographic-marker-mobile[\s\S]*background: #c99a4e;/);
  assert.match(globalStyles, /\.platform-geographic-marker-tablet[\s\S]*background: #2f7d5b;/);
  assert.match(globalStyles, /\.platform-geographic-marker-other[\s\S]*background: #8a4f7d;/);
  assert.match(globalStyles, /\.platform-geographic-marker-unknown[\s\S]*background: #7b8794;/);
});

test("radius selection filters markers and preserves location history clicks", () => {
  assert.match(
    geographicMap,
    /const visiblePoints = geographicPointsForRadius\(points, radius\)/,
  );
  assert.match(
    geographicMap,
    /marker\.on\("click", \(\) => selectLocationRef\.current\(point\)\)/,
  );
  assert.match(
    geographicMap,
    /event\.key !== "Enter" && event\.key !== " "/,
  );
  assert.match(geography, /onSelectLocation=\{setSelectedLocation\}/);
  assert.match(geography, /<GeographicLocationHistoryModal/);
});

test("every numeric radius filters from ZIP 20613 and All Locations includes all valid points", () => {
  const points = [10, 40, 60, 90, 200, 400, 800, 1200].map(
    (distanceMiles, index) => ({
      id: index,
      latitude:
        GEOGRAPHIC_RADIUS_CENTER.latitude + distanceMiles / 69,
      longitude: GEOGRAPHIC_RADIUS_CENTER.longitude,
    }),
  );

  const expectedCounts = new Map([
    [25, 1],
    [50, 2],
    [75, 3],
    [100, 4],
    [250, 5],
    [500, 6],
    [1000, 7],
  ] as const);

  for (const [radius, expectedCount] of expectedCounts) {
    assert.equal(
      geographicPointsForRadius(points, radius).length,
      expectedCount,
    );
  }

  const invalidPoints = [
    { id: 8, latitude: Number.NaN, longitude: -76 },
    { id: 9, latitude: 0, longitude: 0 },
    { id: 10, latitude: 91, longitude: -76 },
  ];

  assert.deepEqual(
    geographicPointsForRadius(
      [...points, ...invalidPoints],
      GEOGRAPHIC_ALL_LOCATIONS,
    ).map((point) => point.id),
    points.map((point) => point.id),
  );
});

test("radius summaries use only selected points and retain unknown devices", () => {
  const summary = summarizeGeographicPoints([
    {
      pageViews: 12,
      desktop: 5,
      mobile: 3,
      tablet: 1,
      other: 1,
      unknown: 2,
    },
    {
      pageViews: 8,
      desktop: 1,
      mobile: 4,
      tablet: 2,
      other: 1,
      unknown: 0,
    },
  ]);

  assert.deepEqual(summary, {
    pageViews: 20,
    desktop: 6,
    mobile: 7,
    tablet: 3,
    other: 4,
  });
  assert.match(geography, /activity\.unknownCoordinatePageViews/);
});
