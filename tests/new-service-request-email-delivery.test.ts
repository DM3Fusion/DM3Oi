import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildNewServiceRequestEmail,
  deliverEmailOnce,
  type EmailDeliveryStore,
  type EmailProvider,
  type MailResult,
} from "../lib/email/delivery.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function memoryDelivery(
  providerResult: MailResult,
  providerThrows = false,
) {
  let claimed = false;
  let sends = 0;
  const completions: MailResult[] = [];
  const store: EmailDeliveryStore = {
    async claim() {
      if (claimed) return null;
      claimed = true;
      return { id: "delivery-1" };
    },
    async complete(_deliveryId, result) {
      completions.push(result);
    },
  };
  const provider: EmailProvider = {
    async send() {
      sends += 1;
      if (providerThrows) throw new Error("mock provider failure");
      return providerResult;
    },
  };
  return { store, provider, sends: () => sends, completions };
}

test("new request email has the safe operational subject, body, and trusted destination", () => {
  const email = buildNewServiceRequestEmail({
    to: "manager@example.com",
    customerName: "Mimms Tax Service",
    requestNumber: "SR-2026-0042",
    requestSubject: "Quarterly filing question",
    destinationUrl: "https://dm3oi.example/service-desk/request-id",
  });
  assert.equal(email.subject, "New service request: SR-2026-0042");
  assert.equal(
    email.text,
    "New service request received\n\nCustomer: Mimms Tax Service\nRequest: SR-2026-0042\nSubject: Quarterly filing question\n\nOpen the request in DM3Oi:\nhttps://dm3oi.example/service-desk/request-id",
  );
});

test("a provider is mocked and a durable claim prevents duplicate email delivery", async () => {
  const delivery = memoryDelivery({ ok: true });
  const message = buildNewServiceRequestEmail({
    to: "manager@example.com",
    customerName: "Customer",
    requestNumber: "SR-1",
    requestSubject: "Help",
    destinationUrl: "https://dm3oi.example/service-desk/request-id",
  });
  assert.deepEqual(
    await deliverEmailOnce(message, delivery.provider, delivery.store),
    { ok: true, status: "SENT" },
  );
  assert.deepEqual(
    await deliverEmailOnce(message, delivery.provider, delivery.store),
    { ok: true, status: "ALREADY_RECORDED" },
  );
  assert.equal(delivery.sends(), 1);
  assert.deepEqual(delivery.completions, [{ ok: true }]);
});

test("mocked provider failure is recorded and remains non-throwing", async () => {
  const delivery = memoryDelivery(
    {
      ok: false,
      errorCode: "SMTP_TEMPORARY_FAILURE",
      safeMessage: "Email notification could not be sent.",
    },
  );
  const result = await deliverEmailOnce(
    { to: "manager@example.com", subject: "Subject", text: "Body" },
    delivery.provider,
    delivery.store,
  );
  assert.deepEqual(result, {
    ok: false,
    errorCode: "SMTP_TEMPORARY_FAILURE",
    safeMessage: "Email notification could not be sent.",
  });
  assert.equal(delivery.sends(), 1);
  assert.equal(delivery.completions.length, 1);
  assert.equal(delivery.completions[0].ok, false);
});

test("an unexpected provider exception is converted to a safe recorded failure", async () => {
  const delivery = memoryDelivery({ ok: true }, true);
  const result = await deliverEmailOnce(
    { to: "manager@example.com", subject: "Subject", text: "Body" },
    delivery.provider,
    delivery.store,
  );
  assert.deepEqual(result, {
    ok: false,
    errorCode: "MAIL_SEND_FAILED",
    safeMessage: "Email notification could not be sent.",
  });
  assert.equal(delivery.completions.length, 1);
});

test("trusted dispatcher derives recipients from tenant notifications and active profiles", () => {
  const service = source("lib/data/new-service-request-email-service.ts");
  const mailer = source("lib/email/mailer.ts");
  const eventMigration = source(
    "supabase/migrations/20260907124500_dm3oi_correct_new_service_request_recipient_selection.sql",
  );
  assert.match(service, /\.from\("notifications"\)/);
  assert.match(service, /\.eq\("organization_id", input\.organizationId\)/);
  assert.match(service, /NEW_SERVICE_REQUEST_RECEIVED/);
  assert.match(service, /source_event_id", input\.serviceRequestId/);
  assert.match(service, /\.from\("organization_members"\)/);
  assert.match(service, /profiles!inner\(email,is_active\)/);
  assert.match(service, /\.from\("platform_user_roles"\)/);
  assert.match(service, /platformIds\.has\(notification\.recipient_user_id\)/);
  assert.match(service, /isNewServiceRequestEmailEnabled/);
  assert.match(service, /applicationEmailProvider/);
  assert.match(mailer, /applicationEmailProvider: EmailProvider = smtpEmailProvider/);
  assert.doesNotMatch(service, /formData|FormData|recipientEmail:/);
  assert.doesNotMatch(
    service,
    /MANAGE_SERVICE_REQUEST|BUSINESS_OWNER|BUSINESS_ADMIN|STAFF_MANAGER|STAFF_USER/,
  );
  assert.match(mailer, /to: input\.to/);
  assert.match(eventMigration, /m\.user_id = new\.assigned_user_id/);
  assert.match(eventMigration, /if new\.assigned_user_id is not null then/);
  assert.match(eventMigration, /else[\s\S]*MANAGE_SERVICE_REQUEST/);
  assert.match(eventMigration, /m\.user_id is distinct from new\.created_by_user_id/);
});

test("missing addresses and provider failures cannot break authoritative creation", () => {
  const service = source("lib/data/new-service-request-email-service.ts");
  const portalAction = source("lib/data/customer-portal-actions.ts");
  const internalAction = source("lib/data/service-request-actions.ts");
  assert.match(service, /RECIPIENT_EMAIL_UNAVAILABLE/);
  assert.match(service, /insertDelivery\("FAILED", "RECIPIENT_EMAIL_UNAVAILABLE"\)/);
  assert.match(portalAction, /after\(async \(\) =>/);
  assert.match(internalAction, /after\(async \(\) =>/);
  assert.match(portalAction, /deliverNewServiceRequestNotificationEmails/);
  assert.match(internalAction, /deliverNewServiceRequestNotificationEmails/);
  assert.ok(
    portalAction.indexOf("create_customer_service_request") <
      portalAction.indexOf("deliverNewServiceRequestNotificationEmails({"),
  );
  assert.ok(
    internalAction.indexOf('"create_service_request"') <
      internalAction.indexOf("deliverNewServiceRequestNotificationEmails({"),
  );
});

test("notification delivery has durable channel idempotency without broader client access", () => {
  const migration = source(
    "supabase/migrations/20260907123000_dm3oi_new_service_request_email_delivery.sql",
  );
  assert.match(migration, /notification_id uuid null[\s\S]*references public\.notifications\(id\)/);
  assert.match(
    migration,
    /unique index[\s\S]*\(notification_id, communication_type, channel\)/,
  );
  assert.match(migration, /where notification_id is not null/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(migration, /to authenticated|to anon|to public/i);
  assert.doesNotMatch(migration, /disable row level security|grant all/i);
});

test("existing in-app and customer-response notifications remain intact", () => {
  const eventMigration = source(
    "supabase/migrations/20260907124500_dm3oi_correct_new_service_request_recipient_selection.sql",
  );
  const communicationsMigration = source(
    "supabase/migrations/20260904230000_dm3iqcm_communications_center.sql",
  );
  assert.match(eventMigration, /public\.create_notification\(/);
  assert.match(eventMigration, /NEW_SERVICE_REQUEST_RECEIVED/);
  assert.match(communicationsMigration, /CUSTOMER_RESPONSE_RECEIVED/);
  assert.match(communicationsMigration, /service_request_customer_message_notification/);
});
