/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { saveOrganizationSettings } from "@/lib/data/organization-administration-actions";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext } from "@/lib/auth/context";
import { OrganizationDefaultsForm } from "@/components/organization-defaults-form";

export default async function Page({searchParams}:{searchParams?:Promise<{message?:string}>}){const access=await getAccessContext();if(!access?.isSuperAdmin||!access.activeOrganization)notFound();const db=await createClient();const id=access?.activeOrganization?.id;const [{data:settings},{data:organization}]=id?await Promise.all([(db as any).from("organization_settings").select("timezone,timezone_source,timezone_resolved_from_postal_code,default_priority").eq("organization_id",id).maybeSingle(),(db as any).from("organizations").select("business_postal_code").eq("id",id).maybeSingle()]):[{data:null},{data:null}];const timezoneSource=settings?.timezone_source??"DEFAULT";const query=await searchParams;return <><PageHeader eyebrow="Administration" title="Organization Defaults" description="Set safe organization-wide operational defaults."/>{query?.message&&<div className="success-alert page-notice">{query.message}</div>}<section className="panel form-panel"><OrganizationDefaultsForm action={saveOrganizationSettings} initial={{postal:organization?.business_postal_code??"",mode:timezoneSource==="MANUAL"?"MANUAL":"ZIP",timezone:settings?.timezone??"UTC",priority:settings?.default_priority??"NORMAL"}} saved={query?.message==="Changes Saved"}/></section></>}
