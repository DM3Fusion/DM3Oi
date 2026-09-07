import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = source(
  "supabase/migrations/20260907124500_dm3oi_correct_new_service_request_recipient_selection.sql",
);
const originalMigration = source(
  "supabase/migrations/20260907120000_dm3oi_new_service_request_notifications.sql",
);
const communicationsMigration = source(
  "supabase/migrations/20260904230000_dm3iqcm_communications_center.sql",
);
const databaseRegression = source(
  "supabase/tests/new_service_request_notifications.sql",
);

test("every Service Request creation path emits through the shared notification architecture", () => {
  assert.match(originalMigration, /after insert on public\.service_requests/);
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
  const assignedBranch = migration.match(
    /if new\.assigned_user_id is not null then([\s\S]*?)\n  else/,
  )?.[1] ?? "";
  assert.ok(assignedBranch);
  assert.match(assignedBranch, /m\.user_id = new\.assigned_user_id/);
  assert.doesNotMatch(assignedBranch, /MANAGE_SERVICE_REQUEST/);
  assert.doesNotMatch(assignedBranch, /created_by_user_id/);
  assert.match(migration, /m\.organization_id = new\.organization_id/);
  assert.match(migration, /'VIEW_SERVICE_DESK'/);
  assert.match(migration, /'VIEW_COMMUNICATIONS'/);
  assert.match(migration, /join public\.profiles p[\s\S]*p\.is_active/);
  assert.match(
    migration,
    /m\.role in \('BUSINESS_OWNER', 'BUSINESS_ADMIN', 'STAFF_MANAGER', 'STAFF_USER'\)/,
  );
});

test("assignment is authoritative for every supported internal role", () => {
  for (const role of [
    "BUSINESS_OWNER",
    "BUSINESS_ADMIN",
    "STAFF_MANAGER",
    "STAFF_USER",
  ]) {
    assert.match(migration, new RegExp(`'${role}'`));
  }
  assert.match(migration, /if new\.assigned_user_id is not null then/);
  assert.match(migration, /select m\.user_id[\s\S]*m\.user_id = new\.assigned_user_id/);
  assert.doesNotMatch(
    migration.match(/if new\.assigned_user_id is not null then([\s\S]*?)\n  else/)?.[1] ?? "",
    /select distinct|BUSINESS_OWNER'[\s\S]*MANAGE_SERVICE_REQUEST/,
  );
  for (const roleLabel of [
    "Assigned owner",
    "Assigned admin",
    "Assigned manager",
    "Assigned staff",
  ]) {
    assert.match(databaseRegression, new RegExp(roleLabel));
  }
  assert.match(databaseRegression, /self-assigned Business Owner is the sole recipient/);
  assert.match(databaseRegression, /assigned Business Admin is the sole recipient/);
  assert.match(databaseRegression, /assigned Staff Manager is the sole recipient/);
  assert.match(databaseRegression, /assigned Staff User is the sole recipient/);
});

test("unassigned requests reach effective Service Desk managers without notifying an internal creator", () => {
  const fallbackBranch = migration.match(/\n  else([\s\S]*?)\n  end if;/)?.[1] ?? "";
  assert.ok(fallbackBranch);
  assert.match(
    fallbackBranch,
    /'MANAGE_SERVICE_REQUEST'/,
  );
  assert.match(
    fallbackBranch,
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

test("internal assignment is written in the same INSERT that fires the notification trigger", () => {
  const action = source("lib/data/service-request-actions.ts");
  const form = source("components/service-request-form.tsx");
  const permissionMigration = source(
    "supabase/migrations/20260906120000_dm3oi_organization_role_permissions.sql",
  );
  assert.match(form, /name="assignedUserId"/);
  assert.match(action, /target_assigned_user_id: values\.assignedUserId \|\| null/);
  assert.match(
    permissionMigration,
    /insert into public\.service_requests\([\s\S]*?assigned_user_id[\s\S]*?\)\s*values\([\s\S]*?target_assigned_user_id[\s\S]*?\) returning \* into created/,
  );
  assert.doesNotMatch(
    permissionMigration.match(/create or replace function public\.create_service_request\([\s\S]*?return created;\nend \$\$;/)?.[0] ?? "",
    /set_service_request_assignment|update public\.service_requests set assigned_user_id/,
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
  assert.match(databaseRegression, /cross-tenant, platform, and portal identities are excluded/);
  assert.match(databaseRegression, /one logical notification exists per intended recipient and event/);
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
