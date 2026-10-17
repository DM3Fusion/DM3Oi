import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  "app/admin/authentication-security/page.tsx",
  "utf8",
);

const repository = readFileSync(
  "lib/data/platform-authentication-security-repository.ts",
  "utf8",
);

test("dashboard provides Events, Sessions, and Geography views", () => {
  assert.match(page, /view === "events"/);
  assert.match(page, /view === "sessions"/);
  assert.match(page, /view === "geography"/);

  assert.match(page, />\s*Events\s*<\/Link>/);
  assert.match(page, />\s*Sessions\s*<\/Link>/);
  assert.match(page, />\s*Geography\s*<\/Link>/);
});

test("Sessions view requires an explicitly supplied session UUID", () => {
  assert.match(page, /name="sessionId"/);
  assert.match(page, /placeholder="Session UUID"/);
  assert.match(page, /required/);
  assert.match(page, /sessionId\s*\?\s*await getPlatformAuthenticationSessionHistory/);
});

test("Sessions view uses the secured repository", () => {
  assert.match(page, /getPlatformAuthenticationSessionHistory/);
  assert.match(
    repository,
    /export async function getPlatformAuthenticationSessionHistory/,
  );
  assert.match(repository, /await requireSuperAdmin\(\)/);
});

test("Sessions view preserves session identity during pagination", () => {
  assert.match(page, /function buildSessionQuery/);
  assert.match(page, /sessionId,/);
  assert.match(page, /before: cursor\.occurredAt/);
  assert.match(page, /beforeId: cursor\.eventId/);
  assert.match(page, /Next 50 Session Events/);
});

test("Sessions view does not fabricate missing lifecycle events", () => {
  assert.match(page, /No recorded security events match this session UUID/);
  assert.doesNotMatch(page, /syntheticSessionEvents/);
  assert.doesNotMatch(page, /fabricatedEvents/);
});

test("Geography summarizes retrieved event records", () => {
  assert.match(page, /function summarizeGeography/);
  assert.match(page, /summarizeGeography\(result\.events\)/);
});

test("Geography groups by approximate network location", () => {
  assert.match(page, /event\.city/);
  assert.match(page, /event\.region_code/);
  assert.match(page, /event\.country_code/);
});

test("Geography counts events rather than users or sessions", () => {
  assert.match(
    page,
    /counts\.set\(location, \(counts\.get\(location\) \?\? 0\) \+ 1\)/,
  );
});

test("Geography handles missing location information", () => {
  assert.match(page, /Location unavailable/);
});

test("Geography clearly identifies page-limited results", () => {
  assert.match(page, /events retrieved on this page/);
  assert.match(page, /not an all-time/);
});

test("Geography identifies network locations as approximate", () => {
  assert.match(page, /approximate network/);
  assert.match(page, /not GPS positions/);
});

test("Geography retains its view during pagination", () => {
  assert.match(page, /query\.view === "geography"/);
  assert.match(page, /params\.set\("view", "geography"\)/);
});

test("Sessions and Geography do not use service-role reads", () => {
  assert.doesNotMatch(page, /createAdminClient/);
  assert.doesNotMatch(repository, /createAdminClient/);
});

test("authentication dashboard remains separate from Platform Analytics", () => {
  assert.doesNotMatch(page, /getPlatformAnalytics/);
  assert.doesNotMatch(page, /platform-analytics-repository/);
});
