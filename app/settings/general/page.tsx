import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { saveOrganizationDefaults } from "@/lib/data/organization-administration-actions";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext } from "@/lib/auth/context";
import { OrganizationDefaultsForm } from "@/components/organization-defaults-form";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string; error?: string }>;
}) {
  const access = await getAccessContext();
  if (!access?.isSuperAdmin || !access.activeOrganization) notFound();

  const db = await createClient();
  const organizationId = access.activeOrganization.id;
  const [settingsResult, organizationResult] = await Promise.all([
    db
      .from("organization_settings")
      .select(
        "timezone,timezone_source,timezone_resolved_from_postal_code,default_priority",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
    db
      .from("organizations")
      .select("business_postal_code")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);
  const error = settingsResult.error ?? organizationResult.error;
  if (error) {
    console.error("Organization defaults lookup failed", {
      organizationId,
      code: error.code,
      message: error.message,
    });
    throw new Error("Organization defaults are temporarily unavailable.");
  }

  const settings = settingsResult.data;
  const organization = organizationResult.data;
  const timezoneSource = settings?.timezone_source ?? "DEFAULT";
  const query = await searchParams;

  return <><PageHeader eyebrow="Settings" title="General" description="Set safe organization-wide operational defaults."/>{query?.error&&<div className="form-alert page-notice">{query.error}</div>}{query?.message&&<div className="success-alert page-notice">{query.message}</div>}<section className="panel form-panel"><OrganizationDefaultsForm action={saveOrganizationDefaults} initial={{postal:organization?.business_postal_code??"",mode:timezoneSource==="MANUAL"?"MANUAL":"ZIP",timezone:settings?.timezone??"UTC",priority:settings?.default_priority??"NORMAL"}} saved={query?.message==="Changes Saved"}/></section></>;
}
