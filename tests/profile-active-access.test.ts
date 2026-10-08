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
  const migration = source(
    "supabase/migrations/20261002012000_dm3oi_fast_access_context.sql",
  );
  const routeStateMigration = source(
    "supabase/migrations/20261003120000_dm3oi_route_access_state.sql",
  );

  assert.match(proxy, /rpc\("get_my_route_access_state",\{/);
  assert.match(proxy, /profileActive=routeState\?\.profile_active===true/);
  assert.match(proxy, /if\(!profileActive\)/);
  assert.match(routeStateMigration, /from public\.profiles profile/);
  assert.match(routeStateMigration, /where profile\.id = actor_id/);

  assert.match(context, /get_my_access_context/);
  assert.match(
    context,
    /if \(!profile \|\| profile\.is_active !== true\)[\s\S]*?return null;/,
  );

  assert.match(migration, /from public\.profiles/);
  assert.match(migration, /where id = actor_id/);
  assert.match(
    migration,
    /if profile_row\.id is null or profile_row\.is_active is not true then[\s\S]*?return null;/,
  );
  assert.ok(
    migration.indexOf(
      "if profile_row.id is null or profile_row.is_active is not true",
    ) < migration.indexOf("select public.is_super_admin(actor_id)"),
  );
});

test("inactive profiles cannot resolve Customer Portal access", () => {
  const portal = source("lib/auth/customer-portal.ts");
  assert.match(portal, /from\("profiles"\)[\s\S]*select\("is_active"\)[\s\S]*eq\("id", userId\)/);
  assert.match(portal, /profileError \|\|[\s\S]*linksError \|\|[\s\S]*profile\?\.is_active !== true/);
});

const effectivePortalInput = (
  changes: Partial<CustomerPortalEffectivenessInput> = {},
): CustomerPortalEffectivenessInput => ({
  authAccountExists: true,
  profileActive: true,
  linkActive: true,
  identityConsistent: true,
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
  assert.equal(isEffectiveCustomerPortalAccess(effectivePortalInput({ identityConsistent: false })), false);
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
  const migration = source(
    "supabase/migrations/20261002012000_dm3oi_fast_access_context.sql",
  );

  assert.match(
    context,
    /const customerPortalIds =[\s\S]*rpcContext\.customer_portal_ids \?\? \[\]/,
  );
  assert.match(context, /customerPortalCount: customerPortalIds\.length/);
  assert.match(context, /provisioned:[\s\S]*customerPortalIds\.length > 0/);

  assert.match(migration, /from public\.customer_portal_users cpu/);
  assert.match(
    migration,
    /join public\.organizations o[\s\S]*o\.id = cpu\.organization_id/,
  );
  assert.match(
    migration,
    /join public\.customers c[\s\S]*c\.id = cpu\.customer_id[\s\S]*c\.organization_id = cpu\.organization_id/,
  );
  assert.match(
    migration,
    /left join public\.organization_settings s[\s\S]*s\.organization_id = cpu\.organization_id/,
  );
  assert.match(migration, /where cpu\.user_id = actor_id/);
  assert.match(migration, /and cpu\.is_active/);
  assert.match(migration, /and o\.status = 'ACTIVE'/);
  assert.match(migration, /and c\.status = 'ACTIVE'/);
  assert.match(migration, /and s\.portal_enabled is distinct from false/);
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
    "lib/data/customer-portal-provisioning-service.ts",
  );
  assert.match(
    provisioning,
    /from\("profiles"\)[\s\S]*select\("is_active"\)[\s\S]*profile\?\.is_active === false/,
  );
  assert.doesNotMatch(
    provisioning,
    /from\("profiles"\)\.upsert\(\{[^}]*is_active:\s*true/,
  );
});
