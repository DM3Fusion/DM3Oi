import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("login presents only the email verification-code experience", () => {
  const page = source("app/login/page.tsx");

  assert.match(page, /title="Sign in"/);
  assert.match(
    page,
    /description="Sign in using a verification code sent to your email\."/,
  );
  assert.match(page, /<span>Enter your Email Address<\/span>/);
  assert.match(page, /name="email"/);
  assert.match(page, />\s*Send Code\s*</);
  assert.doesNotMatch(page, /auth-tabs|Password|type="password"|signInAction/);
});

test("OTP requests cannot create arbitrary Auth users and avoid enumeration", () => {
  const actions = source("lib/auth/actions.ts");
  const supabaseConfig = source("supabase/config.toml");

  assert.match(
    actions,
    /signInWithOtp\(\{email,options:\{shouldCreateUser:false\}\}\)/,
  );
  assert.match(
    actions,
    /If this email is associated with an authorized DM3Oi account, a login code will be sent\./,
  );
  assert.doesNotMatch(actions, /signInWithPassword|Invalid email or password/);
  assert.match(supabaseConfig, /enable_signup = false/);
});

test("OTP verification preserves secure redirect and session flow", () => {
  const page = source("app/login/page.tsx");
  const actions = source("lib/auth/actions.ts");
  const proxy = source("proxy.ts");

  assert.match(page, /name="token"/);
  assert.match(page, /autoComplete="one-time-code"/);
  assert.match(page, /placeholder="000000"/);
  assert.match(actions, /verifyOtp\(\{email,token,type:"email"\}\)/);
  assert.match(actions, /safeInternalPath\(read\(formData,"next"\)\)/);
  assert.match(actions, /redirect\(next\)/);
  assert.match(proxy, /supabase\.auth\.getUser\(\)/);
});

test("post-auth access routing preserves internal, portal, platform, and unprovisioned isolation", () => {
  const rootPage = source("app/page.tsx");
  const accessRouting = source("lib/auth/access-routing.ts");
  const context = source("lib/auth/context.ts");

  assert.match(rootPage, /resolveRootExperience/);
  assert.match(rootPage, /experience==="PLATFORM"/);
  assert.match(rootPage, /experience==="PORTAL"\)redirect\("\/portal"\)/);
  assert.match(
    rootPage,
    /experience==="UNPROVISIONED"\)redirect\("\/account\/unprovisioned"\)/,
  );
  assert.match(
    accessRouting,
    /if \(access\.isSuperAdmin && !access\.hasActiveOrganization\) return "PLATFORM"/,
  );
  assert.match(
    accessRouting,
    /if \(\(access\.customerPortalCount \?\? 0\) > 0\) return "PORTAL"/,
  );
  assert.match(context, /customer_portal_users/);
  assert.match(context, /platform_user_roles/);
  assert.match(context, /organization_members/);
});

test("internal and Customer Portal invitation acceptance remains separate and compatible", () => {
  const internalInvitations = source("lib/data/user-invitation-actions.ts");
  const portalInvitations = source(
    "lib/data/customer-portal-provisioning-actions.ts",
  );
  const invitePage = source("app/auth/invite/page.tsx");

  assert.match(internalInvitations, /inviteUserByEmail/);
  assert.match(portalInvitations, /generateLink\(\{/);
  assert.match(portalInvitations, /type: "invite"/);
  assert.match(portalInvitations, /customer_portal_users/);
  assert.match(invitePage, /setSession/);
  assert.match(invitePage, /getUser/);
});

test("login styling remains bounded and mobile-friendly", () => {
  const css = source("app/globals.css");

  assert.match(
    css,
    /\.auth-page\{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 16px/,
  );
  assert.match(css, /\.auth-card\{width:100%;max-width:448px/);
  assert.match(css, /\.auth-form input\{width:100%;height:40px/);
});
