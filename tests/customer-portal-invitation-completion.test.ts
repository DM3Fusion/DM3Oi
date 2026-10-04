import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveRootExperience } from "../lib/auth/access-routing.ts";
import { customerPortalCookieOptions } from "../lib/auth/customer-portal-cookie.ts";
import { getCustomerPortalAccessReason } from "../lib/auth/customer-portal-effectiveness.ts";
import { resolveInvitationCompletionDestination } from "../lib/auth/invitation-completion.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("portal-only invitation completion selects the sole effective account", () => {
  assert.deepEqual(
    resolveInvitationCompletionDestination({
      hasVerifiedMembershipInvitation: false,
      identityCategory: "CUSTOMER_PORTAL",
      effectivePortalAccessIds: ["portal-access-a"],
    }),
    { destination: "/portal", portalAccessId: "portal-access-a" },
  );
});

test("multiple effective portal accounts require explicit account selection", () => {
  assert.deepEqual(
    resolveInvitationCompletionDestination({
      hasVerifiedMembershipInvitation: false,
      identityCategory: "CUSTOMER_PORTAL",
      effectivePortalAccessIds: ["portal-access-a", "portal-access-b"],
    }),
    { destination: "/portal/select-account", portalAccessId: null },
  );
});

test("internal invitation activation takes precedence over portal access", () => {
  assert.deepEqual(
    resolveInvitationCompletionDestination({
      hasVerifiedMembershipInvitation: true,
      identityCategory: "CUSTOMER_PORTAL",
      effectivePortalAccessIds: ["stale-portal-access"],
    }),
    { destination: "/account/pending-activation", portalAccessId: null },
  );
  assert.deepEqual(
    resolveInvitationCompletionDestination({
      hasVerifiedMembershipInvitation: false,
      identityCategory: "INTERNAL",
      effectivePortalAccessIds: ["stale-portal-access"],
    }),
    { destination: "/", portalAccessId: null },
  );
});

test("an identity with no effective access falls through to safe root routing", () => {
  assert.deepEqual(
    resolveInvitationCompletionDestination({
      hasVerifiedMembershipInvitation: false,
      identityCategory: "NONE",
      effectivePortalAccessIds: [],
    }),
    { destination: "/", portalAccessId: null },
  );
  assert.equal(
    resolveRootExperience({
      isSuperAdmin: false,
      internalAccess: false,
      provisioned: false,
      hasActiveOrganization: false,
      customerPortalCount: 0,
    }),
    "UNPROVISIONED",
  );
});

test("normal OTP routing still recognizes effective portal-only identities", () => {
  assert.equal(
    resolveRootExperience({
      isSuperAdmin: false,
      internalAccess: false,
      provisioned: true,
      hasActiveOrganization: false,
      customerPortalCount: 1,
    }),
    "PORTAL",
  );
  const authActions = source("lib/auth/actions.ts");
  assert.match(authActions, /signInWithOtp\(\{email,options:\{shouldCreateUser:false\}\}\)/);
  assert.match(authActions, /verify_my_membership_invitation/);
});

test("effective portal authority rejects every inactive or disabled dependency", () => {
  const valid = {
    authAccountExists: true,
    profileActive: true,
    linkActive: true,
    identityConsistent: true,
    organizationStatus: "ACTIVE",
    customerStatus: "ACTIVE",
    portalEnabled: true,
  };
  assert.equal(getCustomerPortalAccessReason(valid), "VALID");
  assert.equal(
    getCustomerPortalAccessReason({ ...valid, profileActive: false }),
    "NO_ACTIVE_PORTAL_ACCESS",
  );
  assert.equal(
    getCustomerPortalAccessReason({ ...valid, linkActive: false }),
    "NO_ACTIVE_PORTAL_ACCESS",
  );
  assert.equal(
    getCustomerPortalAccessReason({ ...valid, organizationStatus: "INACTIVE" }),
    "ORGANIZATION_INACTIVE",
  );
  assert.equal(
    getCustomerPortalAccessReason({ ...valid, customerStatus: "INACTIVE" }),
    "CUSTOMER_INACTIVE",
  );
  assert.equal(
    getCustomerPortalAccessReason({ ...valid, portalEnabled: false }),
    "PORTAL_DISABLED",
  );
});

test("invite completion uses fixed destinations and canonical cookie handling", () => {
  const route = source("app/auth/invite/complete/route.ts");
  const cookieOptions = customerPortalCookieOptions();
  assert.deepEqual(
    {
      httpOnly: cookieOptions.httpOnly,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
    },
    { httpOnly: true, sameSite: "lax", path: "/" },
  );
  assert.match(route, /resolveInvitationCompletionDestination/);
  assert.match(route, /response\.cookies\.delete\(ACTIVE_ORGANIZATION_COOKIE\)/);
  assert.match(
    route,
    /response\.cookies\.set\([\s\S]*ACTIVE_PORTAL_ACCESS_COOKIE[\s\S]*customerPortalCookieOptions\(\)/,
  );
  assert.match(route, /else \{[\s\S]*response\.cookies\.delete\(ACTIVE_PORTAL_ACCESS_COOKIE\)/);
  assert.doesNotMatch(route, /searchParams\.get\("(?:next|redirect|returnTo)"\)/);
});

test("membership completion never sets a portal selection", () => {
  const route = source("app/auth/invite/complete/route.ts");
  const membershipBranch =
    route.match(/if \(verifiedMembership\?\.length\) \{[\s\S]*?return response;\n  \}/)?.[0] ?? "";
  assert.match(membershipBranch, /hasVerifiedMembershipInvitation: true/);
  assert.match(membershipBranch, /cookies\.delete\(ACTIVE_PORTAL_ACCESS_COOKIE\)/);
  assert.doesNotMatch(membershipBranch, /cookies\.set/);
});

test("portal invitation completion reuses effective access and activation services", () => {
  const route = source("app/auth/invite/complete/route.ts");
  const portal = source("lib/auth/customer-portal.ts");
  assert.match(route, /resolveEffectiveCustomerPortalAccessesForUser\(user\.id\)/);
  assert.match(route, /getCustomerPortalOnboardingStatus\(\{/);
  assert.match(route, /Promise\.allSettled/);
  assert.match(portal, /\.eq\("user_id", userId\)/);
  assert.match(portal, /\.eq\("is_active", true\)/);
  assert.match(portal, /profile\?\.is_active !== true/);
  assert.match(portal, /resolvedAccesses\.filter\(\(item\) => item\.effective\)/);
  assert.match(
    source("lib/auth/customer-portal-effectiveness.ts"),
    /item\.organization_id === link\.organization_id/,
  );
});

test("Service Request first-use submission contract remains unchanged", () => {
  const form = source("app/portal/service-requests/new/page.tsx");
  const actions = source("lib/data/customer-portal-actions.ts");
  assert.match(form, /name="subject"/);
  assert.match(form, /name="description"/);
  assert.doesNotMatch(form, /required[^>]*(?:priority|status|assigned)/);
  assert.match(actions, /requireCustomerPortalContext\(\)/);
  assert.match(actions, /portal_submission_enabled === false/);
  assert.match(actions, /create_customer_service_request/);
  assert.match(actions, /deliverNewServiceRequestNotificationEmails/);
  assert.match(actions, /redirect\(`\/portal\/service-requests\/\$\{request\.id\}`\)/);
});
