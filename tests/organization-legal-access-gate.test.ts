import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20261011100000_dm3oi_organization_legal_access_gate.sql",
);
const proxy = source("proxy.ts");
const lockout = source("app/account/organization-locked/page.tsx");
const shell = source("components/layout/app-shell.tsx");

test("legal route enforcement extends rather than replaces the deployed session route function", () => {
  assert.match(
    migration,
    /get_my_route_access_state\(\s*target_is_meaningful_activity boolean,\s*target_organization_id uuid\s*\)/,
  );
  assert.match(
    migration,
    /from public\.get_my_route_access_state\(\s*target_is_meaningful_activity\s*\)/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_my_route_access_state\(boolean, uuid\)\s+to authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.get_my_route_access_state\(boolean, uuid\)\s+to (public|anon)/,
  );
});

test("route legal state is bound to the exact selected active organization with a sole-membership fallback", () => {
  assert.match(
    migration,
    /member\.organization_id = target_organization_id/,
  );
  assert.match(
    migration,
    /member\.user_id = actor_id[\s\S]*member\.is_active = true[\s\S]*member\.status = 'ACTIVE'[\s\S]*organization\.status = 'ACTIVE'/,
  );
  assert.match(
    migration,
    /if active_membership_count = 1 then/,
  );
  assert.match(
    migration,
    /public\.get_organization_legal_state\(\s*resolved_organization_id\s*\)::text/,
  );
});

test("proxy sends one organization-aware access-state request and enforces the legal gate", () => {
  assert.equal(
    proxy.match(/rpc\("get_my_route_access_state"/g)?.length,
    1,
  );
  assert.match(
    proxy,
    /request\.cookies\.get\(ACTIVE_ORGANIZATION_COOKIE\)/,
  );
  assert.match(
    proxy,
    /target_is_meaningful_activity:meaningfulActivity,target_organization_id:routeOrganizationId/,
  );
  assert.match(
    proxy,
    /route_organization_legal_state!=="ACTIVE"/,
  );
  assert.match(
    proxy,
    /routeState\.has_active_super_admin_access!==true/,
  );
});

test("Owner signs in to Account first and is denied elsewhere until organization acceptance", () => {
  assert.match(
    proxy,
    /route_organization_role==="BUSINESS_OWNER"/,
  );
  assert.match(
    proxy,
    /if\(pathname==="\/"\)return responseWithCookies\(new URL\("\/account",request\.url\),response\)/,
  );
  assert.match(
    proxy,
    /pathname!=="\/account"&&pathname!==lockout/,
  );
  assert.match(
    proxy,
    /const lockout="\/account\/organization-locked"/,
  );
});

test("non-Owners are locked out while Customer Portal and SUPER_ADMIN platform access remain separate", () => {
  assert.match(
    proxy,
    /else if\(pathname!==lockout\)\{\s*return responseWithCookies\(new URL\(lockout,request\.url\),response\)/,
  );
  assert.match(
    proxy,
    /!pathname\.startsWith\("\/portal"\)/,
  );
  assert.match(
    proxy,
    /routeState\.has_active_super_admin_access!==true/,
  );
});

test("lockout page provides the approved Owner and organization-user recovery paths", () => {
  assert.match(lockout, /title="System Denied"/);
  assert.match(lockout, /Return to Accept/);
  assert.match(lockout, /Exit System/);
  assert.match(
    lockout,
    /See your Organization Admin for instructions\./,
  );
  assert.match(
    lockout,
    /legalState\.state === "ACTIVE"[\s\S]*redirect\("\/"\)/,
  );
});

test("organization lockout renders without the normal authenticated navigation shell", () => {
  assert.match(
    shell,
    /pathname === "\/account\/organization-locked"/,
  );
});
