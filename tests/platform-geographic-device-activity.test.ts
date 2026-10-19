import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261019120000_dm3oi_platform_geographic_device_activity.sql",
  "utf8",
);
const geography = readFileSync(
  "components/platform/platform-geography.tsx",
  "utf8",
);
const historyModal = readFileSync(
  "components/platform/geographic-location-history-modal.tsx",
  "utf8",
);

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
