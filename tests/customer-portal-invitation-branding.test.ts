import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CUSTOMER_PORTAL_INVITATION_CONTEXT,
  customerPortalInvitationMetadata,
} from "../lib/data/customer-portal-invitation-metadata.ts";
import {
  buildCustomerPortalInvitationEmail,
  deliverCustomerPortalInvitationEmail,
  type EmailMessage,
  type EmailProvider,
} from "../lib/email/delivery.ts";

const source = (path: string) => readFileSync(path, "utf8");
const portalAction = source("lib/data/customer-portal-provisioning-actions.ts");
const internalAction = source("lib/data/user-invitation-actions.ts");
const emailService = source("lib/data/customer-portal-invitation-email-service.ts");
const mailer = source("lib/email/mailer.ts");
const customerPage = source("app/customers/[customerId]/page.tsx");

test("new Customer Portal invitations use a generated Auth link without a Supabase email", () => {
  assert.deepEqual(customerPortalInvitationMetadata(undefined, "Fobbs Quality Signs"), {
    organization_name: "Fobbs Quality Signs",
    invitation_context: "customer_portal",
  });
  assert.equal(CUSTOMER_PORTAL_INVITATION_CONTEXT, "customer_portal");
  assert.match(
    portalAction,
    /generateLink\(\{[\s\S]*type: "invite",[\s\S]*email,[\s\S]*options: \{[\s\S]*redirectTo: getInvitationRedirect\(\),[\s\S]*data: customerPortalInvitationMetadata\(undefined, org\.name\)/,
  );
  assert.match(portalAction, /generated\.data\.properties\.action_link/);
  assert.doesNotMatch(portalAction, /inviteUserByEmail/);
});

test("Customer Portal reissues preserve metadata and refresh authoritative branding", () => {
  assert.deepEqual(
    customerPortalInvitationMetadata(
      {
        display_name: "Portal Customer",
        existing_key: "preserved",
        organization_name: "Browser Supplied Name",
        invitation_context: "organization_user",
      },
      "Authorized Organization",
    ),
    {
      display_name: "Portal Customer",
      existing_key: "preserved",
      organization_name: "Authorized Organization",
      invitation_context: "customer_portal",
    },
  );
  assert.match(
    portalAction,
    /customerPortalInvitationMetadata\(authUser\.user_metadata, org\.name\)/,
  );
  assert.match(portalAction, /email_confirmed_at \|\| authUser\.last_sign_in_at/);
  assert.match(portalAction, /authUser = generated\.data\.user \?\? authUser/);
  assert.match(portalAction, /linked\.data\?\.user_id === authUser\.id/);
  assert.match(portalAction, /existing\.data[\s\S]*update\(\{ is_active: true \}\)[\s\S]*insert/);
});

test("branded Customer Portal email has exact authoritative copy and HTML/plain-text CTA", () => {
  const invitationUrl = "https://auth.example/verify?token=sensitive&next=%3Cportal%3E";
  const email = buildCustomerPortalInvitationEmail({
    to: "customer@example.com",
    organizationName: "Fobbs Quality Signs",
    invitationUrl,
  });
  assert.equal(email.to, "customer@example.com");
  assert.equal(email.fromName, "DM3Oi™");
  assert.equal(email.subject, "Fobbs Quality Signs invited you to their Customer Portal");
  assert.match(email.text, /You're invited to the Fobbs Quality Signs Customer Portal/);
  assert.match(email.text, /powered by DM3Oi™ Operational Intelligence/);
  assert.match(email.text, /service requests, case progress, and messages with Fobbs Quality Signs/);
  assert.match(email.text, /Access Customer Portal:\nhttps:\/\/auth\.example\/verify/);
  assert.match(email.text, /If you weren't expecting this invitation from Fobbs Quality Signs/);
  assert.match(email.text, /DM3Oi™ — Operational Intelligence/);
  assert.match(email.text, /People\. Work\. Progress\. Intelligence\./);
  assert.match(email.html ?? "", /Access Customer Portal/);
  assert.match(email.html ?? "", /href="https:\/\/auth\.example\/verify\?token=sensitive&amp;next=%3Cportal%3E"/);
});

test("Fastmail application provider receives both HTML and plain-text content", async () => {
  const messages: EmailMessage[] = [];
  const provider: EmailProvider = {
    async send(message) {
      messages.push(message);
      return { ok: true };
    },
  };
  assert.deepEqual(
    await deliverCustomerPortalInvitationEmail(
      {
        recipientEmail: "customer@example.com",
        organizationName: "Authorized Organization",
        invitationUrl: "https://auth.example/invite",
      },
      provider,
    ),
    { ok: true },
  );
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, "customer@example.com");
  assert.ok(messages[0].text);
  assert.ok(messages[0].html);
  assert.match(emailService, /applicationEmailProvider/);
  assert.match(emailService, /deliverCustomerPortalInvitationEmail\(input, provider\)/);
  assert.match(mailer, /text: input\.text/);
  assert.match(mailer, /html: input\.html/);
  assert.doesNotMatch(emailService, /nodemailer|SMTP_|process\.env/);
});

test("unexpected provider failures become safe retryable delivery failures", async () => {
  const provider: EmailProvider = {
    async send() {
      throw new Error("contains provider internals");
    },
  };
  assert.deepEqual(
    await deliverCustomerPortalInvitationEmail(
      {
        recipientEmail: "customer@example.com",
        organizationName: "Authorized Organization",
        invitationUrl: "https://auth.example/invite?token=sensitive",
      },
      provider,
    ),
    {
      ok: false,
      errorCode: "MAIL_SEND_FAILED",
      safeMessage: "Customer Portal invitation email could not be sent.",
    },
  );
});

test("portal invitation branding is server-derived and grants no access", () => {
  assert.doesNotMatch(portalAction, /value\(form, "organizationName"\)/);
  assert.match(portalAction, /const \{ org \} = await authorize\(customerId\)/);
  assert.match(portalAction, /\.eq\("organization_id", org\.id\)/);
  assert.match(portalAction, /\.from\("customer_portal_users"\)/);
  assert.match(portalAction, /organization_id: org\.id, customer_id: customerId, user_id: authUser\.id/);
  assert.doesNotMatch(portalAction, /\.from\("organization_members"\)\.insert/);
  const metadata = source("lib/data/customer-portal-invitation-metadata.ts");
  assert.doesNotMatch(metadata, /role|permission|customer_id|organization_id|user_id/);
  assert.doesNotMatch(portalAction, /value\(form, "(?:organizationName|recipientEmail|invitationUrl)"\)/);
});

test("delivery failure preserves prepared access, reports failure, and logs no invitation URL", () => {
  const relationWrite = portalAction.indexOf("const relation = existing.data");
  const delivery = portalAction.indexOf("sendCustomerPortalInvitationEmail({");
  assert.ok(relationWrite >= 0 && delivery > relationWrite);
  assert.match(portalAction, /Customer Portal access was prepared, but the invitation email could not be sent\./);
  assert.doesNotMatch(portalAction, /deleteUser|\.delete\(\)/);
  assert.doesNotMatch(portalAction, /console\.(?:log|error|warn)\([^\n]*(?:invitationUrl|action_link|hashed_token|email_otp)/);
});

test("success, resend, and duplicate-submit UI semantics are explicit", () => {
  assert.match(portalAction, /Customer Portal invitation sent\./);
  assert.match(portalAction, /Customer Portal invitation resent\./);
  assert.match(customerPage, /PendingSubmitButton[^>]*pendingLabel="Sending…"/);
  assert.match(customerPage, /PendingSubmitButton[^>]*pendingLabel="Resending…"/);
  assert.match(customerPage, /PendingSubmitButton[^>]*pendingLabel="Updating…"/);
});

test("internal and generic invitation contracts remain distinct", () => {
  assert.match(internalAction, /inviteUserByEmail/);
  assert.match(internalAction, /organization_name: activeOrganization\.name/);
  assert.doesNotMatch(internalAction, /customer_portal/);
  assert.match(
    internalAction,
    /invitationOrganization[\s\S]*organizationInvitationMetadata[\s\S]*: \{ display_name: displayName \}/,
  );
});
