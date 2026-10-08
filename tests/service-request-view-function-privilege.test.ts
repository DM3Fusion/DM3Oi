import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const corrective = readFileSync(
  "supabase/migrations/20261008220000_dm3oi_restore_service_request_view_access.sql",
  "utf8",
);

const visibility = readFileSync(
  "supabase/migrations/20261008120000_dm3oi_service_request_creator_visibility.sql",
  "utf8",
);

const viewFoundation = readFileSync(
  "supabase/migrations/20260906120000_dm3oi_organization_role_permissions.sql",
  "utf8",
);

test("organization Service Request projection depends on the visibility helper", () => {
  assert.match(
    viewFoundation,
    /create view public\.organization_service_requests[\s\S]*public\.can_access_service_request\(r\.id,r\.organization_id,auth\.uid\(\)\)/,
  );
});

test("creator-visibility migration explains the regression source", () => {
  assert.match(
    visibility,
    /revoke execute on function public\.can_access_service_request\(uuid,\s*uuid,\s*uuid\)[\s\S]*authenticated;/,
  );
});

test("corrective migration restores only authenticated execution", () => {
  assert.match(
    corrective,
    /grant execute[\s\S]*public\.can_access_service_request\(uuid,\s*uuid,\s*uuid\)[\s\S]*to authenticated;/,
  );

  assert.match(
    corrective,
    /revoke execute[\s\S]*public\.can_access_service_request\(uuid,\s*uuid,\s*uuid\)[\s\S]*from public,\s*anon;/,
  );

  assert.doesNotMatch(
    corrective,
    /grant execute[\s\S]*to\s+(public|anon)\b/i,
  );
});

test("corrective migration does not alter Service Request authorization logic", () => {
  assert.doesNotMatch(
    corrective,
    /create or replace function public\.can_access_service_request/i,
  );
  assert.doesNotMatch(
    corrective,
    /alter table public\.service_requests/i,
  );
  assert.doesNotMatch(
    corrective,
    /create policy|drop policy/i,
  );
});
