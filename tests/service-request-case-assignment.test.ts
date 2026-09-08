import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasPermission, roleHasDefaultPermission } from "../lib/auth/permissions.ts";

const source = (path: string) => readFileSync(path, "utf8");
const page = source("app/service-desk/[serviceRequestId]/page.tsx");
const control = source("components/service-request-case-link.tsx");
const actions = source("lib/data/service-request-actions.ts");
const migration = source("supabase/migrations/20260907140000_dm3oi_service_request_case_assignment.sql");
const caseRepository = source("lib/data/case-repository.ts");

test("Service Request detail presents the linked or unlinked Case state", () => {
  assert.match(page, /<ServiceRequestCaseLink/);
  assert.match(control, /<dt>Case<\/dt>/);
  assert.match(control, /Not linked/);
  assert.match(control, /Assign to Case/);
  assert.match(control, /Change Case/);
  assert.match(control, /href=\{`\/cases\/\$\{linkedCase\.id\}`\}/);
  assert.match(control, /\{linkedCase\.caseNumber\} — \{linkedCase\.title\}/);
});

test("Case choices are authorized organization Cases for the exact customer", () => {
  assert.match(page, /data\.cases\s*\.filter\(\(candidate\) => candidate\.customer_id === item\.customer_id\)/);
  assert.match(caseRepository, /from\("organization_cases"\)/);
  assert.match(caseRepository, /\.eq\("organization_id", organizationId\)/);
  assert.doesNotMatch(page, /data\.customers.*eligibleCases|organization-wide Cases/);
  assert.match(control, /No eligible cases are available for this customer\./);
});

test("Case link management uses the effective Service Request management permission", () => {
  assert.equal(roleHasDefaultPermission("BUSINESS_OWNER", "MANAGE_SERVICE_REQUEST"), true);
  assert.equal(roleHasDefaultPermission("STAFF_MANAGER", "MANAGE_SERVICE_REQUEST"), true);
  assert.equal(roleHasDefaultPermission("STAFF_USER", "MANAGE_SERVICE_REQUEST"), false);
  assert.equal(hasPermission({ isSuperAdmin: false, internalAccess: false, activeOrganization: null, customerPortalCount: 1 }, "MANAGE_SERVICE_REQUEST"), false);
  assert.match(page, /hasPermission\(access, "MANAGE_SERVICE_REQUEST"\)/);
  assert.match(control, /\{canManage \?/);
  assert.match(actions, /setServiceRequestCaseAction[\s\S]*requirePermission\("MANAGE_SERVICE_REQUEST"\)/);
  assert.match(actions, /setServiceRequestCaseAction[\s\S]*from\("organization_service_requests"\)[\s\S]*\.eq\("organization_id", context\.activeOrganization\.id\)/);
  assert.match(migration, /has_effective_organization_permission\(item\.organization_id,'MANAGE_SERVICE_REQUEST'\)/);
  assert.match(migration, /can_manage_service_request\(item\.id,item\.organization_id,actor\)/);
});

test("RPC rejects arbitrary cross-tenant, cross-customer, and invisible Cases", () => {
  const caseAction = actions.slice(
    actions.indexOf("export async function setServiceRequestCaseAction"),
    actions.indexOf("export async function createInternalServiceRequestMessageAction"),
  );
  assert.match(migration, /where id=target_case_id\s+and organization_id=item\.organization_id\s+and customer_id=item\.customer_id/);
  assert.match(migration, /can_access_case\(target_case\.id,target_case\.organization_id,actor\)/);
  assert.match(migration, /raise exception 'invalid target case'/);
  assert.doesNotMatch(caseAction, /data\.organizationId|data\.customerId/);
  assert.match(migration, /revoke all on function public\.set_service_request_case\(uuid,uuid,uuid\) from public,anon/);
  assert.match(migration, /grant execute on function public\.set_service_request_case\(uuid,uuid,uuid\) to authenticated/);
});

test("assignment, change, and unlink update only case_id with optimistic concurrency", () => {
  assert.match(migration, /from public\.service_requests[\s\S]*for update/);
  assert.match(migration, /item\.case_id is distinct from expected_case_id/);
  assert.match(migration, /set case_id=target_case_id/);
  assert.doesNotMatch(migration, /set[^;]*(customer_id|organization_id|assigned_user_id)=/);
  assert.match(control, /expectedCaseId: linkedCase\?\.id \?\? null/);
  assert.match(control, /caseId: null, expectedCaseId: linkedCase\.id/);
  assert.match(control, /Remove Case Link/);
  assert.match(actions, /if \(data\.expectedCaseId\) revalidatePath\(`\/cases\/\$\{data\.expectedCaseId\}`\)/);
});

test("Case link history uses safe Case references and masked activity architecture", () => {
  for (const event of ["CASE_LINKED", "CASE_CHANGED", "CASE_UNLINKED"]) {
    assert.match(migration, new RegExp(`'${event}'`));
  }
  assert.match(migration, /previous_case\.case_number/);
  assert.match(migration, /target_case\.case_number/);
  assert.match(migration, /previous_case_title/);
  assert.match(migration, /new_case_title/);
  assert.doesNotMatch(migration, /actor_email/);
  assert.match(page, /get_service_request_detail_activity/);
  assert.match(page, /actor_display_name/);
  assert.match(migration, /is_super_admin\(item\.created_by_user_id\)[\s\S]*item\.created_by_user_id:=null/);
});

test("communications follow the authoritative link without copying messages", () => {
  assert.match(caseRepository, /request\.case_id === item\.id/);
  assert.match(caseRepository, /from\("organization_service_request_messages"\)/);
  assert.match(caseRepository, /\.in\("service_request_id", linkedRequests\.map\(\(request\) => request\.id\)\)/);
  assert.match(migration, /update public\.service_requests\s+set case_id=target_case_id/);
  assert.doesNotMatch(migration, /insert into public\.service_request_messages|update public\.service_request_messages/);
});
