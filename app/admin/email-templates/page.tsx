import { PageHeader } from "@/components/ui";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireSuperAdmin } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  defaultEmailTemplates,
  emailTemplateDefinitions,
  isEmailTemplateKey,
  renderEmailTemplate,
  type EmailTemplate,
} from "@/lib/email/templates";
import {
  sendEmailTemplateTestAction,
  updateEmailTemplateAction,
} from "./actions";

export const metadata = { title: "Email Templates" };

export default async function EmailTemplatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  await requireSuperAdmin();
  const query = await searchParams;
  const requestedKey = query?.template ?? "";
  const activeKey = isEmailTemplateKey(requestedKey)
    ? requestedKey
    : emailTemplateDefinitions[0].key;
  const admin = createAdminClient();
  const result = await admin
    .from("platform_email_templates" as never)
    .select("template_key,subject_template,opening_message,closing_message")
    .order("template_key");
  const stored = (result.data ?? []) as unknown as EmailTemplate[];
  const templates = new Map(stored.map((template) => [template.template_key, template]));
  const definition = emailTemplateDefinitions.find((item) => item.key === activeKey)!;
  const template = templates.get(activeKey) ?? defaultEmailTemplates[activeKey];
  const preview = renderEmailTemplate(template, definition.sampleVariables);
  const error = query?.error === "invalid"
    ? "Review the template content and use only the listed variables."
    : query?.error === "save"
      ? "The email template could not be saved."
      : query?.error === "test"
        ? "The test email could not be sent."
        : null;

  return (
    <>
      <PageHeader
        eyebrow="Platform Operationsistration"
        title="Email Templates"
        description="Manage transactional email content for DM3Oi. Templates are platform-managed and apply across organizations."
      />
      {query?.saved ? <div className="form-success" role="status">Email template saved.</div> : null}
      {query?.testSent ? <div className="form-success" role="status">Test email sent to your SUPER_ADMIN email address.</div> : null}
      {error ? <div className="form-alert" role="alert">{error}</div> : null}
      <nav className="settings-tabs email-template-tabs" aria-label="Email templates">
        {emailTemplateDefinitions.map((item) => (
          <a key={item.key} href={`/admin/email-templates?template=${item.key}`} className={item.key === activeKey ? "active" : undefined}>
            {item.title}
          </a>
        ))}
      </nav>
      <section className="panel form-panel">
        <div className="section-heading">
          <div><h2>{definition.title}</h2><p className="muted">{definition.description}</p></div>
        </div>
        {activeKey === "SIGN_IN_CODE" ? (
          <div className="form-alert" role="note">
            Saving this template does not change the production Supabase Auth sign-in code email. Supabase Auth remains responsible for production OTP delivery. This template is available for preview and test-send only.
          </div>
        ) : null}
        <form action={updateEmailTemplateAction} className="entity-form">
          <input type="hidden" name="templateKey" value={activeKey} />
          <div className="form-grid">
            <label className="full"><span>Subject</span><input name="subject" required maxLength={200} defaultValue={template.subject_template} /></label>
            <label className="full"><span>Opening message</span><textarea name="openingMessage" required maxLength={2000} rows={5} defaultValue={template.opening_message} /></label>
            <label className="full"><span>Closing message</span><textarea name="closingMessage" required maxLength={2000} rows={5} defaultValue={template.closing_message} /></label>
          </div>
          <p className="form-help">Allowed variables: {definition.allowedVariables.map((variable) => `{{${variable}}}`).join(", ")}</p>
          <div className="form-actions">
            <PendingSubmitButton className="primary-button" pendingLabel="Saving…">Save template</PendingSubmitButton>
          </div>
        </form>
        <div className="form-actions">
          <form action={sendEmailTemplateTestAction}>
            <input type="hidden" name="templateKey" value={activeKey} />
            <PendingSubmitButton className="secondary-button" pendingLabel="Sending…">Send test email</PendingSubmitButton>
          </form>
        </div>
        <details>
          <summary>Preview</summary>
          <div className="detail-section"><h3>{preview.subject}</h3><p className="pre-line">{preview.text}</p></div>
        </details>
      </section>
    </>
  );
}
