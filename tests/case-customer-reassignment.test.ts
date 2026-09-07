import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatActivity } from "../lib/activity-format.ts";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20260907113000_dm3oi_case_customer_reassignment.sql",
);
const action = source("lib/data/case-actions.ts");
const page = source("app/cases/[caseId]/page.tsx");
const dialog = source("components/cases/case-customer-reassignment.tsx");
const portal = source(
  "supabase/migrations/20260907110000_dm3oi_customer_portal_case_summaries.sql",
);
const css = source("app/globals.css");
const rpc = migration.slice(
  migration.indexOf("create or replace function public.reassign_case_customer("),
);

test("reassignment RPC is narrowly granted and derives trusted scope and actor data", () => {
  assert.match(
    migration,
    /reassign_case_customer\(\s*target_case_id uuid,\s*target_customer_id uuid\s*\)/,
  );
  assert.match(migration, /actor uuid:=auth\.uid\(\)/);
  assert.doesNotMatch(
    migration,
    /reassign_case_customer\([^)]*target_(?:organization|actor|user|old_customer)_id/,
  );
  assert.match(migration, /security definer set search_path=''/);
  assert.match(
    migration,
    /alter function public\.reassign_case_customer\(uuid,uuid\) owner to postgres/,
  );
  assert.match(
    migration,
    /revoke all on function public\.reassign_case_customer\(uuid,uuid\) from public,anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.reassign_case_customer\(uuid,uuid\) to authenticated/,
  );
  assert.doesNotMatch(migration, /grant (?:update|select|all) on (?:table )?public\.cases/);
});

test("database authorization is effective-permission, tenant, customer-state, and record scoped", () => {
  assert.match(
    migration,
    /has_effective_organization_permission\(item\.organization_id,'REASSIGN_CASE_CUSTOMER'\)/,
  );
  assert.match(
    migration,
    /can_access_case\(item\.id,item\.organization_id,actor\)/,
  );
  assert.match(
    migration,
    /id=target_customer_id and organization_id=item\.organization_id and status='ACTIVE'/,
  );
  assert.match(migration, /new_customer\.id=old_customer\.id/);
  assert.match(action, /hasPermission\(access, "REASSIGN_CASE_CUSTOMER"\)/);
  assert.match(
    action,
    /\.eq\("id", input\.caseId\)[\s\S]*\.eq\("organization_id", organization\.id\)/,
  );
});

test("row locking and history gates protect atomic mutation and duplicate attempts", () => {
  const lock = migration.indexOf(
    "select * into item from public.cases where id=target_case_id for update",
  );
  const noOp = migration.indexOf("new_customer.id=old_customer.id");
  const update = migration.indexOf(
    "update public.cases set customer_id=new_customer.id",
  );
  const audit = migration.indexOf(
    "insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)",
  );
  assert.ok(lock >= 0 && lock < noOp && noOp < update && update < audit);
  assert.match(
    migration,
    /exists\(select 1 from public\.service_requests r where r\.case_id=item\.id\)/,
  );
  assert.match(
    migration,
    /exists\(select 1 from public\.case_activity a where a\.case_id=item\.id and a\.event_type='CUSTOMER_RESPONSE_RECEIVED'\)/,
  );
  assert.doesNotMatch(migration, /case_tasks|case_question_responses/);
  assert.doesNotMatch(rpc, /exception[\s\S]*when[\s\S]*(?:commit|return)/i);
});

test("successful reassignment changes only customer_id and records immutable snapshots once", () => {
  assert.match(
    migration,
    /update public\.cases set customer_id=new_customer\.id where id=item\.id/,
  );
  assert.equal(
    migration.match(/insert into public\.case_activity\(/g)?.length,
    1,
  );
  for (const field of [
    "old_customer_id",
    "old_customer_name",
    "new_customer_id",
    "new_customer_name",
  ]) {
    assert.match(migration, new RegExp(`'${field}'`));
  }
  assert.equal(
    formatActivity("CUSTOMER_CHANGED", {
      old_customer_name: "Old Company",
      new_customer_name: "New Company",
    }),
    "Customer changed from Old Company to New Company",
  );
  assert.doesNotMatch(migration, /update public\.service_requests/);
});

test("Case Overview exposes an effective-permission control and otherwise stays read-only", () => {
  assert.match(page, /<h2>Case Overview<\/h2>/);
  assert.match(page, /hasPermission\(\s*access,\s*"REASSIGN_CASE_CUSTOMER"/);
  assert.match(page, /<CaseCustomerReassignment/);
  assert.match(page, /<dt>Customer<\/dt>/);
  assert.match(page, /customer\.status === "ACTIVE"/);
  assert.match(page, /customer\.id !== item\.customer_id/);
  assert.match(page, /<section className="panel detail-section">[\s\S]*?<h2>Tasks<\/h2>/);
  assert.match(page, /<h2>Assignments<\/h2>/);
});

test("dialog search and submission preserve accessibility, responsiveness, and duplicate protection", () => {
  assert.match(dialog, /Reassign Case to Another Customer/);
  assert.match(dialog, /Search active organization customers/);
  assert.match(dialog, /toLocaleLowerCase\(\)\.includes\(normalizedSearch\)/);
  assert.match(dialog, /customer\.id !== displayedCustomer\.id/);
  assert.match(dialog, /type="radio"/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(dialog, /onCancel=/);
  assert.match(dialog, /if \(pending \|\| !selectedId\) return/);
  assert.match(dialog, /disabled=\{pending \|\| !selectedId\}/);
  assert.match(dialog, /dialog\.current\?\.close\(\)/);
  assert.match(dialog, /setDisplayedCustomer\(selected\)/);
  assert.match(dialog, /router\.refresh\(\)/);
  assert.match(dialog, /role="alert"/);
  assert.match(
    dialog,
    /This may change which Customer Portal account can see this Case\./,
  );
  assert.match(css, /\.case-customer-dialog\{width:min\(600px,calc\(100vw - 32px\)\)/);
  assert.match(css, /\.case-overview-grid\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:850px\)\{\.case-overview-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.case-customer-change:focus-visible/);
  assert.doesNotMatch(dialog + css, /global-progress|navigation-progress/);
});

test("blocked history is translated to a safe structured error", () => {
  assert.match(action, /customer history prevents reassignment/);
  assert.match(
    action,
    /This Case contains customer activity associated with the current Customer and cannot be reassigned safely\./,
  );
  assert.doesNotMatch(
    action,
    /message IDs|activity IDs|hidden communication|customer UUID/i,
  );
});

test("portal visibility remains relation-driven and the existing portal RPC is unchanged", () => {
  assert.match(
    portal,
    /item\.organization_id=access\.organization_id[\s\S]*item\.customer_id=access\.customer_id/,
  );
  assert.doesNotMatch(migration, /get_customer_portal_cases/);
  assert.doesNotMatch(migration, /customer_portal_users/);
  assert.doesNotMatch(migration, /service_request_messages|service_request_communications/);
});
