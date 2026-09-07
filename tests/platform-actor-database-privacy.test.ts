import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source("supabase/migrations/20260906120000_dm3oi_organization_role_permissions.sql");

const protectedActors = [
  ["cases", "created_by_user_id"],
  ["case_activity", "actor_user_id"],
  ["case_tasks", "created_by_user_id"],
  ["case_tasks", "completed_by_user_id"],
  ["customers", "created_by_user_id"],
  ["question_definitions", "created_by_user_id"],
  ["service_requests", "created_by_user_id"],
  ["service_request_activity", "actor_user_id"],
  ["service_request_messages", "author_user_id"],
] as const;

test("tenant table grants cannot select protected actor columns", () => {
  assert.match(migration, /revoke select on public\.cases,public\.case_activity,public\.case_tasks,public\.customers,public\.question_definitions,[\s\S]*from public,anon,authenticated/);
  for (const [table, actorColumn] of protectedActors) {
    const grant = migration.match(new RegExp(`grant select\\(([^)]*)\\) on public\\.${table} to authenticated`));
    assert.ok(grant, `missing safe column grant for ${table}`);
    assert.doesNotMatch(grant[1], new RegExp(`(?:^|,)${actorColumn}(?:,|$)`));
  }
});

test("security-barrier projections conditionally mask only platform actors", () => {
  for (const view of ["organization_cases", "organization_case_activity", "organization_case_tasks", "organization_customers", "organization_question_definitions", "organization_service_requests", "organization_service_request_activity", "organization_service_request_messages"]) {
    assert.match(migration, new RegExp(`create view public\\.${view} with \\(security_barrier=true\\)`));
  }
  assert.match(migration, /when public\.is_super_admin\(auth\.uid\(\)\) then target_actor/);
  assert.match(migration, /when public\.is_super_admin\(target_actor\) then null/);
  assert.match(migration, /then 'DM3Oi Sys Support'/);
  assert.match(migration, /grant select on public\.organization_cases,[\s\S]*to authenticated/);
});

test("organization reads use privacy projections while service-role work remains private", () => {
  for (const path of [
    "lib/data/case-repository.ts",
    "lib/data/question-repository.ts",
    "app/customers/[customerId]/page.tsx",
    "app/customers/[customerId]/edit/page.tsx",
    "app/service-desk/[serviceRequestId]/page.tsx",
    "app/portal/page.tsx",
    "app/portal/service-requests/page.tsx",
    "app/portal/service-requests/[serviceRequestId]/page.tsx",
  ]) assert.match(source(path), /organization_(?:case|customer|question|service_request)/, path);
  assert.match(source("lib/auth/customer-portal.ts"), /createAdminClient/);
  assert.match(source("lib/data/communication-service.ts"), /createAdminClient/);
});

test("composite mutation results mask historical platform creators without changing stored rows", () => {
  for (const fn of ["transition_case_status", "update_case_task", "update_service_request_status", "update_service_request_priority", "set_service_request_assignment", "save_question_definition"]) {
    const start = migration.lastIndexOf(`create or replace function public.${fn}`);
    assert.ok(start >= 0, `missing hardened ${fn}`);
    const body = migration.slice(start, migration.indexOf("end $$;", start) + 7);
    assert.match(body, /not public\.is_super_admin\(actor\) and public\.is_super_admin\([^)]*(?:created_by_user_id|completed_by_user_id)\)/);
    assert.match(body, /:=null/);
    assert.doesNotMatch(body, /update public\.[a-z_]+ set created_by_user_id=null/);
  }
});

test("platform-only audit retains true attribution behind a Super Admin guard", () => {
  assert.match(migration, /create or replace function public\.get_platform_operational_actor_audit/);
  assert.match(migration, /if not public\.is_super_admin\(auth\.uid\(\)\) then raise exception 'not authorized'/);
  for (const [table, actorColumn] of protectedActors) {
    assert.match(migration, new RegExp(`'${table}'[^\n]*'${actorColumn}'`));
  }
  assert.match(migration, /grant execute on function public\.get_platform_operational_actor_audit\(uuid\) to authenticated/);
});
