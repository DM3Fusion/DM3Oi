import test from "node:test";
import assert from "node:assert/strict";
import { effectiveLicense, daysRemaining, LICENSE_WARNING_DAYS, organizationLicenseAccessAllowed, formatDateTimeLocal } from "../lib/licensing.ts";
import { readFileSync } from "node:fs";
const now = new Date("2026-01-01T00:00:00Z");
const base = { status: "ACTIVE" as const, commercialState: "PAID" as const, startsAt: null, expiresAt: "2026-01-11T00:00:00Z", graceEndsAt: "2026-01-15T00:00:00Z" };
test("commercial state is independent from entitlement", () => { for (const commercialState of ["PAID", "COMP", "UNPAID", "INTERNAL"] as const) assert.equal(effectiveLicense({ ...base, commercialState }, now).workspaceAllowed, true); });
test("expiration, warning, grace, suspension and cancellation are enforced", () => { assert.equal(daysRemaining(base.expiresAt, now), 10); assert.equal(effectiveLicense({ ...base, expiresAt: "2026-02-01T00:00:00Z" }, now).status, "ACTIVE"); assert.equal(effectiveLicense(base, now).status, "EXPIRING"); assert.equal(effectiveLicense({ ...base, expiresAt: "2025-12-30T00:00:00Z" }, now).isInGrace, true); assert.equal(effectiveLicense({ ...base, expiresAt: "2025-12-01T00:00:00Z", graceEndsAt: "2025-12-10T00:00:00Z" }, now).workspaceAllowed, false); assert.equal(effectiveLicense({ ...base, status: "SUSPENDED" }, now).workspaceAllowed, false); assert.equal(effectiveLicense({ ...base, status: "CANCELLED" }, now).workspaceAllowed, false); });
test("notice thresholds are prepared for 06B", () => assert.deepEqual(LICENSE_WARNING_DAYS, [60,30,14,7,3,1]));
test("missing license is rollout-compatible but not a commercial state", () => { assert.equal(organizationLicenseAccessAllowed("ACTIVE", null), true); assert.equal(effectiveLicense(null).workspaceAllowed, false); });
test("organization lifecycle takes precedence and SUPER_ADMIN remains allowed", () => { const blocked = effectiveLicense({ ...base, status: "SUSPENDED" }); assert.equal(organizationLicenseAccessAllowed("SUSPENDED", blocked), false); assert.equal(organizationLicenseAccessAllowed("ARCHIVED", blocked), false); assert.equal(organizationLicenseAccessAllowed("ARCHIVED", blocked, true), true); });
test("license mutation is audited, transactional, and current-row constrained", () => { const sql = readFileSync("supabase/migrations/20260904070000_dm3iqcm_licensing.sql", "utf8"); assert.match(sql, /organization_licenses_one_current/); assert.match(sql, /organization_license_events/); assert.match(sql, /not public\.is_super_admin/); assert.match(sql, /expiration precedes start/); assert.match(sql, /grace precedes expiration/); });
test("database timestamps round-trip to datetime-local values", () => { assert.equal(formatDateTimeLocal("2026-09-04T16:00:00.000Z"), "2026-09-04T16:00"); assert.equal(formatDateTimeLocal(null), ""); });
test("successful save requires authoritative read-back", () => { const action=readFileSync("lib/data/license-actions.ts", "utf8"); assert.match(action, /write could not be verified/); assert.match(action, /is_current/); });
test("licensing read permissions grant SELECT only to authenticated and retain RLS", () => { const sql=readFileSync("supabase/migrations/20260904090000_dm3iqcm_fix_licensing_read_permissions.sql", "utf8"); assert.match(sql,/grant select.*to authenticated/); assert.match(sql,/revoke insert, update, delete/); const base=readFileSync("supabase/migrations/20260904070000_dm3iqcm_licensing.sql","utf8"); assert.match(base,/is_super_admin\(\) or public\.is_internal_member\(organization_id\)/); });
test("license plan is a controlled select with approved values", () => { const form = readFileSync("components/license-form.tsx", "utf8"); assert.match(form, /name=\"planCode\"/); for (const plan of ["STANDARD","ENTERPRISE","INTERNAL"]) assert.match(form, new RegExp(plan)); });
test("organization avatar upload is exposed once in the top action row", () => { const page = readFileSync("app/admin/organizations/[organizationId]/page.tsx", "utf8"); assert.match(page, /showRemove=\{false\}/); assert.match(page, /showUpload=\{false\}/); });

test("Trial Request conversion atomically creates a 30-day Standard trial", () => {
  const sql = readFileSync(
    "supabase/migrations/20260925130000_dm3oi_trial_conversion_license.sql",
    "utf8",
  );

  assert.match(
    sql,
    /trial_started_at timestamptz := now\(\)/,
  );
  assert.match(
    sql,
    /'TRIAL',[\s\S]*?'TRIAL',[\s\S]*?'STANDARD',[\s\S]*?trial_started_at,[\s\S]*?trial_started_at \+ interval '30 days'/,
  );
  assert.match(sql, /'TRIAL_STARTED'/);
  assert.match(
    sql,
    /create or replace function public\.convert_trial_request_to_organization/,
  );
});

test("converted Trial organizations without a current license receive historical 30-day trials", () => {
  const sql = readFileSync(
    "supabase/migrations/20260925130000_dm3oi_trial_conversion_license.sql",
    "utf8",
  );

  assert.match(
    sql,
    /trial\.converted_at \+ interval '30 days'/,
  );
  assert.match(
    sql,
    /trial\.status = 'CONVERTED'/,
  );
  assert.match(
    sql,
    /not exists \([\s\S]*?select 1[\s\S]*?from public\.organization_licenses existing[\s\S]*?where existing\.organization_id = organization\.id[\s\S]*?and existing\.is_current/,
  );
});
