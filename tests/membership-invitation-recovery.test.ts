import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyInvitationDelivery } from "../lib/email/invitation-delivery-classification.ts";
import type { TrackedEmailDeliveryResult } from "../lib/email/tracked-delivery.ts";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20261015230000_dm3oi_membership_invitation_recovery.sql",
);

const invitation = source("lib/data/user-invitation-actions.ts");
const recovery = source("lib/data/organization-invitation-recovery.ts");
const classifier = source("lib/email/invitation-delivery-classification.ts");

const organizationInvitation = invitation.slice(
  invitation.indexOf("export async function inviteOrganizationUserAction"),
  invitation.indexOf("export async function resendUserInviteAction"),
);

function functionBody(name: string, endMarker: string): string {
  const start = migration.indexOf(
    `create or replace function public.${name}`,
  );
  assert.notEqual(start, -1, `${name} must exist`);

  const end = migration.indexOf(endMarker, start);
  assert.notEqual(end, -1, `${name} must have an end marker`);

  return migration.slice(start, end);
}

const prepare = functionBody(
  "prepare_organization_membership_invitation_v2",
  "alter function public.prepare_organization_membership_invitation_v2",
);

const complete = functionBody(
  "complete_organization_membership_invitation",
  "alter function public.complete_organization_membership_invitation",
);

const rollback = functionBody(
  "rollback_organization_membership_invitation",
  "alter function public.rollback_organization_membership_invitation",
);

const deliveryValidation = functionBody(
  "validate_invitation_delivery_operation",
  "$$;",
);

test("invitation recovery RPCs use restricted security-definer execution", () => {
  for (const body of [prepare, complete, rollback]) {
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
  }

  assert.match(
    migration,
    /grant execute[\s\S]*?prepare_organization_membership_invitation_v2[\s\S]*?to authenticated;/,
  );

  for (const name of [
    "complete_organization_membership_invitation",
    "rollback_organization_membership_invitation",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `grant execute\\s+on function public\\.${name}` +
        `[\\s\\S]*?to service_role;`,
      ),
    );
  }

  assert.match(complete, /auth\.role\(\)/);
  assert.match(rollback, /auth\.role\(\)/);
});

test("rollback rejects stale membership revisions", () => {
  assert.match(migration, /membership_revision bigint/);
  assert.match(migration, /increment_organization_membership_revision/);
  assert.match(rollback, /expected_membership_revision/);
  assert.match(rollback, /membership changed after invitation preparation/);
  assert.match(rollback, /for update/);
});

test("preparation fails authorization before locking target membership state", () => {
  const authorization = prepare.indexOf(
    "public.has_effective_organization_permission($1, 'MANAGE_USERS')",
  );
  const advisoryLock = prepare.indexOf("pg_advisory_xact_lock");
  const targetLock = prepare.indexOf(
    "where member.user_id = $2\n  for update",
  );

  assert.ok(authorization >= 0);
  assert.ok(advisoryLock > authorization);
  assert.ok(targetLock > advisoryLock);
  assert.match(prepare, /actor_role = 'BUSINESS_OWNER'/);
  assert.match(prepare, /actor_role = 'BUSINESS_ADMIN'/);
  assert.match(prepare, /organization\.status = 'ACTIVE'/);
  assert.match(prepare, /profile\.is_active/);
});

test("rollback protects accepted and unresolved delivery", () => {
  assert.match(rollback, /public\.email_deliveries/);
  assert.match(rollback, /invitation_operation_id = target_operation_id/);
  assert.match(rollback, /'SENT', 'PENDING'/);
  assert.match(rollback, /invitation delivery is accepted or unresolved/);
});

test("recovery retains memberships referenced by delivery or audit history", () => {
  assert.match(rollback, /RECOVERY_RETAINED/);
  assert.match(rollback, /public\.organization_membership_events/);
  assert.match(rollback, /public\.email_deliveries/);
  assert.match(rollback, /membership is not safely inactive/);
});

test("delivery operation associations are immutable", () => {
  assert.match(deliveryValidation, /security definer/);
  assert.match(deliveryValidation, /set search_path = ''/);
  assert.match(
    migration,
    /alter function public\.validate_invitation_delivery_operation\(\)\s+owner to postgres;/,
  );
  assert.match(
    migration,
    /revoke all\s+on function public\.validate_invitation_delivery_operation\(\)\s+from public, anon, authenticated, service_role;/,
  );
  assert.match(deliveryValidation, /old\.invitation_operation_id/);
  assert.match(deliveryValidation, /new\.invitation_operation_id/);
  assert.match(deliveryValidation, /old\.organization_id/);
  assert.match(deliveryValidation, /old\.membership_id/);
  assert.match(deliveryValidation, /old\.template_key/);
  assert.match(deliveryValidation, /PREPARED/);
});

test("delivery claims serialize against invitation completion and rollback", () => {
  assert.match(
    deliveryValidation,
    /where operation\.id = new\.invitation_operation_id\s+for update;/,
  );

  assert.match(
    complete,
    /where operation\.id = target_operation_id\s+for update;/,
  );

  assert.match(
    rollback,
    /where operation\.id = target_operation_id\s+for update;/,
  );

  assert.match(
    deliveryValidation,
    /invitation_operation\.status <> 'PREPARED'/,
  );
});

test("application uses operation-aware preparation and restricted recovery", () => {
  assert.match(
    organizationInvitation,
    /prepare_organization_membership_invitation_v2/,
  );
  assert.match(organizationInvitation, /invitationOperationId/);
  assert.match(organizationInvitation, /classifyInvitationDelivery/);
  assert.match(organizationInvitation, /completeOrganizationInvitation/);
  assert.match(organizationInvitation, /recoverOrganizationInvitation/);

  assert.match(
    recovery,
    /rollback_organization_membership_invitation/,
  );
  assert.match(
    recovery,
    /complete_organization_membership_invitation/,
  );

  assert.doesNotMatch(
    organizationInvitation,
    /\.from\("organization_members"\)\s*\.(?:insert|update|delete)\s*\(/,
  );

  assert.doesNotMatch(
    organizationInvitation,
    /admin\.auth\.admin\.deleteUser/,
  );
});

test("delivery classification treats uncertain SMTP failures conservatively", () => {
  assert.match(classifier, /"ACCEPTED"/);
  assert.match(classifier, /"CONFIRMED_NOT_SENT"/);
  assert.match(classifier, /"UNKNOWN"/);
  assert.match(classifier, /delivery\.transport === "SENT"/);
  assert.match(classifier, /default:\s*return "UNKNOWN"/);

  assert.match(
    organizationInvitation,
    /deliveryClassification === "UNKNOWN"/,
  );

  assert.match(
    organizationInvitation,
    /deliveryClassification === "CONFIRMED_NOT_SENT"/,
  );
});

test("delivery classification preserves accepted, confirmed, and unknown outcomes", () => {
  const accepted: TrackedEmailDeliveryResult = {
    ok: true,
    transport: "SENT",
    audit: "RECORDED",
    messageId: "message-1",
  };
  const confirmedNotSent: TrackedEmailDeliveryResult = {
    ok: false,
    transport: "NOT_SENT",
    audit: "RECORDED",
    errorCode: "RECIPIENT_REJECTED",
    safeMessage: "Recipient rejected.",
  };
  const unknown: TrackedEmailDeliveryResult = {
    ok: false,
    transport: "NOT_SENT",
    audit: "FINALIZATION_FAILED",
    errorCode: "MAIL_SEND_FAILED",
    safeMessage: "Delivery could not be confirmed.",
  };

  assert.equal(classifyInvitationDelivery(accepted), "ACCEPTED");
  assert.equal(
    classifyInvitationDelivery(confirmedNotSent),
    "CONFIRMED_NOT_SENT",
  );
  assert.equal(classifyInvitationDelivery(unknown), "UNKNOWN");
});

test("email-service exceptions preserve invitation state for reconciliation", () => {
  const deliveryStart = organizationInvitation.indexOf(
    "let delivery: TrackedEmailDeliveryResult | null = null;",
  );
  const classificationStart = organizationInvitation.indexOf(
    "const deliveryClassification",
    deliveryStart,
  );
  assert.ok(deliveryStart >= 0);
  assert.ok(classificationStart > deliveryStart);

  const deliveryBoundary = organizationInvitation.slice(
    deliveryStart,
    classificationStart,
  );
  assert.match(deliveryBoundary, /try\s*\{/);
  assert.match(deliveryBoundary, /catch \(error\)/);
  assert.match(deliveryBoundary, /invitationOperationId/);
  assert.match(deliveryBoundary, /membershipId/);
  assert.match(deliveryBoundary, /error instanceof Error \? error\.message/);
  assert.match(
    deliveryBoundary,
    /Invitation delivery could not be confirmed\. Contact support before retrying\./,
  );
  assert.doesNotMatch(deliveryBoundary, /recoverOrganizationInvitation\(/);
  assert.doesNotMatch(deliveryBoundary, /completeOrganizationInvitation\(/);
  assert.doesNotMatch(deliveryBoundary, /deleteUser\(/);
});

test("recovery and completion helpers convert unexpected exceptions to controlled results", () => {
  const completionStart = recovery.indexOf(
    "export async function completeOrganizationInvitation",
  );
  const recoveryStart = recovery.indexOf(
    "export async function recoverOrganizationInvitation",
  );
  const completionHelper = recovery.slice(completionStart, recoveryStart);
  const recoveryHelper = recovery.slice(recoveryStart);

  assert.match(completionHelper, /try\s*\{/);
  assert.match(completionHelper, /catch \(error\)/);
  assert.match(completionHelper, /return false;/);
  assert.match(recoveryHelper, /try\s*\{/);
  assert.match(recoveryHelper, /catch \(error\)/);
  assert.match(recoveryHelper, /return null;/);
});

test("only confirmed non-delivery invokes recovery after delivery classification", () => {
  const confirmedStart = organizationInvitation.indexOf(
    'deliveryClassification === "CONFIRMED_NOT_SENT"',
  );
  const unknownStart = organizationInvitation.indexOf(
    'deliveryClassification === "UNKNOWN"',
  );
  const completionStart = organizationInvitation.indexOf(
    "await completeOrganizationInvitation(",
  );

  assert.ok(confirmedStart >= 0);
  assert.ok(unknownStart > confirmedStart);
  assert.ok(completionStart > unknownStart);
  assert.match(
    organizationInvitation.slice(confirmedStart, unknownStart),
    /recoverOrganizationInvitation\(/,
  );
  assert.doesNotMatch(
    organizationInvitation.slice(unknownStart, completionStart),
    /recoverOrganizationInvitation\(/,
  );
  assert.doesNotMatch(
    organizationInvitation.slice(completionStart),
    /recoverOrganizationInvitation\(/,
  );
});

test("successful SMTP acceptance precedes invitation audit recording", () => {
  const completion = organizationInvitation.indexOf(
    "await completeOrganizationInvitation(",
  );

  const audit = organizationInvitation.indexOf(
    '"record_organization_membership_invitation_event"',
  );

  assert.ok(completion >= 0);
  assert.ok(audit > completion);
});

test("audit RPC errors and exceptions cannot invalidate delivered invitations", () => {
  const auditStart = organizationInvitation.indexOf(
    '"record_organization_membership_invitation_event"',
  );
  const successStart = organizationInvitation.indexOf(
    'revalidatePath("/users")',
    auditStart,
  );
  const auditBoundary = organizationInvitation.slice(auditStart, successStart);

  assert.ok(auditStart >= 0);
  assert.ok(successStart > auditStart);
  assert.match(auditBoundary, /membershipEventError/);
  assert.match(auditBoundary, /catch \(error\)/);
  assert.doesNotMatch(auditBoundary, /recoverOrganizationInvitation\(/);
  assert.doesNotMatch(auditBoundary, /deleteUser\(/);
  assert.match(
    organizationInvitation.slice(successStart),
    /Invitation sent\./,
  );
});
