import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("STAFF_USER retains read visibility for an internally created unassigned Service Request", () => {
  const migration = source(
    "supabase/migrations/20261008120000_dm3oi_service_request_creator_visibility.sql",
  );

  assert.match(
    migration,
    /create or replace function public\.can_access_service_request/,
  );

  assert.match(
    migration,
    /m\.role = 'STAFF_USER'[\s\S]*r\.assigned_user_id = target_user_id[\s\S]*or r\.created_by_user_id = target_user_id/,
  );

  assert.match(
    migration,
    /revoke execute on function public\.can_access_service_request\(uuid, uuid, uuid\)[\s\S]*from public, anon, authenticated/,
  );
});

test("creator visibility does not broaden Service Request management authority", () => {
  const visibilityMigration = source(
    "supabase/migrations/20261008120000_dm3oi_service_request_creator_visibility.sql",
  );
  const foundation = source(
    "supabase/migrations/20260904110000_dm3iqcm_service_desk_foundation.sql",
  );

  assert.doesNotMatch(
    visibilityMigration,
    /create or replace function public\.can_manage_service_request/,
  );

  assert.match(
    foundation,
    /m\.role='STAFF_USER'[\s\S]*r\.assigned_user_id=target_user_id/,
  );
});

test("new internal Service Request still redirects to its UUID detail route", () => {
  const action = source("lib/data/service-request-actions.ts");
  const detail = source("lib/data/case-repository.ts");

  assert.match(action, /redirect\(`\/service-desk\/\$\{request\.id\}`\)/);
  assert.match(
    detail,
    /\.from\("organization_service_requests"\)[\s\S]*\.eq\("id", serviceRequestId\)/,
  );
});
