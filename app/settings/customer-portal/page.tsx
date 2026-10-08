import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { saveCustomerPortalSettings } from "@/lib/data/organization-administration-actions";
import { createClient } from "@/lib/supabase/server";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string; error?: string }>;
}) {
  const access = await getAccessContext();
  if (
    !access?.activeOrganization ||
    !hasPermission(access, "MANAGE_ORGANIZATION_SETTINGS")
  )
    notFound();

  const organizationId = access.activeOrganization.id;
  const db = await createClient();
  const settingsResult = await db
    .from("organization_settings")
    .select("portal_enabled,portal_submission_enabled,portal_show_priority,portal_onboarding_mode,secure_document_system_url,document_submission_instructions")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (settingsResult.error) {
    console.error("Customer Portal settings lookup failed", {
      organizationId,
      code: settingsResult.error.code,
      message: settingsResult.error.message,
    });
    throw new Error("Customer Portal settings are temporarily unavailable.");
  }

  const settings = settingsResult.data;
  const query = await searchParams;

  return <><PageHeader eyebrow="Settings" title="Customer Portal" description="Control customer-facing portal availability and visibility."/>{query?.error&&<div className="form-alert page-notice">{query.error}</div>}{query?.message&&<div className="success-alert page-notice">{query.message}</div>}<section className="panel form-panel"><form action={saveCustomerPortalSettings} className="entity-form"><label><span>Portal Enabled</span><select name="portalEnabled" defaultValue={String(settings?.portal_enabled ?? true)}><option value="true">Enabled</option><option value="false">Disabled</option></select></label><label><span>Service Request Submission Enabled</span><select name="portalSubmissionEnabled" defaultValue={String(settings?.portal_submission_enabled ?? true)}><option value="true">Enabled</option><option value="false">Disabled</option></select></label><label><span>Show Priority to Customers</span><select name="portalShowPriority" defaultValue={String(settings?.portal_show_priority ?? true)}><option value="true">Shown</option><option value="false">Hidden</option></select></label><label><span>Portal Onboarding</span><select name="portalOnboardingMode" defaultValue={settings?.portal_onboarding_mode ?? "MANUAL_ONLY"}><option value="MANUAL_ONLY">Manual only</option><option value="PROMPT_DURING_CASE_INTAKE">Prompt during Case Intake</option></select><small>Manual access is managed from the Customer record. Prompting requires staff to send an invitation, confirm active access, or mark access Not Required during Guided Intake.</small></label><label><span>Secure Document System URL</span><input type="url" name="secureDocumentSystemUrl" defaultValue={settings?.secure_document_system_url ?? ""} placeholder="https://secure.example.com" maxLength={2048}/><small>External HTTPS system customers must use to send private documents. DM3Oi never receives or stores those documents.</small></label><label><span>Document Submission Instructions</span><textarea name="documentSubmissionInstructions" defaultValue={settings?.document_submission_instructions ?? ""} rows={6} maxLength={4000} placeholder="Explain how customers must provide private documents using your external secure system."/></label><div className="portal-privacy-settings-note"><strong>Privacy boundary</strong><span>DM3Oi tracks what is required, but private documents must remain outside DM3Oi. Customers will be instructed not to reply to email with sensitive information.</span></div><div className="form-actions"><Link href="/settings/case-configuration">Cancel</Link><button className="primary-button">Save Changes</button></div></form></section></>;
}
