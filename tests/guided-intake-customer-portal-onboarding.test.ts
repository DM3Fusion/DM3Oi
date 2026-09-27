import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseGuidedIntakePortalResolution,
  portalOnboardingResolvedForIntake,
  type CustomerPortalOnboardingStatus,
} from "../lib/customer-portal-onboarding.ts";

const source = (path: string) => readFileSync(path, "utf8");
const customerId = "customer-a";
const status = (
  state: CustomerPortalOnboardingStatus["state"],
): CustomerPortalOnboardingStatus => ({
  state,
  customerId,
  recipientEmail: "customer@example.com",
  invitationId: state === "INVITATION_SENT" ? "invitation-a" : null,
  lastSentAt: state === "INVITATION_SENT" ? "2026-09-27T00:00:00Z" : null,
  sendCount: state === "INVITATION_SENT" ? 1 : 0,
  reason: state === "UNAVAILABLE" ? "Portal is unavailable." : null,
});

test("manual onboarding stays nonblocking while prompt mode requires a resolution", () => {
  assert.equal(
    portalOnboardingResolvedForIntake(
      "MANUAL_ONLY",
      customerId,
      null,
      { resolution: "UNRESOLVED" },
    ),
    true,
  );
  assert.equal(
    portalOnboardingResolvedForIntake(
      "PROMPT_DURING_CASE_INTAKE",
      customerId,
      status("NOT_CONFIGURED"),
      { resolution: "UNRESOLVED" },
    ),
    false,
  );
});

test("ACTIVE, verified SENT, and intake-local NOT_REQUIRED resolve the gate", () => {
  assert.equal(
    portalOnboardingResolvedForIntake(
      "PROMPT_DURING_CASE_INTAKE",
      customerId,
      status("ACTIVE"),
      { resolution: "UNRESOLVED" },
    ),
    true,
  );
  assert.equal(
    portalOnboardingResolvedForIntake(
      "PROMPT_DURING_CASE_INTAKE",
      customerId,
      status("INVITATION_SENT"),
      {
        resolution: "INVITATION_SENT",
        customerId,
        recipientEmail: "customer@example.com",
        invitationId: "invitation-a",
      },
    ),
    true,
  );
  assert.equal(
    portalOnboardingResolvedForIntake(
      "PROMPT_DURING_CASE_INTAKE",
      customerId,
      status("UNAVAILABLE"),
      { resolution: "NOT_REQUIRED", customerId },
    ),
    true,
  );
});

test("failed, stale, cross-customer, and email-mismatched invitations fail closed", () => {
  const sent = status("INVITATION_SENT");
  for (const resolution of [
    { resolution: "UNRESOLVED" as const },
    {
      resolution: "INVITATION_SENT" as const,
      customerId: "customer-b",
      recipientEmail: "customer@example.com",
      invitationId: "invitation-a",
    },
    {
      resolution: "INVITATION_SENT" as const,
      customerId,
      recipientEmail: "changed@example.com",
      invitationId: "invitation-a",
    },
    {
      resolution: "INVITATION_SENT" as const,
      customerId,
      recipientEmail: "customer@example.com",
      invitationId: "invitation-b",
    },
  ])
    assert.equal(
      portalOnboardingResolvedForIntake(
        "PROMPT_DURING_CASE_INTAKE",
        customerId,
        sent,
        resolution,
      ),
      false,
    );
  assert.equal(
    portalOnboardingResolvedForIntake(
      "PROMPT_DURING_CASE_INTAKE",
      customerId,
      status("NOT_CONFIGURED"),
      {
        resolution: "INVITATION_SENT",
        customerId,
        recipientEmail: "customer@example.com",
        invitationId: "invitation-a",
      },
    ),
    false,
  );
});

test("draft parsing preserves safe NOT_REQUIRED state and rejects malformed state", () => {
  assert.deepEqual(
    parseGuidedIntakePortalResolution({
      resolution: "NOT_REQUIRED",
      customerId,
    }),
    {
      resolution: "NOT_REQUIRED",
      customerId,
      recipientEmail: undefined,
      invitationId: undefined,
    },
  );
  assert.deepEqual(parseGuidedIntakePortalResolution({ resolution: "SENT" }), {
    resolution: "UNRESOLVED",
  });
});

test("migration supplies tenant-safe durable lifecycle and an authoritative Case boundary", () => {
  const migration = source(
    "supabase/migrations/20260927000000_dm3oi_guided_intake_customer_portal_onboarding.sql",
  );
  assert.match(migration, /create table public\.customer_portal_invitations/);
  assert.match(migration, /'PENDING','SENT','ACTIVATED','FAILED','CANCELLED'/);
  assert.match(
    migration,
    /foreign key\(organization_id,customer_id,user_id\)[\s\S]*on update cascade on delete cascade/,
  );
  assert.match(migration, /enable row level security/);
  assert.match(migration, /invitation\.organization_id=target_organization_id/);
  assert.match(migration, /invitation\.customer_id=target_customer_id/);
  assert.match(migration, /invitation\.recipient_email=customer_email/);
  assert.match(migration, /link\.is_active/);
  assert.match(migration, /settings\.portal_enabled/);
  assert.match(migration, /auth_user\.email_confirmed_at/);
  assert.match(migration, /private\.create_guided_case_intake_with_required_options/);
  assert.doesNotMatch(migration, /generateLink|sendCustomerPortalInvitationEmail/);
});

test("Mimms alone is prompted and no existing Customer is invited by migration", () => {
  const migration = source(
    "supabase/migrations/20260927000000_dm3oi_guided_intake_customer_portal_onboarding.sql",
  );
  assert.match(migration, /e5a00c5a-f028-47f8-bb34-5527219eb995/);
  assert.match(migration, /PROMPT_DURING_CASE_INTAKE/);
  assert.doesNotMatch(
    migration,
    /insert into public\.customer_portal_invitations[\s\S]*select[\s\S]*from public\.customers/,
  );
});

test("provisioning records SENT only after delivery and reconciles activation on load", () => {
  const service = source("lib/data/customer-portal-provisioning-service.ts");
  const delivery = service.indexOf("sendCustomerPortalInvitationEmail");
  const sent = service.indexOf('status: "SENT"', delivery);
  assert.ok(delivery >= 0 && sent > delivery);
  assert.match(service, /status: "FAILED"/);
  assert.match(service, /status: "ACTIVATED"/);
  assert.match(service, /activated_at: invitation\.activated_at \?\? now/);
  assert.doesNotMatch(service, /invitationUrl[\s\S]*customer_portal_invitations[\s\S]*invitationUrl:/);
});

test("Guided Intake uses explicit actions and Customer creation/Case creation never send", () => {
  const component = source("components/cases/guided-case-intake.tsx");
  const actions = source("lib/data/guided-case-intake-actions.ts");
  const customerCreation = source("lib/data/customer-creation.ts");
  assert.match(component, /Send Portal Invitation/);
  assert.match(component, /Not Required for This Case/);
  assert.match(component, /Undo \/ Reconsider/);
  assert.match(actions, /sendGuidedIntakePortalInvitationAction/);
  assert.match(actions, /target_portal_onboarding: draft\.portalOnboarding/);
  assert.doesNotMatch(customerCreation, /provisionCustomerPortalAccess|sendCustomerPortalInvitationEmail/);
  assert.doesNotMatch(
    actions.match(/export async function createGuidedCaseAction[\s\S]*?export type GuidedIntakePortalActionResult/)?.[0] ?? "",
    /provisionCustomerPortalAccess/,
  );
});

test("draft persistence, settings UI, and lifecycle cascades are wired", () => {
  const actions = source("lib/data/guided-case-intake-actions.ts");
  const drafts = source("lib/data/guided-case-intake-drafts.ts");
  const settings = source("app/settings/customer-portal/page.tsx");
  const migration = source(
    "supabase/migrations/20260927000000_dm3oi_guided_intake_customer_portal_onboarding.sql",
  );
  assert.match(actions, /portal_onboarding: portalOnboarding/);
  assert.match(drafts, /parseGuidedIntakePortalResolution/);
  assert.match(settings, /Manual only/);
  assert.match(settings, /Prompt during Case Intake/);
  assert.match(migration, /references public\.customer_portal_users/);
  assert.match(migration, /on update cascade on delete cascade/);
});
