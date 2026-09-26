"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import {
  buildCustomerPortalSettingsWrite,
  buildOrganizationDefaultsWrite,
} from "@/lib/organization-settings";
const ok=(a:any)=>hasPermission(a,"MANAGE_ORGANIZATION_SETTINGS");

export async function saveOrganizationDefaults(form: FormData) {
  const access = await getAccessContext();
  const organizationId = access?.activeOrganization?.id;
  if (!organizationId || !access?.isSuperAdmin)
    redirect("/administration?error=Not%20authorized");

  const parsed = buildOrganizationDefaultsWrite(
    {
      businessPostalCode: form.get("businessPostalCode"),
      timezoneMode: form.get("timezoneMode"),
      timezone: form.get("timezone"),
      defaultPriority: form.get("defaultPriority"),
    },
    organizationId,
    access.user.id,
  );
  if (!parsed.ok) {
    redirect(
      `/administration/defaults?error=${encodeURIComponent(parsed.error)}`,
    );
  }

  const supabase = await createClient();
  const organizationResult = await supabase
    .from("organizations")
    .update(parsed.value.organization)
    .eq("id", organizationId);
  if (organizationResult.error) {
    console.error("Organization defaults postal code update failed", {
      organizationId,
      code: organizationResult.error.code,
      message: organizationResult.error.message,
    });
    redirect(
      "/administration/defaults?error=Unable%20to%20save%20settings",
    );
  }

  const settingsResult = await supabase
    .from("organization_settings")
    .upsert(parsed.value.settings);
  if (settingsResult.error) {
    console.error("Organization defaults settings update failed", {
      organizationId,
      code: settingsResult.error.code,
      message: settingsResult.error.message,
    });
    redirect(
      "/administration/defaults?error=Unable%20to%20save%20settings",
    );
  }

  revalidatePath("/administration");
  revalidatePath("/administration/defaults");
  redirect("/administration/defaults?message=Changes%20Saved");
}

export async function saveCustomerPortalSettings(form: FormData) {
  const access = await getAccessContext();
  const organizationId = access?.activeOrganization?.id;
  if (!organizationId || !access?.isSuperAdmin)
    redirect("/administration?error=Not%20authorized");

  const parsed = buildCustomerPortalSettingsWrite(
    {
      portalEnabled: form.get("portalEnabled"),
      portalSubmissionEnabled: form.get("portalSubmissionEnabled"),
      portalShowPriority: form.get("portalShowPriority"),
    },
    organizationId,
    access.user.id,
  );
  if (!parsed.ok) {
    redirect(
      `/administration/customer-portal?error=${encodeURIComponent(parsed.error)}`,
    );
  }

  const supabase = await createClient();
  const result = await supabase
    .from("organization_settings")
    .upsert(parsed.value);
  if (result.error) {
    console.error("Customer Portal settings update failed", {
      organizationId,
      code: result.error.code,
      message: result.error.message,
    });
    redirect(
      "/administration/customer-portal?error=Unable%20to%20save%20settings",
    );
  }

  revalidatePath("/administration");
  revalidatePath("/administration/customer-portal");
  redirect("/administration/customer-portal?message=Changes%20Saved");
}

const caseConfigurationPath = "/settings/case-configuration";

export async function saveCaseTitle(form: FormData) {
  const access = await getAccessContext();
  const organizationId = access?.activeOrganization?.id;
  if (!organizationId || !ok(access))
    redirect(`${caseConfigurationPath}?error=Not%20authorized`);
  const label = String(form.get("label") ?? "").trim();
  const sortOrder = Number(form.get("sortOrder") ?? 0);
  if (!label || label.length > 180 || !Number.isInteger(sortOrder) || sortOrder < 0)
    redirect(
      `${caseConfigurationPath}?error=Enter%20a%20valid%20Case%20Title%20and%20order`,
    );
  const supabase = await createClient();
  const payload = {
    organization_id: organizationId,
    label,
    sort_order: sortOrder,
    is_active: form.get("isActive") !== "false",
    created_by_user_id: access.user.id,
    updated_by_user_id: access.user.id,
  };
  const titleId = String(form.get("id") ?? "");
  const result = titleId
    ? await supabase
        .from("organization_case_titles")
        .update(payload)
        .eq("id", titleId)
        .eq("organization_id", organizationId)
    : await supabase.from("organization_case_titles").insert(payload);
  if (result.error) {
    console.error("Case Title configuration save failed", {
      organizationId,
      code: result.error.code,
      message: result.error.message,
    });
    redirect(
      `${caseConfigurationPath}?error=Active%20Case%20Title%20labels%20must%20be%20unique`,
    );
  }
  revalidatePath(caseConfigurationPath);
  redirect(`${caseConfigurationPath}?message=Case%20Title%20saved`);
}

export async function saveCaseType(form: FormData) {
  const access = await getAccessContext();
  const organizationId = access?.activeOrganization?.id;
  if (!organizationId || !ok(access))
    redirect(`${caseConfigurationPath}?error=Not%20authorized`);
  const name = String(form.get("name") ?? "").trim();
  const sortOrder = Number(form.get("sortOrder") ?? 0);
  if (!name || name.length > 120 || !Number.isInteger(sortOrder) || sortOrder < 0)
    redirect(
      `${caseConfigurationPath}?error=Enter%20a%20valid%20Case%20Type%20and%20order`,
    );
  const supabase = await createClient();
  const payload = {
    organization_id: organizationId,
    name,
    description: String(form.get("description") ?? "").trim() || null,
    sort_order: sortOrder,
    is_active: form.get("isActive") !== "false",
    updated_at: new Date().toISOString(),
  };
  const caseTypeId = String(form.get("id") ?? "");
  const result = caseTypeId
    ? await supabase
        .from("organization_case_types")
        .update(payload)
        .eq("id", caseTypeId)
        .eq("organization_id", organizationId)
    : await supabase.from("organization_case_types").insert(payload);
  if (result.error) {
    console.error("Case Type configuration save failed", {
      organizationId,
      code: result.error.code,
      message: result.error.message,
    });
    redirect(
      `${caseConfigurationPath}?error=Active%20Case%20Type%20names%20must%20be%20unique`,
    );
  }
  revalidatePath(caseConfigurationPath);
  redirect(`${caseConfigurationPath}?message=Case%20Type%20saved`);
}
export async function saveLifecycleStatus(form:FormData){const a=await getAccessContext();const id=a?.activeOrganization?.id;if(!id||!ok(a))redirect('/administration/case-lifecycle?error=Not%20authorized');const status=String(form.get('status')||'');const db=await createClient();const result=await (db as any).from('organization_lifecycle_statuses').upsert({organization_id:id,status,display_label:String(form.get('displayLabel')||status),description:String(form.get('description')||'').trim()||null,is_active:form.get('isActive')!=='false',sort_order:Number(form.get('sortOrder')||0),updated_by:a.user.id});if(result.error)redirect('/administration/case-lifecycle?error=Unable%20to%20save%20status');revalidatePath('/administration/case-lifecycle');redirect('/administration/case-lifecycle?message=Changes%20Saved');}
