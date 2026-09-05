import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatOrganizationDateTime, resolveUsZipTimeZone, startOfOrganizationDay } from "../lib/organization-timezone.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("US ZIP codes resolve to DST-aware IANA timezones", () => {
  assert.equal(resolveUsZipTimeZone("10001"), "America/New_York");
  assert.equal(resolveUsZipTimeZone("60601"), "America/Chicago");
  assert.equal(resolveUsZipTimeZone("80202"), "America/Denver");
  assert.equal(resolveUsZipTimeZone("94105"), "America/Los_Angeles");
  assert.equal(resolveUsZipTimeZone("not-a-zip"), null);
});

test("organization formatting is explicit, stable, and daylight-saving aware", () => {
  assert.equal(formatOrganizationDateTime("2026-09-05T22:08:00Z", "America/New_York"), "9/5/2026, 6:08 PM");
  assert.equal(formatOrganizationDateTime("2026-09-05T22:08:00Z", "America/New_York", "medium"), "Sep 5, 2026, 6:08 PM");
  assert.equal(formatOrganizationDateTime("2026-01-05T22:08:00Z", "America/New_York"), "1/5/2026, 5:08 PM");
  assert.equal(formatOrganizationDateTime("2026-09-05T22:08:00Z", "invalid/timezone"), "9/5/2026, 10:08 PM");
});

test("Today begins at midnight in the organization timezone", () => {
  assert.equal(startOfOrganizationDay(new Date("2026-09-06T02:00:00Z"), "America/New_York").toISOString(), "2026-09-05T04:00:00.000Z");
  assert.equal(startOfOrganizationDay(new Date("2026-01-06T02:00:00Z"), "America/New_York").toISOString(), "2026-01-05T05:00:00.000Z");
});

test("organization operational surfaces consume the shared timezone", () => {
  const communications = source("app/communications/page.tsx");
  const staff = source("app/service-desk/[serviceRequestId]/page.tsx");
  const portal = source("app/portal/service-requests/[serviceRequestId]/page.tsx");
  const cases = source("app/cases/[caseId]/page.tsx");
  const customers = source("app/customers/[customerId]/page.tsx");
  assert.match(communications, /formatOrganizationDateTime\(item\.created_at, timezone, "medium"\)/);
  assert.match(staff, /formatOrganizationDateTime\(message\.created_at,data\.timezone\)/);
  assert.match(portal, /formatOrganizationDateTime\(message\.created_at, timezone\)/);
  assert.match(cases, /formatOrganizationDateTime\(activity\.created_at, data\.timezone\)/);
  assert.match(customers, /formatOrganizationDateTime\(customer\.updated_at, settings\?\.timezone\)/);
});

test("timestamps remain timestamptz and date-only formatting remains UTC anchored", () => {
  const foundation = source("supabase/migrations/20260903150000_dm3iqcm_data_foundation.sql");
  const conversations = source("supabase/migrations/20260904180000_dm3iqcm_service_request_conversations.sql");
  const dateOnly = source("lib/format.ts");
  assert.match(foundation, /created_at timestamptz/);
  assert.match(conversations, /created_at timestamptz/);
  assert.match(dateOnly, /timeZone: "UTC"/);
});
