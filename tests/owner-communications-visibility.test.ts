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

test("repository broadens only a non-platform Business Owner in the active organization", () => {
  assert.match(repository, /!context\.isSuperAdmin && context\.activeOrganization\.role === "BUSINESS_OWNER"/);
  assert.match(repository, /\.eq\("organization_id", context\.activeOrganization\.id\)/);
  assert.match(repository, /if \(!organizationWide\) query = query\.eq\("recipient_user_id", context\.user\.id\)/);
  assert.match(repository, /if \(organizationWide\) return newestFirst/);
  assert.match(databaseRegression, /Business Owner sees Owner, Admin, Manager, and Staff notifications/);
  assert.match(databaseRegression, /Business Owner cannot see another organization/);
});

test("recipient names use profile display conventions without exposing email or platform identity", () => {
  assert.match(repository, /\.select\("id,display_name,first_name,last_name"\)/);
  assert.match(repository, /profile\.display_name \|\| \[profile\.first_name, profile\.last_name\]/);
  assert.doesNotMatch(repository, /profiles[^\n]*email|recipient_email/);
  assert.match(page, /Recipient: \{item\.recipient_display_name\}/);
  assert.match(migration, /not public\.is_super_admin\(recipient_user_id\)/);
});

test("observed rows navigate without mutating another recipient's read state", () => {
  assert.match(page, /item\.is_personal \? <form action=\{openNotificationAction\}/);
  assert.match(page, /: <Link href=\{item\.destination_path\} className="notification-open">/);
  assert.match(page, /item\.is_personal \? <form action=\{item\.read_at \? markNotificationUnreadAction : markNotificationReadAction\}/);
  assert.match(permissionMigration, /where n\.id=target_notification_id and n\.recipient_user_id=actor/);
  assert.match(permissionMigration, /recipient_user_id=actor and read_at is null and archived_at is null/);
  assert.match(databaseRegression, /Owner changed Staff notification state/);
  assert.match(databaseRegression, /Owner oversight does not mutate Staff read state/);
  assert.match(actions, /set_notification_read_state/);
});

test("Owner badge and mark-all behavior remain personal", () => {
  assert.match(repository, /getUnreadNotificationCount/);
  assert.match(repository, /\.eq\("recipient_user_id", userId\)/);
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
  assert.match(page, /item\.destination_path/);
  assert.match(page, /Recipient has not read/);
});

test("other internal roles, portal users, and platform behavior remain constrained", () => {
  assert.match(databaseRegression, /Business Admin remains recipient scoped/);
  assert.match(databaseRegression, /Staff Manager remains recipient scoped/);
  assert.match(databaseRegression, /Staff User remains recipient scoped/);
  assert.match(databaseRegression, /Customer Portal identity cannot read internal Communications/);
  assert.match(databaseRegression, /SUPER_ADMIN recipient behavior remains personal/);
});
