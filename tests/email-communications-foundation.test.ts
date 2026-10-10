import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolvePendingInviteIdentityRepair } from "../lib/data/pending-invite-identity.ts";
import {
  defaultEmailTemplates,
  emailTemplateKeys,
  renderEmailTemplate,
  validateEmailTemplateContent,
} from "../lib/email/templates.ts";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source("supabase/migrations/20260927010000_dm3oi_platform_email_delivery.sql");

test("pending invite identity repair upgrades only an email-shaped display name", () => {
  assert.deepEqual(
    resolvePendingInviteIdentityRepair({
      authEmail: "invitee@example.com",
      profile: {
        email: "invitee@example.com",
        first_name: null,
        last_name: null,
        display_name: "INVITEE@example.com",
        title: null,
      },
      userMetadata: {
        first_name: "Avery",
        last_name: "Mimms",
        display_name: "Avery Mimms",
        title: "Manager",
      },
    }),
    {
      email: "invitee@example.com",
      first_name: "Avery",
      last_name: "Mimms",
      display_name: "Avery Mimms",
      title: "Manager",
    },
  );
  assert.equal(
    resolvePendingInviteIdentityRepair({
      authEmail: "invitee@example.com",
      profile: {
        email: "invitee@example.com",
        first_name: "Canonical",
        last_name: "Person",
        display_name: "Canonical Person",
        title: null,
      },
      userMetadata: { display_name: "Different Metadata" },
    }),
    null,
  );
});

test("platform template catalog is bounded to DM3Oi transactional messages", () => {
  assert.deepEqual(emailTemplateKeys, [
    "ORGANIZATION_USER_INVITATION",
    "ORGANIZATION_USER_INVITATION_RESEND",
    "CUSTOMER_PORTAL_INVITATION",
    "MISSING_DOCUMENTS_NOTICE",
    "SIGN_IN_CODE",
    "NEW_SERVICE_REQUEST_NOTIFICATION",
    "CUSTOMER_DATA_SUBMISSION_NOTIFICATION",
    "NEW_TRIAL_REQUEST_NOTIFICATION",
  ]);
  assert.doesNotMatch(source("lib/email/templates.ts"), /SURVEY_REPORT|SURVEY_FOLLOW_UP/);
  assert.match(source("lib/application-navigation.ts"), /\/admin\/email-templates/);
  assert.match(source("app/admin/email-templates/page.tsx"), /requireSuperAdmin\(\)/);
  assert.match(source("app/admin/email-templates/actions.ts"), /requireSuperAdmin\(\)/);
});

test("template variables are allowlisted and rendered with escaped HTML", () => {
  assert.equal(
    validateEmailTemplateContent("ORGANIZATION_USER_INVITATION", {
      subject_template: "{{organization_name}} invite",
      opening_message: "Hello {{recipient_first_name}}",
      closing_message: "{{action_url}}",
    }).ok,
    true,
  );
  assert.equal(
    validateEmailTemplateContent("ORGANIZATION_USER_INVITATION", {
      subject_template: "{{organization_name}} invite",
      opening_message: "{{database_secret}}",
      closing_message: "{{action_url}}",
    }).ok,
    false,
  );
  assert.equal(
    validateEmailTemplateContent("ORGANIZATION_USER_INVITATION", {
      subject_template: "Invite\nBcc: attacker@example.com",
      opening_message: "Hello",
      closing_message: "Goodbye",
    }).ok,
    false,
  );
  const rendered = renderEmailTemplate(defaultEmailTemplates.ORGANIZATION_USER_INVITATION, {
    organization_name: "Mimms' Tax Service <script>",
    recipient_first_name: "Avery",
    role: "Staff User",
    action_url: "https://dm3oi.example/invite?a=1&b=2",
  });
  assert.match(rendered.text, /join Mimms' Tax Service <script>/);
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /Mimms&#39; Tax Service &lt;script&gt;/);
  assert.match(rendered.html, /a=1&amp;b=2/);
});

test("initial and resent organization invitations include server-derived organization context", () => {
  const actions = source("lib/data/user-invitation-actions.ts");
  const service = source("lib/data/organization-invitation-email-service.ts");
  assert.match(actions, /organizationName: activeOrganization\.name/);
  assert.match(actions, /organizationName: invitationOrganization\.name/);
  assert.match(actions, /\.from\("organizations"\)\.select\("name"\)/);
  assert.match(service, /ORGANIZATION_USER_INVITATION_RESEND/);
  assert.match(service, /ORGANIZATION_USER_INVITATION/);
  assert.match(service, /organization_name: organizationDisplayName/);
  assert.doesNotMatch(actions, /value\(form, "organizationName"\)/);
});

test("confirmed SMTP transport prevents destructive invitation rollback", () => {
  const actions = source("lib/data/user-invitation-actions.ts");
  assert.match(actions, /invitationTransportSent = delivery\.transport === "SENT"/);
  assert.match(actions, /if \(!invitationTransportSent\) \{[\s\S]*Never invalidate an emailed link/);
  assert.match(actions, /if \(!delivery\.ok\) \{[\s\S]*deleteUser\(targetUserId\)/);
  assert.match(actions, /if \(!delivery\.ok\) \{[\s\S]*\.delete\(\)[\s\S]*The invitation could not be sent/);
  const portal = source("lib/data/customer-portal-provisioning-service.ts");
  assert.match(portal, /const lifecycle = delivery\.ok[\s\S]*status: "SENT"/);
  assert.doesNotMatch(portal, /delivery\.ok[\s\S]{0,500}deleteUser/);
});

test("delivery records are trusted-only, tenant-linked, and record sent and failed outcomes", () => {
  const delivery = source("lib/email/tracked-delivery.ts");
  assert.match(migration, /create table public\.email_deliveries/);
  assert.match(migration, /delivery_status in \('PENDING', 'SENT', 'FAILED'\)/);
  assert.match(migration, /tracking_token uuid not null default gen_random_uuid\(\) unique/);
  assert.match(migration, /alter table public\.email_deliveries enable row level security/);
  assert.match(migration, /email_deliveries_super_admin_read/);
  assert.match(migration, /grant select, insert, update, delete on public\.email_deliveries to service_role/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete).*email_deliveries.*authenticated/i);
  assert.match(delivery, /delivery_status: "PENDING"/);
  assert.match(delivery, /delivery_status: "SENT"/);
  assert.match(delivery, /delivery_status: "FAILED"/);
  assert.match(delivery, /provider_message_id: result\.messageId/);
  assert.match(delivery, /transport: "SENT"[\s\S]*audit: "FINALIZATION_FAILED"/);
  assert.match(delivery, /auditErrorCode: "DELIVERY_STATE_UPDATE_FAILED"/);
  assert.match(delivery, /\.eq\("delivery_status", "PENDING"\)[\s\S]*\.maybeSingle\(\)/);
});

test("organization-owned delivery references are tenant-bound at the database boundary", () => {
  assert.match(migration, /organization_members_organization_id_id_key[\s\S]*unique \(organization_id, id\)/);
  for (const reference of ["membership", "customer", "case", "service_request"]) {
    assert.match(
      migration,
      new RegExp(`foreign key \\(organization_id, ${reference}_id\\)[\\s\\S]*references public\\.[a-z_]+\\(organization_id, id\\)`),
    );
  }
  assert.match(migration, /on delete set null \(membership_id\)/);
  assert.match(migration, /organization_id is not null or \([\s\S]*membership_id is null/);
});

test("organization audit independently excludes active SUPER_ADMIN recipients", () => {
  assert.match(
    migration,
    /not exists \([\s\S]*from public\.platform_user_roles platform_role[\s\S]*platform_role\.user_id = delivery\.recipient_user_id[\s\S]*platform_role\.role = 'SUPER_ADMIN'[\s\S]*platform_role\.is_active = true/,
  );
});

test("SIGN_IN_CODE editor explains that production OTP remains Supabase-owned", () => {
  const page = source("app/admin/email-templates/page.tsx");
  assert.match(page, /activeKey === "SIGN_IN_CODE"/);
  assert.match(page, /Saving this template does not change the production Supabase Auth sign-in code email/);
  assert.match(page, /preview and test-send only/);
});

test("open tracking is first-open only and always returns the pixel", () => {
  const route = source("app/api/email/open/[token]/route.ts");
  assert.match(route, /\.eq\("delivery_status", "SENT"\)/);
  assert.match(route, /\.is\("opened_at", null\)/);
  assert.match(route, /return new NextResponse\(pixel/);
  assert.match(route, /catch \(error\)/);
  assert.match(route, /"Content-Type": "image\/png"/);
});

test("email audit extends Communications without changing personal Inbox state", () => {
  const repository = source("lib/data/communications-repository.ts");
  const inbox = source("components/communications-inbox.tsx");
  assert.match(migration, /get_organization_email_delivery_audit/);
  assert.match(migration, /array\['BUSINESS_OWNER'\]/);
  assert.match(migration, /delivery\.organization_id = target_organization_id/);
  assert.match(repository, /communication_kind: "EMAIL_DELIVERY"/);
  assert.match(repository, /source_domain: "EMAIL"/);
  assert.match(inbox, /Email delivery\/open state is separate from Inbox read state/);
  assert.match(source("lib/data/communications-repository.ts"), /getUnreadNotificationCountForScope/);
});

test("organization reset and permanent deletion include delivery history while platform templates persist", () => {
  assert.match(migration, /'emailDeliveries'/);
  assert.match(migration, /delete from public\.email_deliveries[\s\S]*organization_id = target_organization_id/);
  assert.match(migration, /organization_id uuid references public\.organizations\(id\) on delete cascade/);
  assert.match(source("components/super-admin-organization-reset.tsx"), /Email delivery history/);
  assert.match(source("components/super-admin-organization-delete.tsx"), /Email delivery history/);
  assert.doesNotMatch(migration, /delete from public\.platform_email_templates/);
});

test("Customer Portal lifecycle and canonical response evidence remain separate", () => {
  const portal = source("lib/data/customer-portal-provisioning-service.ts");
  assert.match(portal, /customer_portal_invitations/);
  assert.match(portal, /sendCustomerPortalInvitationEmail/);
  assert.doesNotMatch(migration, /customer_response_evidence|service_request_messages/);
});
