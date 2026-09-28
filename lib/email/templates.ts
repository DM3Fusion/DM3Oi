export const emailTemplateKeys = [
  "ORGANIZATION_USER_INVITATION",
  "ORGANIZATION_USER_INVITATION_RESEND",
  "CUSTOMER_PORTAL_INVITATION",
  "SIGN_IN_CODE",
  "NEW_SERVICE_REQUEST_NOTIFICATION",
] as const;

export type EmailTemplateKey = (typeof emailTemplateKeys)[number];

export type EmailTemplate = {
  template_key: EmailTemplateKey;
  subject_template: string;
  opening_message: string;
  closing_message: string;
};

export type EmailTemplateVariables = Record<string, string | null | undefined>;

export const emailTemplateDefinitions: Array<{
  key: EmailTemplateKey;
  title: string;
  description: string;
  allowedVariables: readonly string[];
  sampleVariables: Record<string, string>;
}> = [
  {
    key: "ORGANIZATION_USER_INVITATION",
    title: "Organization User Invitation",
    description: "Sent when an organization invites a new internal user.",
    allowedVariables: ["organization_name", "recipient_first_name", "recipient_name", "recipient_email", "role", "action_url"],
    sampleVariables: { organization_name: "Example Organization", recipient_first_name: "Alex", recipient_name: "Alex Johnson", recipient_email: "alex@example.com", role: "Staff User", action_url: "https://dm3oi.com/auth/invite" },
  },
  {
    key: "ORGANIZATION_USER_INVITATION_RESEND",
    title: "Organization Invitation Resend",
    description: "Sent when a pending organization invitation is reissued.",
    allowedVariables: ["organization_name", "recipient_first_name", "recipient_name", "recipient_email", "role", "action_url"],
    sampleVariables: { organization_name: "Example Organization", recipient_first_name: "Alex", recipient_name: "Alex Johnson", recipient_email: "alex@example.com", role: "Staff User", action_url: "https://dm3oi.com/auth/invite" },
  },
  {
    key: "CUSTOMER_PORTAL_INVITATION",
    title: "Customer Portal Invitation",
    description: "Sent when Customer Portal access is offered or reissued.",
    allowedVariables: ["organization_name", "recipient_first_name", "recipient_name", "recipient_email", "action_url"],
    sampleVariables: { organization_name: "Example Organization", recipient_first_name: "Jordan", recipient_name: "Jordan Customer", recipient_email: "jordan@example.com", action_url: "https://dm3oi.com/auth/invite" },
  },
  {
    key: "SIGN_IN_CODE",
    title: "Sign-In Code",
    description: "Preview and test copy for the Supabase-managed email-code flow.",
    allowedVariables: ["recipient_first_name", "recipient_name", "recipient_email", "sign_in_code", "action_url"],
    sampleVariables: { recipient_first_name: "Alex", recipient_name: "Alex Johnson", recipient_email: "alex@example.com", sign_in_code: "123456", action_url: "https://dm3oi.com/login" },
  },
  {
    key: "NEW_SERVICE_REQUEST_NOTIFICATION",
    title: "New Service Request Notification",
    description: "Sent to the authorized internal recipients of a new Service Request.",
    allowedVariables: ["organization_name", "recipient_first_name", "recipient_name", "recipient_email", "service_request_number", "customer_name", "request_subject", "action_url"],
    sampleVariables: { organization_name: "Example Organization", recipient_first_name: "Alex", recipient_name: "Alex Johnson", recipient_email: "alex@example.com", service_request_number: "SR-2026-0042", customer_name: "Example Customer", request_subject: "Quarterly filing question", action_url: "https://dm3oi.com/service-desk/example" },
  },
];

export const defaultEmailTemplates: Record<EmailTemplateKey, EmailTemplate> = {
  ORGANIZATION_USER_INVITATION: {
    template_key: "ORGANIZATION_USER_INVITATION",
    subject_template: "{{organization_name}} invited you to DM3Oi",
    opening_message: "Hello {{recipient_first_name}}, You have been invited to join {{organization_name}} in DM3Oi™ Operational Intelligence as {{role}}.",
    closing_message: "Accept your invitation: {{action_url}}",
  },
  ORGANIZATION_USER_INVITATION_RESEND: {
    template_key: "ORGANIZATION_USER_INVITATION_RESEND",
    subject_template: "{{organization_name}} resent your DM3Oi invitation",
    opening_message: "Hello {{recipient_first_name}}, {{organization_name}} has resent your invitation to join its DM3Oi™ Operational Intelligence workspace as {{role}}.",
    closing_message: "Accept your invitation: {{action_url}}",
  },
  CUSTOMER_PORTAL_INVITATION: {
    template_key: "CUSTOMER_PORTAL_INVITATION",
    subject_template: "{{organization_name}} invited you to their Customer Portal",
    opening_message: "Hello {{recipient_first_name}}, {{organization_name}} has invited you to access their Customer Portal, powered by DM3Oi™ Operational Intelligence.",
    closing_message: "Access the Customer Portal: {{action_url}}",
  },
  SIGN_IN_CODE: {
    template_key: "SIGN_IN_CODE",
    subject_template: "Your DM3Oi sign-in code",
    opening_message: "Use code {{sign_in_code}} to sign in to DM3Oi™ Operational Intelligence.",
    closing_message: "If you did not request this code, you can safely ignore this email.",
  },
  NEW_SERVICE_REQUEST_NOTIFICATION: {
    template_key: "NEW_SERVICE_REQUEST_NOTIFICATION",
    subject_template: "New service request: {{service_request_number}}",
    opening_message: "A new service request was received from {{customer_name}}: {{request_subject}}.",
    closing_message: "Open the Service Request in DM3Oi: {{action_url}}",
  },
};

export function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return emailTemplateKeys.includes(value as EmailTemplateKey);
}

const variablePattern = /\{\{([a-z_]+)\}\}/g;

export function validateEmailTemplateContent(
  templateKey: EmailTemplateKey,
  content: Pick<EmailTemplate, "subject_template" | "opening_message" | "closing_message">,
) {
  const definition = emailTemplateDefinitions.find((item) => item.key === templateKey)!;
  if (/[\r\n]/.test(content.subject_template))
    return { ok: false as const, unknown: [] as string[] };
  const combined = `${content.subject_template}\n${content.opening_message}\n${content.closing_message}`;
  const variables = [...combined.matchAll(variablePattern)].map((match) => match[1]);
  const unknown = [...new Set(variables.filter((name) => !definition.allowedVariables.includes(name)))];
  const malformed = combined.replace(variablePattern, "").includes("{{") || combined.replace(variablePattern, "").includes("}}");
  return unknown.length || malformed
    ? { ok: false as const, unknown }
    : { ok: true as const };
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function applyVariables(
  source: string,
  variables: EmailTemplateVariables,
  html: boolean,
) {
  return source.replace(variablePattern, (_token, key: string) => {
    const value = String(variables[key] ?? "").replace(/[\r\n]+/g, " ").trim();
    return html ? escapeHtml(value) : value;
  });
}

export function renderEmailTemplate(
  template: EmailTemplate,
  variables: EmailTemplateVariables,
) {
  const validation = validateEmailTemplateContent(template.template_key, template);
  if (!validation.ok) throw new Error("EMAIL_TEMPLATE_VARIABLE_INVALID");
  const subject = applyVariables(template.subject_template, variables, false).trim();
  const opening = applyVariables(template.opening_message, variables, false).trim();
  const closing = applyVariables(template.closing_message, variables, false).trim();
  const openingHtml = applyVariables(template.opening_message, variables, true).trim();
  const actionUrl = String(variables.action_url ?? "").trim();
  const safeActionUrl = escapeHtml(actionUrl);
  let closingHtml = applyVariables(template.closing_message, variables, true).trim();
  if (template.template_key === "CUSTOMER_PORTAL_INVITATION" && actionUrl) {
    closingHtml = closingHtml.replace(
      safeActionUrl,
      `<a href="${safeActionUrl}" style="display:inline-block;max-width:100%;overflow-wrap:anywhere;word-break:break-word;color:#17233c">${safeActionUrl}</a>`,
    );
  }
  const action = actionUrl
    ? `<p style="margin:24px 0"><a href="${safeActionUrl}" style="display:inline-block;border-radius:7px;background:#18b8d9;color:#102039;padding:13px 20px;font-weight:700;text-decoration:none">Open DM3Oi</a></p>`
    : "";
  return {
    subject,
    text: `${opening}\n\n${closing}\n\nDM3Oi™ — Operational Intelligence\nPeople. Work. Progress. Intelligence.`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f4f7fb;color:#17233c;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="background:#17233c;border-radius:12px 12px 0 0;padding:24px 28px;color:#fff"><div style="font-size:28px;font-weight:800">DM3<span style="color:#18b8d9">Oi</span>™</div><div style="margin-top:5px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase">Operational Intelligence</div></div><div style="background:#fff;border:1px solid #d9e1ec;border-top:0;border-radius:0 0 12px 12px;padding:32px 28px"><p style="margin:0 0 18px;line-height:1.6">${openingHtml}</p>${action}<p style="margin:0;line-height:1.6">${closingHtml}</p><div style="border-top:1px solid #e3e8ef;margin-top:28px;padding-top:20px;color:#5d687b;font-size:13px;line-height:1.6">DM3Oi™ — Operational Intelligence<br>People. Work. Progress. Intelligence.</div></div></div></body></html>`,
  };
}
