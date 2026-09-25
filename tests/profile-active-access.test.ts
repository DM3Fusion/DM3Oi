import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("inactive profiles are rejected by proxy and request-scoped access resolution", () => {
  const proxy = source("proxy.ts");
  const context = source("lib/auth/context.ts");
  assert.match(proxy, /from\("profiles"\)\.select\("is_active"\)\.eq\("id",user\.id\)\.maybeSingle\(\)/);
  assert.match(proxy, /profile\.data\?\.is_active===false/);
  assert.match(context, /avatar_updated_at,is_active/);
  assert.match(context, /if \(profile\.data\?\.is_active === false\) return null/);
  assert.ok(
    context.indexOf("if (profile.data?.is_active === false) return null") <
      context.indexOf("const isSuperAdmin"),
  );
});

test("inactive profiles cannot resolve Customer Portal access", () => {
  const portal = source("lib/auth/customer-portal.ts");
  assert.match(portal, /from\("profiles"\)[\s\S]*select\("is_active"\)[\s\S]*eq\("id", user\.id\)/);
  assert.match(portal, /profile\?\.is_active === false \|\| error \|\| !activeLinks\.length/);
});

test("directory portal effectiveness matches portal organization, customer, settings, and profile gates", () => {
  const repository = source("lib/data/platform-repository.ts");
  assert.match(repository, /profile\?\.is_active === true/);
  assert.match(repository, /portal\.is_active/);
  assert.match(repository, /organization\?\.status === "ACTIVE"/);
  assert.match(repository, /customer\?\.status === "ACTIVE"/);
  assert.match(repository, /settings\?\.portal_enabled !== false/);
});

test("database super-admin authorization requires an active profile and retains restricted execution", () => {
  const migration = source(
    "supabase/migrations/20260925140000_dm3oi_active_profile_super_admin.sql",
  );
  assert.match(migration, /create or replace function public\.is_super_admin\([\s\S]*returns boolean[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /join public\.profiles p on p\.id = r\.user_id/);
  assert.match(migration, /r\.role = 'SUPER_ADMIN'[\s\S]*r\.is_active[\s\S]*p\.is_active/);
  assert.match(migration, /revoke all on function public\.is_super_admin\(uuid\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.is_super_admin\(uuid\) to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.is_super_admin\(uuid\) to (?:public|anon|service_role)/);
});

test("authenticated landing-page security definers use the centralized super-admin gate", () => {
  const migration = source(
    "supabase/migrations/20260925140000_dm3oi_active_profile_super_admin.sql",
  );
  assert.match(migration, /function public\.publish_public_landing_page\(\)[\s\S]*if actor is null or not public\.is_super_admin\(actor\)/);
  assert.match(migration, /function public\.revert_public_landing_page\([\s\S]*if actor is null or not public\.is_super_admin\(actor\)/);
});

test("database regression covers every active-profile and active-role combination", () => {
  const regression = source("supabase/tests/organization_administration.sql");
  assert.match(regression, /active profile and active super admin role grant platform access/);
  assert.match(regression, /inactive profile and active super admin role deny platform access/);
  assert.match(regression, /active profile and inactive super admin role deny platform access/);
  assert.match(regression, /profile without a super admin role denies platform access/);
});

test("platform identity editing can materialize a missing Auth-only profile", () => {
  const actions = source("lib/data/user-invitation-actions.ts");
  assert.match(actions, /updateUserProfileAction[\s\S]*from\("profiles"\)[\s\S]*\.upsert\(\{[\s\S]*id: userId/);
});
