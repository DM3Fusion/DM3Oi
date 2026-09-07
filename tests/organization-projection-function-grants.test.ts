import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const foundation = source("supabase/migrations/20260906120000_dm3oi_organization_role_permissions.sql");
const hotfix = source("supabase/migrations/20260907090000_dm3oi_fix_organization_projection_function_grants.sql");
const serviceAccessFix = source("supabase/migrations/20260904120000_dm3iqcm_fix_service_request_rls_function_permissions.sql");
const conversations = source("supabase/migrations/20260904180000_dm3iqcm_service_request_conversations.sql");
const dataFoundation = source("supabase/migrations/20260903150000_dm3iqcm_data_foundation.sql");

test("authenticated receives only projection-required safe helper execution", () => {
  assert.match(foundation, /revoke all on function public\.organization_actor_id\(uuid\),public\.organization_actor_label\(uuid\) from public,anon,authenticated/);
  assert.match(hotfix, /grant execute on function public\.organization_actor_id\(uuid\),public\.organization_actor_label\(uuid\) to authenticated/);
  assert.match(hotfix, /grant execute on function public\.can_manage_own_service_request\(uuid,uuid\) to authenticated/);
  assert.match(hotfix, /revoke all on function public\.can_view_organization_actor\(uuid\) from public,anon,authenticated/);
  assert.doesNotMatch(hotfix, /grant execute[^;]+to (?:public|anon)/);
  assert.doesNotMatch(hotfix, /grant execute on function public\.can_manage_service_request\(uuid,uuid,uuid\)/);
});

test("actor helpers remain security definer but cannot become arbitrary identity lookups", () => {
  assert.match(hotfix, /function public\.can_view_organization_actor\(target_actor uuid\)[\s\S]*security definer set search_path=''/);
  assert.match(hotfix, /target_actor=auth\.uid\(\)/);
  assert.match(hotfix, /join public\.organization_members them on them\.organization_id=me\.organization_id/);
  for (const scope of ["can_access_case", "is_internal_member", "is_customer_portal_user", "can_access_service_request", "can_read_service_request_messages", "can_manage_service_request"]) {
    assert.match(hotfix, new RegExp(`public\\.${scope}\\(`), scope);
  }
  for (const helper of ["organization_actor_id", "organization_actor_label"]) {
    assert.match(hotfix, new RegExp(`function public\\.${helper}\\(target_actor uuid\\)[\\s\\S]*can_view_organization_actor\\(target_actor\\)`));
  }
});

test("organization projections can call every required helper", () => {
  assert.match(dataFoundation, /grant execute on function public\.[^;]*is_super_admin\(uuid\)[^;]*is_internal_member\(uuid,uuid\)[^;]*is_customer_portal_user\(uuid,uuid,uuid\)[^;]*can_access_case\(uuid,uuid,uuid\) to authenticated/);
  assert.match(serviceAccessFix, /grant execute on function public\.can_access_service_request\(uuid, uuid, uuid\)[\s\S]*to authenticated/);
  assert.match(conversations, /grant execute on function public\.can_read_service_request_messages\(uuid, uuid\) to authenticated/);
  assert.match(hotfix, /where public\.can_manage_own_service_request\(c\.service_request_id,c\.organization_id\)/);
  assert.match(hotfix, /create or replace view public\.organization_service_request_communications with \(security_barrier=true\)/);
});

test("tenant-facing platform attribution stays masked exactly", () => {
  assert.match(hotfix, /not public\.is_super_admin\(auth\.uid\(\)\) and public\.is_super_admin\(target_actor\) then null/);
  assert.match(hotfix, /then 'DM3Oi Sys Support'/);
  assert.doesNotMatch(hotfix, /grant select[^;]+public\.(?:cases|case_activity|case_tasks|customers|question_definitions|service_requests|service_request_activity|service_request_messages|service_request_communications)/);
  assert.doesNotMatch(hotfix, /get_platform_operational_actor_audit/);
});
