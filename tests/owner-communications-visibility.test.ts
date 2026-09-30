import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = source(
  "supabase/migrations/20260907130000_dm3oi_owner_organization_communications_visibility.sql",
);
const repository = source("lib/data/communications-repository.ts");
const page = source("app/communications/page.tsx");
const inbox = source("components/communications-inbox.tsx");
const filters = source("components/communications-filters.tsx");
const actions = source("lib/data/communications-actions.ts");
const permissionMigration = source(
  "supabase/migrations/20260906120000_dm3oi_organization_role_permissions.sql",
);
const databaseRegression = source(
  "supabase/tests/owner_communications_visibility.sql",
);

test("Business Owner receives organization-wide read access without global authenticated access", () => {
  assert.match(migration, /for select\s+to authenticated/);
  assert.match(migration, /array\['BUSINESS_OWNER'\]::public\.application_role\[\]/);
  assert.match(migration, /public\.has_effective_organization_permission\([\s\S]*organization_id,[\s\S]*'VIEW_COMMUNICATIONS'/);
  assert.match(migration, /public\.has_organization_role\([\s\S]*organization_id/);
  assert.match(migration, /not public\.is_super_admin\(recipient_user_id\)/);
  assert.doesNotMatch(migration, /grant (all|select).*notifications/i);
  assert.doesNotMatch(migration, /disable row level security/i);
});

test("repository broadens only Business Owners and SUPER_ADMIN in active organization context", () => {
  assert.match(repository, /context\.isSuperAdmin\s*\|\|\s*context\.activeOrganization\.role === "BUSINESS_OWNER"/);
  assert.match(repository, /\.eq\("organization_id", context\.activeOrganization\.id\)/);
  assert.match(repository, /if \(!organizationWide\) query = query\.eq\("recipient_user_id", context\.user\.id\)/);
  assert.match(repository, /get_organization_email_delivery_audit/);
  assert.match(repository, /if \(!includeEmailAudit\) return newestFirst/);
  assert.match(databaseRegression, /Business Owner sees Owner, Admin, Manager, and Staff notifications/);
  assert.match(databaseRegression, /Business Owner cannot see another organization/);
});

test("recipient names use profile display conventions without exposing email or platform identity", () => {
  assert.match(repository, /\.select\("id,display_name,first_name,last_name"\)/);
  assert.match(repository, /profile\.display_name \|\| \[profile\.first_name, profile\.last_name\]/);
  assert.doesNotMatch(repository, /\.select\("id,display_name,first_name,last_name,email"\)/);
  assert.match(inbox, /Recipient: \{item\.recipient_display_name\}/);
  assert.match(migration, /not public\.is_super_admin\(recipient_user_id\)/);
});

test("Owner observed rows do not present recipient unread state as the Owner's unread state", () => {
  assert.match(
    inbox,
    /item\.is_personal && !item\.read_at \? " unread" : ""/,
  );
  assert.match(
    inbox,
    /communication_kind === "EMAIL_DELIVERY"[\s\S]*return "Opened"/,
  );
  assert.match(inbox, /Email delivery\/open state is separate from Inbox read state/);
});

test("observed rows navigate without mutating another recipient's read state", () => {
  assert.match(inbox, /item\.is_personal \? \(/);
  assert.match(inbox, /<form action=\{openNotificationAction\}>/);
  assert.match(inbox, /<Link className="primary-button" href=\{communicationsDestination\(item\.destination_path\)\}>/);
  assert.match(inbox, /action=\{item\.read_at \? markNotificationUnreadAction : markNotificationReadAction\}/);
  assert.match(permissionMigration, /where n\.id=target_notification_id and n\.recipient_user_id=actor/);
  assert.match(permissionMigration, /recipient_user_id=actor and read_at is null and archived_at is null/);
  assert.match(databaseRegression, /Owner changed Staff notification state/);
  assert.match(databaseRegression, /Owner oversight does not mutate Staff read state/);
  assert.match(actions, /set_notification_read_state/);
});

test("Owner badge and mark-all behavior remain personal", () => {
  assert.match(repository, /getUnreadNotificationCount/);
  assert.match(repository, /get_my_unread_notification_count/);
  assert.match(
    repository,
    /target_organization_id:\s*organizationId/,
  );
  const unreadCountMigration = source(
    "supabase/migrations/20260930003000_dm3oi_notification_unread_count_rpc.sql",
  );
  assert.match(
    unreadCountMigration,
    /notification\.recipient_user_id = actor/,
  );
  assert.match(
    unreadCountMigration,
    /grant execute[\s\S]*to authenticated/,
  );
  assert.match(page, /Mark my notifications as read/);
  assert.match(permissionMigration, /mark_all_notifications_read[\s\S]*recipient_user_id=actor/);
});

test("status, source, date, search, and destination behavior remain intact", () => {
  assert.match(filters, /Recipient unread/);
  assert.match(filters, /Recipient read/);
  assert.match(repository, /filters\.status === "unread"/);
  assert.match(repository, /filters\.status === "read"/);
  assert.match(repository, /filters\.source === "service-request"/);
  assert.match(repository, /filters\.createdAfter/);
  assert.match(repository, /title\.ilike/);
  assert.match(inbox, /communicationsDestination\(item\.destination_path\)/);
  assert.match(inbox, /Recipient unread/);
});

test("other internal roles, portal users, and platform behavior remain constrained", () => {
  assert.match(databaseRegression, /Business Admin remains recipient scoped/);
  assert.match(databaseRegression, /Staff Manager remains recipient scoped/);
  assert.match(databaseRegression, /Staff User remains recipient scoped/);
  assert.match(databaseRegression, /Customer Portal identity cannot read internal Communications/);
  assert.match(databaseRegression, /SUPER_ADMIN recipient behavior remains personal/);
});


test("SUPER_ADMIN organization context can observe and target-delete exact communications", () => {
  const repository = source("lib/data/communications-repository.ts");
  const page = source("app/communications/page.tsx");
  const actions = source("lib/data/communications-actions.ts");
  const inbox = source("components/communications-inbox.tsx");
  const migration = source(
    "supabase/migrations/20260927133000_dm3oi_super_admin_targeted_communication_delete.sql",
  );

  assert.match(
    repository,
    /context\.isSuperAdmin\s*\|\|\s*context\.activeOrganization\.role === "BUSINESS_OWNER"/,
  );
  assert.match(
    page,
    /canDeleteCommunications=\{context\.isSuperAdmin\}/,
  );
  assert.match(
    actions,
    /requireSuperAdmin\(\)[\s\S]*activeOrganization\.id !== organizationId/,
  );
  assert.match(
    inbox,
    /Delete communication[\s\S]*EMAIL_DELIVERY[\s\S]*source_entity_id/,
  );
  assert.match(
    migration,
    /create table if not exists public\.platform_communication_deletion_audit/,
  );
  assert.match(
    migration,
    /service_request_communications[\s\S]*notification_id[\s\S]*durable Service Request delivery history/,
  );
  assert.match(
    migration,
    /delete from public\.email_deliveries/,
  );
  assert.match(
    migration,
    /delete from public\.notifications/,
  );
  assert.match(
    migration,
    /public\.is_super_admin\(actor\)/,
  );
});

test("organization Owners retain observation without receiving communication deletion", () => {
  const page = source("app/communications/page.tsx");
  const inbox = source("components/communications-inbox.tsx");

  assert.match(
    page,
    /canDeleteCommunications=\{context\.isSuperAdmin\}/,
  );
  assert.match(
    inbox,
    /canDeleteCommunications \? \(/,
  );
});


test("SUPER_ADMIN communication deletion uses an in-application confirmation instead of browser dialogs", () => {
  const inbox = source("components/communications-inbox.tsx");

  assert.doesNotMatch(inbox, /window\.confirm/);
  assert.match(inbox, /DeleteCommunicationControl/);
  assert.match(inbox, /Confirm communication deletion/);
  assert.match(inbox, /Delete permanently/);
  assert.match(inbox, /setConfirming\(false\)/);
});
