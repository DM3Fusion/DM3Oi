import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasPermission } from "../lib/auth/permissions.ts";
import {
  getCustomerPortalAccessReason,
  isEffectiveCustomerPortalAccess,
  type CustomerPortalEffectivenessInput,
} from "../lib/auth/customer-portal-effectiveness.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("inactive profiles are rejected by proxy and request-scoped access resolution", () => {
  const proxy = source("proxy.ts");
  const context = source("lib/auth/context.ts");
  assert.match(proxy, /from\("profiles"\)\.select\("is_active"\)\.eq\("id",user\.id\)\.maybeSingle\(\)/);
  assert.match(proxy, /profile\.data\?\.is_active===false/);
  assert.match(context, /avatar_updated_at,is_active/);
  assert.match(context, /if \(profile\.data\?\.is_active === false\)\s*\{[\s\S]*?return null;[\s\S]*?\}/);
  assert.ok(
    context.indexOf("if (profile.data?.is_active === false)") <
      context.indexOf("const isSuperAdmin"),
  );
});

test("inactive profiles cannot resolve Customer Portal access", () => {
  const portal = source("lib/auth/customer-portal.ts");
  assert.match(portal, /from\("profiles"\)[\s\S]*select\("is_active"\)[\s\S]*eq\("id", user\.id\)/);
  assert.match(portal, /profile\?\.is_active !== true \|\| error \|\| !activeLinks\.length/);
});

const effectivePortalInput = (
  changes: Partial<CustomerPortalEffectivenessInput> = {},
): CustomerPortalEffectivenessInput => ({
  authAccountExists: true,
  profileActive: true,
  linkActive: true,
  organizationFound: true,
  organizationStatus: "ACTIVE",
  customerFound: true,
  customerStatus: "ACTIVE",
  portalEnabled: true,
  ...changes,
});

test("customer portal effectiveness applies every access gate coherently", () => {
  assert.equal(isEffectiveCustomerPortalAccess(effectivePortalInput()), true);
  assert.equal(isEffectiveCustomerPortalAccess(effectivePortalInput({ authAccountExists: false })), false);
  assert.equal(isEffectiveCustomerPortalAccess(effectivePortalInput({ profileActive: false })), false);
  assert.equal(isEffectiveCustomerPortalAccess(effectivePortalInput({ linkActive: false })), false);
  assert.equal(isEffectiveCustomerPortalAccess(effectivePortalInput({ organizationStatus: "INACTIVE" })), false);
  assert.equal(isEffectiveCustomerPortalAccess(effectivePortalInput({ customerStatus: "INACTIVE" })), false);
  assert.equal(isEffectiveCustomerPortalAccess(effectivePortalInput({ portalEnabled: false })), false);
  assert.equal(isEffectiveCustomerPortalAccess(effectivePortalInput({ settingsLookupFailed: true })), false);
  assert.equal(getCustomerPortalAccessReason(effectivePortalInput({ portalEnabled: false })), "PORTAL_DISABLED");
});

test("ineffective portal links do not grant generic permission or provisioning", () => {
  assert.equal(
    hasPermission(
      {
        isSuperAdmin: false,
        internalAccess: false,
        activeOrganization: null,
        customerPortalCount: 0,
      },
      "ACCESS_CUSTOMER_PORTAL",
    ),
    false,
  );

  const context = source("lib/auth/context.ts");
  assert.match(context, /resolvedPortalAccesses[\s\S]*filter\(\(access\) => access\.effective\)[\s\S]*map\(\(access\) => access\.link\.customer_id\)/);
  assert.match(context, /customerPortalCount: customerPortalIds\.length/);
  assert.match(context, /provisioned:[\s\S]*customerPortalIds\.length > 0/);
});

test("directory and portal context share the effective portal predicate", () => {
  const repository = source("lib/data/platform-repository.ts");
  const portal = source("lib/auth/customer-portal.ts");
  assert.match(repository, /isEffectiveCustomerPortalAccess\(\{/);
  assert.match(portal, /resolveCustomerPortalAccesses\(/);
  assert.match(portal, /effectiveAccesses\.length === 1/);
  assert.match(portal, /links: effectiveAccesses\.map\(\(item\) => item\.link\)/);
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

test("trusted service role retains a profile reactivation recovery path", () => {
  const recoveryGrant = source(
    "supabase/migrations/20260904040000_dm3iqcm_service_role_profile_provisioning.sql",
  );
  assert.match(
    recoveryGrant,
    /grant select, insert, update[\s\S]*on table public\.profiles[\s\S]*to service_role/,
  );
});

test("organization portal provisioning cannot reactivate a globally inactive profile", () => {
  const provisioning = source(
    "lib/data/customer-portal-provisioning-actions.ts",
  );
  assert.match(
    provisioning,
    /from\("profiles"\)[\s\S]*select\("id,is_active"\)[\s\S]*existingProfile\?\.data\?\.is_active === false/,
  );
  assert.doesNotMatch(
    provisioning,
    /from\("profiles"\)\.upsert\(\{[^}]*is_active:\s*true/,
  );
});
