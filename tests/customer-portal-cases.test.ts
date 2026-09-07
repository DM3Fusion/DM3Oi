import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source("supabase/migrations/20260907110000_dm3oi_customer_portal_case_summaries.sql");
const repository = source("lib/data/customer-portal-case-repository.ts");
const component = source("components/portal-case-summaries.tsx");
const home = source("app/portal/page.tsx");
const layout = source("app/portal/layout.tsx");
const navigation = source("components/portal-nav.tsx");
const css = source("app/globals.css");

test("portal Case RPC derives its actor and tenant/customer scope from an active portal relationship", () => {
  assert.match(migration, /get_customer_portal_cases\(target_portal_access_id uuid\)/);
  assert.match(migration, /access\.id=target_portal_access_id/);
  assert.match(migration, /access\.user_id=auth\.uid\(\)/);
  assert.match(migration, /access\.is_active/);
  assert.match(migration, /profile\.id=access\.user_id[\s\S]*profile\.is_active/);
  assert.match(migration, /organization\.id=access\.organization_id[\s\S]*organization\.status='ACTIVE'/);
  assert.match(migration, /customer\.id=access\.customer_id[\s\S]*customer\.organization_id=access\.organization_id[\s\S]*customer\.status='ACTIVE'/);
  assert.match(migration, /coalesce\(settings\.portal_enabled,true\)/);
  assert.doesNotMatch(migration, /target_(?:organization|customer|user|case)_id/);
});

test("portal Case selection rejects cross-customer and cross-organization rows", () => {
  assert.match(migration, /join public\.cases item[\s\S]*item\.organization_id=access\.organization_id[\s\S]*item\.customer_id=access\.customer_id/);
  assert.doesNotMatch(repository, /organization_id|customer_id|case_id/);
  assert.match(repository, /target_portal_access_id: portalAccessId/);
  assert.match(home, /getCustomerPortalCases\(context\.access\.id\)/);
});

test("portal Case RPC returns only the narrow customer-safe projection", () => {
  const returnShape = migration.match(/returns table\(([\s\S]*?)\)\s*language sql/)?.[1] ?? "";
  for (const field of ["case_number", "service_label", "customer_status", "progress_percent"]) assert.match(returnShape, new RegExp(`\\b${field}\\b`));
  for (const field of ["case_id", "organization_id", "customer_id", "title", "priority", "assigned", "actor", "task", "question", "activity", "created_by"]) assert.doesNotMatch(returnShape, new RegExp(field));
  assert.doesNotMatch(migration, /join public\.(?:case_assignments|case_tasks|case_activity|case_questions|case_question_responses)/);
});

test("portal Case RPC is hardened and grants execution only to authenticated", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path=''/);
  assert.match(migration, /alter function public\.get_customer_portal_cases\(uuid\) owner to postgres/);
  assert.match(migration, /revoke all on function public\.get_customer_portal_cases\(uuid\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.get_customer_portal_cases\(uuid\) to authenticated/);
  assert.doesNotMatch(migration, /grant (?:select|all)|to anon|to public/);
  assert.doesNotMatch(migration, /create policy|disable row level security|can_access_case|organization_cases/);
});

test("portal Case progress reuses the authoritative function without exposing tasks", () => {
  assert.match(migration, /cross join lateral public\.get_case_progress\(item\.id\) progress/);
  assert.match(migration, /greatest\(0,least\(100,progress\.percentage\)\)/);
  assert.doesNotMatch(migration, /count\(|case_tasks/);
  assert.match(component, /role="progressbar"/);
  assert.match(component, /aria-valuemin=\{0\}/);
  assert.match(component, /aria-valuemax=\{100\}/);
  assert.match(component, /aria-valuenow=\{percentage\}/);
  assert.match(component, /aria-valuetext=\{`\$\{percentage\}% complete`\}/);
});

test("active Cases use the established terminal exclusions and deterministic newest-first ordering", () => {
  assert.match(migration, /item\.status not in \('COMPLETED','CLOSED','CANCELLED'\)/);
  assert.match(migration, /order by item\.opened_at desc,item\.case_number desc/);
  assert.match(migration, /item\.case_type as service_label/);
  for (const [status, label] of [["NEW", "Getting Started"], ["UNASSIGNED", "Getting Started"], ["ASSIGNED", "Getting Started"], ["IN_PROGRESS", "In Progress"], ["WAITING", "Waiting"], ["REVIEW", "Under Review"]]) {
    assert.match(migration, new RegExp(`when '${status}' then '${label}'`));
  }
});

test("portal Case UI has distinct zero, one, and multiple Case presentations", () => {
  assert.match(component, /if \(!cases\.length\)/);
  assert.match(component, />No active cases</);
  assert.match(component, /You don’t currently have any work in progress\./);
  assert.match(component, /const singular = cases\.length === 1/);
  assert.match(component, /singular \? "Your Case" : "Active Cases"/);
  assert.match(component, /cases\.map\(\(item\) =>/);
  assert.match(component, /item\.service_label \|\| item\.case_number/);
  assert.match(component, /item\.case_number/);
  assert.match(component, /item\.customer_status/);
  assert.match(component, /\{percentage\}% Complete/);
  const emptyBranch = component.match(/if \(!cases\.length\)([\s\S]*?)const singular/)?.[1] ?? "";
  assert.doesNotMatch(emptyBranch, /progressbar|% Complete|portal-case-progress/);
});

test("portal Case cards are non-navigational, responsive, and precede Service Request KPIs", () => {
  assert.doesNotMatch(component, /<Link|href=|\/portal\/cases/);
  const caseIndex = home.indexOf("<PortalCaseSummaries");
  const requestKpiIndex = home.indexOf('className="portal-summary-cards"');
  assert.ok(caseIndex > home.indexOf("Welcome Back!") && caseIndex < requestKpiIndex);
  assert.match(css, /\.portal-case-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:700px\)\{\.portal-case-section,[\s\S]*?\.portal-case-grid\{grid-template-columns:1fr\}/);
  assert.doesNotMatch(home + component + css, /bottom-nav|portal-bottom/);
});

test("organization branding and the existing Service Request experience remain unchanged", () => {
  assert.match(layout, /context\.organization\.avatar_path/);
  assert.match(layout, /OrganizationAvatar name=\{context\?\.organization\?\.name/);
  assert.match(layout, /\{context\.organization\.name\}/);
  assert.doesNotMatch(layout + home, /Mimms['’] Tax Service|UserAvatar|avatarInitials/);
  assert.match(home, /<span>Open<\/span>/);
  assert.match(home, /<span>Closed<\/span>/);
  assert.match(home, /href="\/portal\/service-requests\/new"/);
  assert.match(home, />Recent Service Requests<\/h2>/);
  assert.match(home, /href=\{`\/portal\/service-requests\/\$\{request\.id\}`\}/);
  assert.match(navigation, /aria-expanded=\{open\}/);
  assert.match(navigation, /href="\/portal\/service-requests"/);
});
