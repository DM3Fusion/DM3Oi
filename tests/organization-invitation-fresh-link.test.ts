import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildInvitationVerificationUrl } from "../lib/auth/invitation-verification-url.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("fresh custom invitations enter the application before token verification", () => {
  const generatedActionLink =
    "https://project.supabase.co/auth/v1/verify?token=hashed-invite-token&type=invite&redirect_to=https%3A%2F%2Fdm3oi.com%2Fauth%2Finvite";
  const deliveredUrl = buildInvitationVerificationUrl({
    redirectUrl: "https://dm3oi.com/auth/invite",
    hashedToken: "hashed-invite-token",
    verificationType: "invite",
  });

  assert.equal(
    new URL(generatedActionLink).searchParams.get("redirect_to"),
    "https://dm3oi.com/auth/invite",
  );
  assert.equal(
    deliveredUrl,
    "https://dm3oi.com/auth/invite?token_hash=hashed-invite-token&type=invite",
  );
  assert.notEqual(deliveredUrl, generatedActionLink);
});

test("only invitation-compatible token hashes can be converted into application links", () => {
  assert.equal(
    buildInvitationVerificationUrl({
      redirectUrl: "https://dm3oi.com/auth/invite",
      hashedToken: "hashed-magic-token",
      verificationType: "magiclink",
    }),
    "https://dm3oi.com/auth/invite?token_hash=hashed-magic-token&type=magiclink",
  );
  assert.throws(
    () =>
      buildInvitationVerificationUrl({
        redirectUrl: "https://dm3oi.com/auth/invite",
        hashedToken: "hashed-token",
        verificationType: "recovery",
      }),
    /INVITATION_LINK_INVALID/,
  );
  assert.throws(
    () =>
      buildInvitationVerificationUrl({
        redirectUrl: "https://dm3oi.com/auth/invite",
        hashedToken: " ",
        verificationType: "invite",
      }),
    /INVITATION_LINK_INVALID/,
  );
});

test("Barbara fresh-invite sequence establishes Auth before server reconciliation", () => {
  const actions = source("lib/data/user-invitation-actions.ts");
  const page = source("app/auth/invite/page.tsx");
  const completion = source("app/auth/invite/complete/route.ts");

  assert.match(actions, /generated\.data\.properties\?\.hashed_token/);
  assert.match(actions, /getInvitationVerificationUrl/);
  assert.doesNotMatch(actions, /invitationUrl:\s*generated\.data\.properties\.action_link/);
  assert.match(page, /verificationType==="invite"\|\|verificationType==="magiclink"/);
  assert.match(page, /verifyOtp\(\{token_hash:tokenHash,type:verificationType\}\)/);
  assert.ok(page.indexOf("verifyOtp") < page.indexOf("getUser"));
  assert.ok(page.indexOf("getUser") < page.indexOf('window.location.replace("/auth/invite/complete")'));
  assert.ok(completion.indexOf("getUser") < completion.indexOf('rpc(\n    "verify_my_membership_invitation"'));
  assert.match(completion, /verifiedMembership\?\.length/);
  assert.match(completion, /account\/pending-activation/);
});

test("invitation completion is public to the access guard and failures stay explicit", () => {
  const proxy = source("proxy.ts");
  const page = source("app/auth/invite/page.tsx");
  const completion = source("app/auth/invite/complete/route.ts");
  const callback = source("app/auth/callback/route.ts");

  assert.match(proxy, /"\/auth\/invite"/);
  assert.match(proxy, /pathname\.startsWith\(`\$\{route\}\/`\)/);
  assert.match(completion, /auth\/invite\?error=membership_verification/);
  assert.match(callback, /auth\/invite\?error=membership_verification/);
  assert.match(page, /organization invitation verification could not be completed/);
  assert.doesNotMatch(completion, /return invitationRedirect\(request, "\/account\/unprovisioned"\)/);
});

test("confirmed-but-INVITED organization identities remain resendable for lifecycle recovery", () => {
  const actions = source("lib/data/user-invitation-actions.ts");
  const eligibility = actions.slice(
    actions.indexOf("export async function getInvitationEligibility"),
    actions.indexOf("export async function updateUserProfileAction"),
  );
  const resend = actions.slice(
    actions.indexOf("export async function resendUserInviteAction"),
    actions.indexOf("export async function getInvitationEligibility"),
  );

  assert.match(eligibility, /member\.status !== "INVITED"/);
  assert.match(eligibility, /return !error && Boolean\(data\?\.user\?\.email\)/);
  assert.match(resend, /!organizationId && \(targetUser\.email_confirmed_at \|\| targetUser\.last_sign_in_at\)/);
  assert.match(resend, /targetUser\.email_confirmed_at \|\| targetUser\.last_sign_in_at[\s\S]*\? "magiclink"[\s\S]*: "invite"/);
  assert.match(resend, /type: resendLinkType/);
  assert.doesNotMatch(
    resend,
    /if \(targetUser\.email_confirmed_at \|\| targetUser\.last_sign_in_at\) return/,
  );
});

test("OTP reconciliation and INVITED to VERIFIED to ACTIVE lifecycle remain intact", () => {
  const otp = source("lib/auth/actions.ts");
  const verification = source(
    "supabase/migrations/20260927120000_dm3oi_invitation_verification_activation.sql",
  );
  const activation = source(
    "supabase/migrations/20260925150000_dm3oi_remove_public_user_role.sql",
  );

  assert.match(otp, /verifyOtp\(\{email,token,type:"email"\}\)/);
  assert.match(otp, /verify_my_membership_invitation/);
  assert.match(verification, /actor uuid := auth\.uid\(\)/);
  assert.match(verification, /status = 'VERIFIED'/);
  assert.doesNotMatch(
    verification.slice(
      verification.indexOf("create or replace function public.verify_my_membership_invitation"),
      verification.indexOf("revoke all on function public.verify_my_membership_invitation"),
    ),
    /set[\s\S]{0,80}status = 'ACTIVE'/,
  );
  assert.match(activation, /when 'ACTIVATE'[\s\S]*membership\.status <> 'VERIFIED'/);
});


test("invitation verification ambiguity is fixed without changing lifecycle semantics", () => {
  const migration = source(
    "supabase/migrations/20260927123000_dm3oi_fix_invitation_verification_ambiguity.sql",
  );

  assert.match(
    migration,
    /update public\.organization_members as member_to_verify/,
  );
  assert.match(
    migration,
    /member_to_verify\.organization_id = membership\.organization_id/,
  );
  assert.match(
    migration,
    /member_to_verify\.status = 'INVITED'/,
  );
  assert.match(migration, /set status = 'VERIFIED'/);
  assert.doesNotMatch(
    migration,
    /set[\s\S]{0,80}status = 'ACTIVE'/,
  );
  assert.match(
    migration,
    /grant execute on function public\.verify_my_membership_invitation\(\)[\s\S]*to authenticated/,
  );
});

test("invitation verification pages use the canonical DM3Oi AuthCard", () => {
  const invite = source("app/auth/invite/page.tsx");
  const pending = source("app/account/pending-activation/page.tsx");

  assert.match(invite, /import \{ AuthCard \}/);
  assert.match(invite, /<AuthCard/);
  assert.doesNotMatch(invite, /<main className="public-main"/);

  assert.match(pending, /import \{ AuthCard \}/);
  assert.match(pending, /<AuthCard/);
  assert.doesNotMatch(pending, /<main className="public-main"/);
});


test("pending organization identities reach awaiting activation without gaining organization access", () => {
  const proxy = source("proxy.ts");

  assert.match(
    proxy,
    /getMyPendingOrganizationMembership\(supabase\)/,
  );
  assert.doesNotMatch(
    proxy,
    /organization_members"\)\.select\("id,status"\)\.eq\("user_id",user\.id\)\.eq\("is_active",false\)/,
  );
  assert.match(
    proxy,
    /!hasActiveAccess&&hasPendingOrganizationAccess[\s\S]*\/account\/pending-activation/,
  );
  assert.match(
    proxy,
    /!hasActiveAccess[\s\S]*\/account\/unprovisioned/,
  );
});

test("organization shell reconciles personal Inbox attention and open Users views", () => {
  const shell = source("components/layout/app-shell.tsx");

  assert.match(shell, /liveUnreadNotificationCount/);
  assert.match(
    shell,
    /\.eq\("recipient_user_id", access\.user\.id\)/,
  );
  assert.match(shell, /window\.setInterval[\s\S]*30_000/);
  assert.match(shell, /window\.addEventListener\("focus"/);
  assert.match(shell, /visibilitychange/);
  assert.match(
    shell,
    /pathname === "\/users" \|\| pathname\.startsWith\("\/users\/"\)[\s\S]*router\.refresh\(\)/,
  );
});


test("organization invitation structured names outrank stale display-name metadata", () => {
  const actions = source("lib/data/user-invitation-actions.ts");
  const repair = source("lib/data/pending-invite-identity.ts");
  const migration = source(
    "supabase/migrations/20260927130000_dm3oi_invitation_structured_name_precedence.sql",
  );

  assert.match(
    actions,
    /profile\?\.first_name\?\.trim\(\) \|\| firstName[\s\S]*profile\?\.last_name\?\.trim\(\) \|\| lastName/,
  );
  assert.match(
    actions,
    /`\$\{resolvedFirstName\} \$\{resolvedLastName\}`\.trim\(\)[\s\S]*profile\?\.display_name/,
  );
  assert.match(
    actions,
    /first_name: firstName,[\s\S]*last_name: lastName,[\s\S]*display_name: displayName/,
  );
  assert.match(
    repair,
    /const displayName =[\s\S]*profileDerivedName \|\|[\s\S]*metadataDerivedName/,
  );
  assert.match(
    migration,
    /concat_ws\(' ', repaired_first_name, repaired_last_name\)[\s\S]*repaired_display_name/,
  );
});


test("organization invitations always require explicit membership acceptance even for confirmed Auth identities", () => {
  const actions = source("lib/data/user-invitation-actions.ts");
  const organizationInvite = actions.slice(
    actions.indexOf("export async function inviteOrganizationUserAction"),
    actions.indexOf("export async function resendUserInviteAction"),
  );

  assert.match(
    organizationInvite,
    /const existingIdentityConfirmed = Boolean\([\s\S]*email_confirmed_at[\s\S]*last_sign_in_at/,
  );
  assert.match(
    organizationInvite,
    /status: "INVITED"[\s\S]*is_active: false[\s\S]*verified_at: null/,
  );
  assert.doesNotMatch(
    organizationInvite,
    /status: identityVerified \? "VERIFIED" : "INVITED"/,
  );
  assert.match(
    organizationInvite,
    /existingIdentityConfirmed[\s\S]*\? "magiclink"[\s\S]*: "invite"/,
  );
  assert.match(
    organizationInvite,
    /type: organizationLinkType/,
  );
  assert.match(
    organizationInvite,
    /verification_type !== organizationLinkType/,
  );
  assert.match(
    organizationInvite,
    /target_event_type: "INVITED"/,
  );
  assert.match(
    organizationInvite,
    /encodeURIComponent\("Invitation sent\."\)/,
  );
});
