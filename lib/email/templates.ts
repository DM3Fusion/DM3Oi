export const emailTemplateKeys = [
  "ORGANIZATION_USER_INVITATION",
  "ORGANIZATION_USER_INVITATION_RESEND",
  "CUSTOMER_PORTAL_INVITATION",
  "MISSING_DOCUMENTS_NOTICE",
  "SIGN_IN_CODE",
  "NEW_SERVICE_REQUEST_NOTIFICATION",
  "CUSTOMER_DATA_SUBMISSION_NOTIFICATION",
  "NEW_TRIAL_REQUEST_NOTIFICATION",
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
    key: "MISSING_DOCUMENTS_NOTICE",
    title: "Customer Requirements Notice",
    description: "Sent when a Customer must provide required Case documents or additional qualification information.",
    allowedVariables: [
      "organization_name",
      "recipient_first_name",
      "recipient_name",
      "recipient_email",
      "case_number",
      "missing_documents",
      "additional_information",
      "action_url",
    ],
    sampleVariables: {
      organization_name: "Example Organization",
      recipient_first_name: "Jordan",
      recipient_name: "Jordan Customer",
      recipient_email: "jordan@example.com",
      case_number: "CASE-000123",
      missing_documents: "W-2, Form 1099",
      additional_information:
        "Qualifying person: Please provide additional information needed to confirm filing status.",
      action_url: "https://dm3oi.com/portal",
    },
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
  {
    key: "CUSTOMER_DATA_SUBMISSION_NOTIFICATION",
    title: "Customer Data Submission Notification",
    description: "Sent to platform administrators when an organization uploads Customer source data for review.",
    allowedVariables: [
      "organization_name",
      "recipient_first_name",
      "recipient_name",
      "recipient_email",
      "uploader_name",
      "uploader_email",
      "filename",
      "submitted_at",
      "action_url",
    ],
    sampleVariables: {
      organization_name: "Example Organization",
      recipient_first_name: "Alex",
      recipient_name: "Alex Administrator",
      recipient_email: "admin@example.com",
      uploader_name: "Jordan Owner",
      uploader_email: "jordan@example.com",
      filename: "CustomerData.xlsx",
      submitted_at: "Oct 2, 2026, 11:45 AM EDT",
      action_url: "https://dm3oi.com/admin/customer-import",
    },
  },
  {
    key: "NEW_TRIAL_REQUEST_NOTIFICATION",
    title: "New Trial Request Notification",
    description: "Sent to platform administrators when a new public Trial Request is submitted.",
    allowedVariables: [
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
    ],
    sampleVariables: {
      recipient_first_name: "Alex",
      recipient_name: "Alex Administrator",
      recipient_email: "admin@example.com",
      trial_request_number: "1042",
      business_name: "Example Organization",
      contact_name: "Jordan Prospect",
      business_email: "jordan@example.com",
      phone: "(555) 555-0123",
      primary_use_case: "Case Management",
      estimated_users: "25",
      action_url: "https://dm3oi.com/admin/trial-requests/example",
    },
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
  MISSING_DOCUMENTS_NOTICE: {
    template_key: "MISSING_DOCUMENTS_NOTICE",
    subject_template: "Items needed for {{case_number}}",
    opening_message:
      "Hello {{recipient_first_name}}, {{organization_name}} needs additional information or documents to continue your Case {{case_number}}.",
    closing_message:
      "View your Case and document-submission instructions in the Customer Portal: {{action_url}}",
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
  CUSTOMER_DATA_SUBMISSION_NOTIFICATION: {
    template_key: "CUSTOMER_DATA_SUBMISSION_NOTIFICATION",
    subject_template: "Customer data submitted — {{organization_name}}",
    opening_message:
      "{{uploader_name}} ({{uploader_email}}) submitted {{filename}} for {{organization_name}} on {{submitted_at}}.",
    closing_message: "Open Customer Import in DM3Oi: {{action_url}}",
  },
  NEW_TRIAL_REQUEST_NOTIFICATION: {
    template_key: "NEW_TRIAL_REQUEST_NOTIFICATION",
    subject_template: "New Trial Request #{{trial_request_number}} — {{business_name}}",
    opening_message:
      "A new DM3Oi Trial Request was submitted by {{contact_name}} for {{business_name}}.",
    closing_message: "Review the Trial Request in DM3Oi: {{action_url}}",
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

  if (template.template_key === "MISSING_DOCUMENTS_NOTICE") {
    const organizationName = String(
      variables.organization_name ?? "the organization",
    ).trim();
    const missingDocuments = String(
      variables.missing_documents ?? "",
    ).trim();
    const secureDocumentSystemUrl = String(
      variables.secure_document_system_url ?? "",
    ).trim();
    const documentSubmissionInstructions = String(
      variables.document_submission_instructions ?? "",
    ).trim();
    const additionalInformation = String(
      variables.additional_information ?? "",
    ).trim();

    const safeOrganizationName = escapeHtml(organizationName);
    const safeMissingDocuments = escapeHtml(missingDocuments);
    const safeSecureDocumentSystemUrl = escapeHtml(
      secureDocumentSystemUrl,
    );
    const safeInstructions = escapeHtml(
      documentSubmissionInstructions,
    ).replace(/\r?\n/g, "<br>");
    const safeAdditionalInformation = additionalInformation
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(
        (line) =>
          `<li style="margin:0 0 8px;line-height:1.55">${escapeHtml(line)}</li>`,
      )
      .join("");

    const secureAction = secureDocumentSystemUrl
      ? `<p style="margin:22px 0 26px"><a href="${safeSecureDocumentSystemUrl}" style="display:inline-block;max-width:100%;border-radius:7px;background:#17233c;color:#fff;padding:13px 20px;font-weight:800;text-decoration:none">Open Secure Document System</a></p>`
      : "";

    const portalAction = actionUrl
      ? `<p style="margin:20px 0 0"><a href="${safeActionUrl}" style="display:inline-block;max-width:100%;overflow-wrap:anywhere;color:#1768e5;font-weight:700;text-decoration:none">View Case in Customer Portal</a></p>`
      : "";

    const additionalInformationHtml = additionalInformation
      ? `<div style="margin:18px 0 22px;padding:16px 18px;border:1px solid #e0d5b8;border-left:5px solid #a06a00;border-radius:7px;background:#fffaf0"><div style="margin-bottom:9px;color:#725117;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">Additional Information Needed</div><ul style="margin:0;padding-left:20px;color:#342815">${safeAdditionalInformation}</ul></div>`
      : "";

    if (!missingDocuments) {
      return {
        subject,
        text:
          `${opening}\n\n` +
          `ADDITIONAL INFORMATION NEEDED\n${additionalInformation}\n\n` +
          (actionUrl
            ? `View your Case in the Customer Portal: ${actionUrl}\n\n`
            : "") +
          `DM3Oi™ — Operational Intelligence\nPeople. Work. Progress. Intelligence.`,
        html: `<!doctype html><html lang="en"><body style="margin:0;background:#f4f7fb;color:#17233c;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="background:#17233c;border-radius:12px 12px 0 0;padding:24px 28px;color:#fff"><div style="font-size:28px;font-weight:800">DM3<span style="color:#18b8d9">Oi</span>™</div><div style="margin-top:5px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase">Operational Intelligence</div></div><div style="background:#fff;border:1px solid #d9e1ec;border-top:0;border-radius:0 0 12px 12px;padding:32px 28px"><p style="margin:0 0 18px;line-height:1.6">${openingHtml}</p>${additionalInformationHtml}${portalAction}<div style="border-top:1px solid #e3e8ef;margin-top:28px;padding-top:20px;color:#5d687b;font-size:13px;line-height:1.6">DM3Oi™ — Operational Intelligence<br>People. Work. Progress. Intelligence.</div></div></div></body></html>`,
      };
    }

    const privacyText =
      `For your privacy, do not reply to this email with documents, tax records, identification, or other sensitive information. You must use the secure document system required by ${organizationName} or follow the document-submission instructions provided.`;

    const documentsText = missingDocuments
      ? `DOCUMENTS NEEDED\n${missingDocuments}\n\n`
      : "";

    const additionalInformationText = additionalInformation
      ? `ADDITIONAL INFORMATION NEEDED\n${additionalInformation}\n\n`
      : "";

    const documentsHtml = missingDocuments
      ? `<div style="margin:18px 0 22px;padding:16px 18px;border:1px solid #d7dee7;border-left:5px solid #1768e5;border-radius:7px;background:#f7faff"><div style="margin-bottom:7px;color:#52677d;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">Documents Needed</div><div style="color:#10233f;font-size:19px;font-weight:800;line-height:1.4">${safeMissingDocuments}</div></div>`
      : "";

    return {
      subject,
      text:
        `${opening}\n\n` +
        documentsText +
        additionalInformationText +
        `PRIVACY NOTICE\n${privacyText}\n\n` +
        `HOW TO PROVIDE YOUR DOCUMENTS\n${documentSubmissionInstructions}\n\n` +
        `SECURE DOCUMENT SYSTEM\n${secureDocumentSystemUrl}\n\n` +
        (actionUrl ? `View your Case in the Customer Portal: ${actionUrl}\n\n` : "") +
        `DM3Oi™ — Operational Intelligence\nPeople. Work. Progress. Intelligence.`,
      html: `<!doctype html><html lang="en"><body style="margin:0;background:#f4f7fb;color:#17233c;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="background:#17233c;border-radius:12px 12px 0 0;padding:24px 28px;color:#fff"><div style="font-size:28px;font-weight:800">DM3<span style="color:#18b8d9">Oi</span>™</div><div style="margin-top:5px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase">Operational Intelligence</div></div><div style="background:#fff;border:1px solid #d9e1ec;border-top:0;border-radius:0 0 12px 12px;padding:32px 28px"><p style="margin:0 0 18px;line-height:1.6">${openingHtml}</p>${documentsHtml}${additionalInformationHtml}<div style="margin:20px 0 24px;padding:17px 18px;border:1px solid #e5c1c1;border-left:5px solid #8b1e1e;border-radius:7px;background:#fff7f7;color:#5d1717"><div style="margin-bottom:8px;font-size:12px;font-weight:900;letter-spacing:1px;text-transform:uppercase">Privacy Notice</div><div style="font-size:14px;font-weight:800;line-height:1.6">For your privacy, do not reply to this email with documents, tax records, identification, or other sensitive information.</div><div style="margin-top:8px;font-size:13px;line-height:1.6">You must use the secure document system required by ${safeOrganizationName} or follow the document-submission instructions provided below.</div></div><div style="margin:0 0 8px;color:#52677d;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase">How to Provide Your Documents</div><p style="margin:0;line-height:1.65">${safeInstructions}</p>${secureAction}${portalAction}<div style="border-top:1px solid #e3e8ef;margin-top:28px;padding-top:20px;color:#5d687b;font-size:13px;line-height:1.6">DM3Oi™ — Operational Intelligence<br>People. Work. Progress. Intelligence.</div></div></div></body></html>`,
    };
  }

  return {
    subject,
    text: `${opening}\n\n${closing}\n\nDM3Oi™ — Operational Intelligence\nPeople. Work. Progress. Intelligence.`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f4f7fb;color:#17233c;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="background:#17233c;border-radius:12px 12px 0 0;padding:24px 28px;color:#fff"><div style="font-size:28px;font-weight:800">DM3<span style="color:#18b8d9">Oi</span>™</div><div style="margin-top:5px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase">Operational Intelligence</div></div><div style="background:#fff;border:1px solid #d9e1ec;border-top:0;border-radius:0 0 12px 12px;padding:32px 28px"><p style="margin:0 0 18px;line-height:1.6">${openingHtml}</p>${action}<p style="margin:0;line-height:1.6">${closingHtml}</p><div style="border-top:1px solid #e3e8ef;margin-top:28px;padding-top:20px;color:#5d687b;font-size:13px;line-height:1.6">DM3Oi™ — Operational Intelligence<br>People. Work. Progress. Intelligence.</div></div></div></body></html>`,
  };
}
