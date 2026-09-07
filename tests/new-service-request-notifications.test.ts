import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = source(
  "supabase/migrations/20260907120000_dm3oi_new_service_request_notifications.sql",
);
const communicationsMigration = source(
  "supabase/migrations/20260904230000_dm3iqcm_communications_center.sql",
);

test("every Service Request creation path emits through the shared notification architecture", () => {
  assert.match(migration, /after insert on public\.service_requests/);
  assert.match(migration, /public\.create_notification\(/);
  assert.match(migration, /'NEW_SERVICE_REQUEST_RECEIVED'/);
  assert.match(migration, /'New service request received'/);
  assert.match(
    migration,
    /customer_name \|\| ' submitted ' \|\| new\.request_number \|\| ': ' \|\| new\.subject/,
  );
  assert.match(migration, /'SERVICE_REQUEST',\s*new\.id,\s*new\.id/);
  assert.match(migration, /'\/service-desk\/' \|\| new\.id::text/);
  assert.match(
    communicationsMigration,
    /unique \(organization_id, recipient_user_id, notification_type, source_domain, source_event_id\)/,
  );
  assert.match(
    communicationsMigration,
    /on conflict \(organization_id,recipient_user_id,notification_type,source_domain,source_event_id\)/,
  );
});

test("assigned requests notify only their authorized assigned internal recipient", () => {
  assert.match(migration, /m\.organization_id = new\.organization_id/);
  assert.match(migration, /m\.user_id = new\.assigned_user_id/);
  assert.match(migration, /'VIEW_SERVICE_DESK'/);
  assert.match(migration, /'VIEW_COMMUNICATIONS'/);
  assert.match(migration, /join public\.profiles p[\s\S]*p\.is_active/);
  assert.match(
    migration,
    /m\.role in \('BUSINESS_OWNER', 'BUSINESS_ADMIN', 'STAFF_MANAGER', 'STAFF_USER'\)/,
  );
});

test("unassigned requests reach effective Service Desk managers without notifying an internal creator", () => {
  assert.match(
    migration,
    /new\.assigned_user_id is null[\s\S]*'MANAGE_SERVICE_REQUEST'/,
  );
  assert.match(
    migration,
    /new\.requester_user_id is not null\s*or m\.user_id is distinct from new\.created_by_user_id/,
  );
  const portalSubmission = source(
    "supabase/migrations/20260904140000_dm3iqcm_customer_service_request_submission.sql",
  );
  assert.match(
    portalSubmission,
    /requester_user_id,created_by_user_id[\s\S]*assigned_user_id[\s\S]*values\([\s\S]*actor,actor[\s\S]*'NEW','NORMAL',null/,
  );
});

test("notification creation remains tenant-safe, staff-only, and platform-private", () => {
  assert.match(migration, /not public\.is_super_admin\(m\.user_id\)/);
  assert.doesNotMatch(migration, /customer_portal_users/);
  assert.doesNotMatch(migration, /grant .*notifications/i);
  assert.doesNotMatch(migration, /create policy|alter table .*disable row level security/i);
  assert.match(
    communicationsMigration,
    /recipient_user_id=auth\.uid\(\)[\s\S]*public\.is_internal_member\(organization_id\)/,
  );
  assert.match(
    communicationsMigration,
    /revoke all on public\.notifications from public,anon,authenticated/,
  );
});

test("Communications automatically supplies inbox, badge, filters, and existing reply events", () => {
  const repository = source("lib/data/communications-repository.ts");
  const page = source("app/communications/page.tsx");
  const shell = source("components/layout/app-shell.tsx");
  assert.match(repository, /source_domain", "SERVICE_REQUEST"/);
  assert.match(repository, /title\.ilike/);
  assert.match(repository, /filters\.createdAfter/);
  assert.match(repository, /getUnreadNotificationCount/);
  assert.match(repository, /!notification\.read_at/);
  assert.match(page, /openNotificationAction/);
  assert.match(shell, /nav-unread-count/);
  assert.match(
    communicationsMigration,
    /'CUSTOMER_RESPONSE_RECEIVED'[\s\S]*'Customer response received'/,
  );
  assert.match(
    communicationsMigration,
    /service_request_customer_message_notification/,
  );
});
