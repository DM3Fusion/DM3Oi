import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateInvitationEligibility } from "../lib/data/invitation-eligibility.ts";

const source = (path: string) => readFileSync(path, "utf8");
const proxy = source("proxy.ts");
const migration = source(
  "supabase/migrations/20261003120000_dm3oi_route_access_state.sql",
);

test("protected proxy routing performs one Auth verification and one access-state RPC", () => {
  assert.equal(proxy.match(/supabase\.auth\.getClaims\(\)/g)?.length, 1);
  assert.doesNotMatch(proxy, /supabase\.auth\.getUser\(\)/);
  assert.equal(proxy.match(/rpc\("get_my_route_access_state",\{/g)?.length, 1);
  assert.match(proxy, /target_is_meaningful_activity:meaningfulActivity/);
  assert.doesNotMatch(
    proxy,
    /\.from\("(?:profiles|platform_user_roles|organization_members|customer_portal_users)"\)/,
  );
  assert.doesNotMatch(proxy, /getMyPendingOrganizationMembership/);
});

test("public analytics requests bypass proxy Auth before a Supabase client is created", () => {
  const bypass = proxy.indexOf(
    "if(publicAnalyticsRoutes.has(pathname)) return response",
  );
  assert.ok(bypass > -1);
  assert.ok(bypass < proxy.indexOf("createServerClient<Database>"));
  assert.ok(bypass < proxy.indexOf("supabase.auth.getClaims()"));
});

test("route-state RPC is self-only, minimal, authenticated-only, and fail closed", () => {
  assert.match(
    migration,
    /create or replace function public\.get_my_route_access_state\(\)/,
  );
  assert.match(migration, /actor_id uuid := auth\.uid\(\)/);
  assert.match(migration, /if actor_id is null then[\s\S]*errcode = '42501'/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.doesNotMatch(
    migration,
    /target_user_id|target_organization_id|target_membership_id/,
  );
  assert.match(
    migration,
    /revoke all on function public\.get_my_route_access_state\(\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_my_route_access_state\(\)[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]*to anon/);
});

test("customer portal context is memoized only within a React server render", () => {
  const portal = source("lib/auth/customer-portal.ts");
  assert.match(portal, /import \{ cache \} from "react"/);
  assert.match(portal, /async function resolveCustomerPortalContext\(\)/);
  assert.match(
    portal,
    /export const getCustomerPortalContext = cache\(resolveCustomerPortalContext\)/,
  );
  assert.doesNotMatch(portal, /unstable_cache|new Map|setTimeout|TTL/i);
});

test("organization Users reuses membership, platform-role, and Auth facts", () => {
  const page = source("app/users/page.tsx");
  assert.match(page, /evaluateInvitationEligibility/);
  assert.match(page, /membershipStatus: member\.status/);
  assert.match(page, /targetHasActiveSuperAdminRole: platformAdminIds\.has/);
  assert.match(page, /authEmail: authUser\?\.email/);
  assert.doesNotMatch(page, /getInvitationEligibility/);
  assert.equal(page.match(/auth\.admin\.getUserById\(member\.user_id\)/g)?.length, 1);
});

test("pure invitation eligibility preserves organization and platform semantics", () => {
  const organizationFacts = {
    organizationId: "organization-1",
    membershipStatus: "INVITED",
    targetHasActiveSuperAdminRole: false,
    authEmail: "invitee@example.com",
    authEmailConfirmedAt: "2026-01-01T00:00:00Z",
    authLastSignInAt: null,
    actorIsSuperAdmin: false,
    actorCanManageOrganization: true,
  };
  assert.equal(evaluateInvitationEligibility(organizationFacts), true);
  assert.equal(
    evaluateInvitationEligibility({
      ...organizationFacts,
      targetHasActiveSuperAdminRole: true,
    }),
    false,
  );
  assert.equal(
    evaluateInvitationEligibility({
      ...organizationFacts,
      actorIsSuperAdmin: true,
      targetHasActiveSuperAdminRole: true,
    }),
    true,
  );
  assert.equal(
    evaluateInvitationEligibility({
      ...organizationFacts,
      membershipStatus: "VERIFIED",
    }),
    false,
  );

  const platformFacts = {
    targetHasActiveSuperAdminRole: false,
    authEmail: "invitee@example.com",
    authEmailConfirmedAt: null,
    authLastSignInAt: null,
    actorIsSuperAdmin: true,
    actorCanManageOrganization: false,
  };
  assert.equal(evaluateInvitationEligibility(platformFacts), true);
  assert.equal(
    evaluateInvitationEligibility({
      ...platformFacts,
      authEmailConfirmedAt: "2026-01-01T00:00:00Z",
    }),
    false,
  );
  assert.equal(
    evaluateInvitationEligibility({
      ...platformFacts,
      authLastSignInAt: "2026-01-01T00:00:00Z",
    }),
    false,
  );
  assert.equal(
    evaluateInvitationEligibility({
      ...platformFacts,
      actorIsSuperAdmin: false,
    }),
    false,
  );
});

test("pending activation reuses access identity and preserves both membership checks", () => {
  const page = source("app/account/pending-activation/page.tsx");
  assert.match(page, /getAccessContext\(\)/);
  assert.doesNotMatch(page, /auth\.getUser\(\)/);
  assert.match(page, /getMyPendingOrganizationMembership\(supabase\)/);
  assert.match(page, /\.eq\("user_id", access\.user\.id\)/);
  assert.match(page, /if \(activeMembership\) redirect\("\/"\)/);
  assert.match(page, /redirect\("\/account\/unprovisioned"\)/);
});

test("optimization adds no broad grants, polling, Realtime, or cross-request cache", () => {
  const portal = source("lib/auth/customer-portal.ts");
  const platformPrivacy = source("lib/data/platform-privacy.ts");
  const combined = `${proxy}\n${portal}\n${platformPrivacy}`;
  assert.doesNotMatch(migration, /grant all|to anon|disable row level security/i);
  assert.doesNotMatch(
    combined,
    /setInterval|setTimeout|subscribe\(|channel\(|visibilitychange|heartbeat/i,
  );
  assert.doesNotMatch(portal, /unstable_cache/);
  assert.match(platformPrivacy, /cache\(resolvePlatformAdminUserIds\)/);
});
