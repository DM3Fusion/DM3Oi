import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path: string) {
  return fs.readFileSync(path, "utf8");
}

const migration = source(
  "supabase/migrations/20261009230000_dm3oi_authentication_audit.sql",
);
const authActions = source("lib/auth/actions.ts");
const auditService = source("lib/data/authentication-audit.ts");
const analyticsRepository = source(
  "lib/data/platform-analytics-repository.ts",
);

test("successful OTP verification is durably audited before access routing", () => {
  assert.match(
    authActions,
    /verifyOtp\(\{email,token,type:"email"\}\)/,
  );
  assert.match(
    authActions,
    /recordSuccessfulAuthentication\(authenticatedUserId\)/,
  );

  assert.ok(
    authActions.indexOf("recordSuccessfulAuthentication") <
      authActions.indexOf("verify_my_membership_invitation"),
  );
});

test("authentication audit fails closed when the forensic write fails", () => {
  assert.match(
    authActions,
    /recordSuccessfulAuthentication\(authenticatedUserId\)[\s\S]*auth\.signOut\(\)[\s\S]*sign-in could not be securely recorded/,
  );
});

test("authentication audit writer is server-only and service-role backed", () => {
  assert.match(auditService, /import "server-only"/);
  assert.match(auditService, /createAdminClient/);
  assert.match(
    auditService,
    /rpc\(\s*"record_authentication_event"/,
  );

  assert.match(
    migration,
    /if auth\.role\(\) <> 'service_role'/,
  );
  assert.match(
    migration,
    /grant execute on function public\.record_authentication_event\(uuid\)\s+to service_role/,
  );
  assert.match(
    migration,
    /revoke all on function public\.record_authentication_event\(uuid\)\s+from public, anon, authenticated/,
  );
});

test("authentication events preserve immutable forensic snapshots", () => {
  assert.match(
    migration,
    /create table public\.authentication_events/,
  );
  assert.match(migration, /email_snapshot text/);
  assert.match(migration, /display_name_snapshot text/);
  assert.match(migration, /access_type_snapshot text not null/);
  assert.match(migration, /role_snapshot text/);
  assert.match(migration, /organization_id_snapshot uuid/);
  assert.match(migration, /organization_name_snapshot text/);

  assert.match(
    migration,
    /create trigger authentication_events_immutable[\s\S]*before update or delete/,
  );
  assert.match(
    migration,
    /authentication audit events are immutable/,
  );
});

test("database derives access classification instead of accepting browser snapshots", () => {
  const writerStart = migration.indexOf(
    "create or replace function public.record_authentication_event",
  );
  const writerEnd = migration.indexOf(
    "create or replace function public.get_platform_authentication_audit",
  );
  const writer = migration.slice(writerStart, writerEnd);

  assert.match(writer, /public\.is_super_admin\(target_user_id\)/);
  assert.match(writer, /public\.organization_members/);
  assert.match(writer, /public\.customer_portal_users/);
  assert.match(writer, /auth\.users/);

  assert.doesNotMatch(
    writer,
    /target_role_snapshot|target_access_type_snapshot|target_email_snapshot/,
  );
});

test("Platform Analytics uses sign-in audit independently of page-view analytics", () => {
  assert.match(
    analyticsRepository,
    /get_platform_authentication_audit/,
  );
  assert.match(
    analyticsRepository,
    /signIns: Number\(auditRow\.signIns/,
  );
  assert.match(
    analyticsRepository,
    /pageViews: Number\(activityRow\?\.pageViews \?\? 0\)/,
  );
  assert.match(
    analyticsRepository,
    /lastSignIn: auditRow\.lastSignIn/,
  );
});
