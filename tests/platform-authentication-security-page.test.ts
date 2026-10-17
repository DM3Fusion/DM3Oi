import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  "app/admin/authentication-security/page.tsx",
  "utf8",
);

const navigation = readFileSync(
  "lib/application-navigation.ts",
  "utf8",
);

const repository = readFileSync(
  "lib/data/platform-authentication-security-repository.ts",
  "utf8",
);

test("Authentication Security is included in platform navigation", () => {
  assert.match(
    navigation,
    /href: "\/admin\/authentication-security", label: "Authentication Security"/,
  );
});

test("Authentication Security uses the established platform page header", () => {
  assert.match(page, /<PageHeader/);
  assert.match(page, /title="Authentication Security"/);
  assert.match(page, /eyebrow="Platform Administration"/);
});

test("Events page uses the secured repository", () => {
  assert.match(page, /getPlatformAuthenticationSecurityEvents/);
  assert.match(repository, /await requireSuperAdmin\(\)/);
});

test("Events page supports event-type filtering", () => {
  assert.match(page, /name="eventType"/);
  assert.match(page, /AUTHENTICATION_SECURITY_EVENT_TYPES\.map/);
});

test("Events page supports user filtering", () => {
  assert.match(page, /name="userId"/);
  assert.match(page, /userId: query\.userId/);
});

test("Events page supports date-range filtering", () => {
  assert.match(page, /name="start"/);
  assert.match(page, /name="end"/);
  assert.match(page, /endExclusive: dateBoundary\(query\.end, true\)/);
});

test("Events page validates calendar dates", () => {
  assert.match(page, /Invalid authentication security date/);
  assert.match(page, /date\.toISOString\(\)\.slice\(0, 10\)/);
});

test("Events page displays timestamps in Eastern Time", () => {
  assert.match(page, /timeZone: "America\/New_York"/);
  assert.match(page, /Timestamp \(ET\)/);
});

test("Events page labels network geography as approximate", () => {
  assert.match(page, /Network locations are approximate/);
  assert.match(page, /not GPS locations/);
});

test("Events page delegates details to its interactive table", () => {
  assert.match(page, /AuthenticationSecurityEventsTable/);
  assert.match(page, /events=\{result\.events\}/);
});

test("Events page supports cursor pagination", () => {
  assert.match(page, /beforeOccurredAt: query\.before/);
  assert.match(page, /beforeEventId: query\.beforeId/);
  assert.match(page, /result\.nextCursor/);
  assert.match(page, /Next 50 Events/);
});

test("Events page does not use service-role database access", () => {
  assert.doesNotMatch(page, /createAdminClient/);
  assert.doesNotMatch(page, /@\/lib\/supabase\/admin/);
});

test("Events page remains separate from Platform Analytics", () => {
  assert.doesNotMatch(page, /getPlatformAnalytics/);
  assert.doesNotMatch(page, /platform-analytics-repository/);
});


test("interactive event table provides four columns and a details modal", () => {
  const component = readFileSync(
    "components/platform/authentication-security-events-table.tsx",
    "utf8",
  );

  assert.match(component, /Timestamp \(ET\)/);
  assert.match(component, /Network Location/);
  assert.match(component, /authentication-security-event-dialog/);
  assert.match(component, /showModal\(\)/);
  assert.match(component, /selected\.device_category/);
  assert.match(component, /selected\.browser/);
  assert.match(component, /selected\.operating_system/);
  assert.doesNotMatch(component, /<th>User<\/th>/);
  assert.doesNotMatch(component, /<th>Device<\/th>/);
  assert.doesNotMatch(component, /<th>Browser \/ OS<\/th>/);
});
