import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  defaultEmailTemplates,
  emailTemplateDefinitions,
  emailTemplateKeys,
  validateEmailTemplateContent,
} from "../lib/email/templates.ts";

const source = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const action = source("app/request-trial/actions.ts");
const service = source("lib/data/trial-request-notification-service.ts");
const delivery = source("lib/email/tracked-delivery.ts");
const migration = source(
  "supabase/migrations/20261003110000_dm3oi_new_trial_request_notification.sql",
);

test("new Trial Request notification is a managed platform template", () => {
  assert.ok(emailTemplateKeys.includes("NEW_TRIAL_REQUEST_NOTIFICATION"));
  const definition = emailTemplateDefinitions.find(
    (item) => item.key === "NEW_TRIAL_REQUEST_NOTIFICATION",
  );
  assert.ok(definition);
  assert.equal(definition.title, "New Trial Request Notification");
  assert.equal(
    definition.description,
    "Sent to platform administrators when a new public Trial Request is submitted.",
  );
  assert.deepEqual(definition.allowedVariables, [
    "recipient_first_name",
    "recipient_name",
    "recipient_email",
    "trial_request_number",
    "business_name",
    "contact_name",
    "business_email",
    "phone",
    "primary_use_case",
    "estimated_users",
    "action_url",
  ]);
});

test("new Trial Request template variables pass application and SQL allowlists", () => {
  assert.equal(
    validateEmailTemplateContent(
      "NEW_TRIAL_REQUEST_NOTIFICATION",
      defaultEmailTemplates.NEW_TRIAL_REQUEST_NOTIFICATION,
    ).ok,
    true,
  );
  assert.match(
    migration,
    /when 'NEW_TRIAL_REQUEST_NOTIFICATION' then[\s\S]*'trial_request_number'[\s\S]*'business_name'[\s\S]*'contact_name'[\s\S]*'business_email'[\s\S]*'phone'[\s\S]*'primary_use_case'[\s\S]*'estimated_users'[\s\S]*'action_url'/,
  );
  assert.match(
    migration,
    /update_platform_email_template[\s\S]*'NEW_TRIAL_REQUEST_NOTIFICATION'/,
  );
  assert.match(
    migration,
    /insert into public\.platform_email_templates[\s\S]*'NEW_TRIAL_REQUEST_NOTIFICATION'/,
  );
});

test("successful public submission schedules notification from the returned UUID", () => {
  assert.match(action, /data: trialRequestId, error/);
  assert.match(action, /after\(async \(\) =>/);
  assert.match(
    action,
    /notifyPlatformAdministratorsOfTrialRequest\(trialRequestId\)/,
  );
  assert.ok(
    action.indexOf('"submit_trial_request"') <
      action.indexOf("notifyPlatformAdministratorsOfTrialRequest(trialRequestId)"),
  );
  assert.ok(
    action.indexOf("notifyPlatformAdministratorsOfTrialRequest(trialRequestId)") <
      action.lastIndexOf('redirect("/request-trial?submitted=1")'),
  );
});

test("dispatcher loads canonical Trial Request data and targets the exact detail URL", () => {
  assert.match(service, /import "server-only"/);
  assert.match(service, /\.from\("trial_requests"\)/);
  assert.match(service, /\.eq\("id", trialRequestId\)/);
  assert.match(
    service,
    /`\$\{baseUrl\}\/admin\/trial-requests\/\$\{trialRequest\.id\}`/,
  );
  assert.match(service, /trial_request_number: String\(trialRequest\.request_number\)/);
  assert.match(service, /business_name: trialRequest\.business_name/);
  assert.match(service, /primary_use_case:[\s\S]*trialRequestUseCaseLabels/);
});

test("only active SUPER_ADMIN users with active usable profiles are recipients", () => {
  assert.match(service, /\.from\("platform_user_roles"\)/);
  assert.match(service, /\.eq\("role", "SUPER_ADMIN"\)/);
  assert.match(service, /\.eq\("is_active", true\)/);
  assert.match(service, /\.from\("profiles"\)/);
  assert.match(
    service,
    /\.in\("id", recipientIds\)[\s\S]*\.eq\("is_active", true\)/,
  );
  assert.match(service, /const recipientEmail = safeEmail\(recipient\.email\)/);
  assert.doesNotMatch(service, /organization_members|BUSINESS_ADMIN|BUSINESS_OWNER/);
});

test("delivery failure cannot change the successful public submission result", () => {
  assert.match(
    action,
    /after\(async \(\) => \{[\s\S]*try \{[\s\S]*notifyPlatformAdministratorsOfTrialRequest[\s\S]*catch \(notificationError\)/,
  );
  assert.match(
    service,
    /export async function notifyPlatformAdministratorsOfTrialRequest[\s\S]*try \{[\s\S]*catch \(error\)/,
  );
  assert.equal(
    action.lastIndexOf('redirect("/request-trial?submitted=1")') >
      action.indexOf("after(async () =>"),
    true,
  );
  assert.doesNotMatch(service, /redirect\(|throw /);
});

test("email follow-up does not duplicate the Trial Request or depend on browser activity", () => {
  assert.equal(action.match(/"submit_trial_request"/g)?.length, 1);
  assert.doesNotMatch(service, /\.insert\(|submit_trial_request/);
  assert.doesNotMatch(
    `${action}\n${service}`,
    /setInterval|setTimeout|subscribe\(|channel\(|realtime|visibilitychange|focus|window\.|document\./i,
  );
});

test("tracked delivery retains a nullable Trial Request audit reference", () => {
  assert.match(
    migration,
    /add column trial_request_id uuid[\s\S]*references public\.trial_requests\(id\)[\s\S]*on delete set null/,
  );
  assert.match(
    migration,
    /create index email_deliveries_trial_request_idx[\s\S]*where trial_request_id is not null/,
  );
  assert.match(delivery, /trialRequestId\?: string \| null/);
  assert.match(
    delivery,
    /trial_request_id: references\.trialRequestId \?\? null/,
  );
  assert.match(service, /trialRequestId: trialRequest\.id/);
});
