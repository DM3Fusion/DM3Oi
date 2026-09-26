import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { saveCustomerPortalSettings } from "@/lib/data/organization-administration-actions";
import { createClient } from "@/lib/supabase/server";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string; error?: string }>;
}) {
  const access = await getAccessContext();
  if (!access?.activeOrganization) notFound();

  const organizationId = access.activeOrganization.id;
  const db = await createClient();
  const settingsResult = await db
    .from("organization_settings")
    .select("portal_enabled,portal_submission_enabled,portal_show_priority")
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

  return <><PageHeader eyebrow="Settings" title="Customer Portal" description="Control customer-facing portal availability and visibility."/>{query?.error&&<div className="form-alert page-notice">{query.error}</div>}{query?.message&&<div className="success-alert page-notice">{query.message}</div>}<section className="panel form-panel"><form action={saveCustomerPortalSettings} className="entity-form"><label><span>Portal Enabled</span><select name="portalEnabled" defaultValue={String(settings?.portal_enabled ?? true)}><option value="true">Enabled</option><option value="false">Disabled</option></select></label><label><span>Service Request Submission Enabled</span><select name="portalSubmissionEnabled" defaultValue={String(settings?.portal_submission_enabled ?? true)}><option value="true">Enabled</option><option value="false">Disabled</option></select></label><label><span>Show Priority to Customers</span><select name="portalShowPriority" defaultValue={String(settings?.portal_show_priority ?? true)}><option value="true">Shown</option><option value="false">Hidden</option></select></label><div className="form-actions"><Link href="/settings/general">Cancel</Link><button className="primary-button">Save Changes</button></div></form></section></>;
}
