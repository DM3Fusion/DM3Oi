import { notFound } from "next/navigation";
import {
  CaseConfigurationEditor,
  type CaseTypeConfiguration,
  type TaskPurposeConfiguration,
} from "@/components/case-configuration-editor";
import { PageHeader } from "@/components/ui";
import { SettingsMobileSubnavigation } from "@/components/settings-mobile-subnavigation";
import { getAccessContext } from "@/lib/auth/context";
import { authorizedOrganizationSettingsNavigation } from "@/lib/application-navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ message?: string; error?: string }>;

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const access = await getAccessContext();
  if (
    !access?.activeOrganization ||
    !hasPermission(access, "MANAGE_ORGANIZATION_SETTINGS")
  )
    notFound();

  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  // Temporary schema bridge until generated Supabase types include the new
  // Case Type fields and organization_task_purposes table.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [types, purposes, query] = await Promise.all([
    db
      .from("organization_case_types")
      .select(
        "id,name,description,is_active,sort_order,customer_mode,tax_year_rule",
      )
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("name"),
    db
      .from("organization_task_purposes")
      .select("id,label,description,is_active,sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("label"),
    searchParams,
  ]);

  if (types.error || purposes.error) {
    console.error("Case configuration query failed", {
      organizationId,
      typeError: types.error?.message,
      purposeError: purposes.error?.message,
    });
    throw new Error("Case configuration is temporarily unavailable.");
  }

  const caseTypes: CaseTypeConfiguration[] = (types.data ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      customerMode: item.customer_mode,
      taxYearRule: item.tax_year_rule,
      sortOrder: item.sort_order,
      isActive: item.is_active,
    }),
  );
  const taskPurposes: TaskPurposeConfiguration[] = (purposes.data ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item: any) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      sortOrder: item.sort_order,
      isActive: item.is_active,
    }),
  );

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Case Configuration"
        description="Manage Case Types and Task Purposes used by your organization."
      />
      <SettingsMobileSubnavigation
        items={authorizedOrganizationSettingsNavigation(access)}
      />

      {query.error ? (
        <div className="form-alert page-notice">{query.error}</div>
      ) : null}
      {query.message ? (
        <div className="success-alert page-notice">{query.message}</div>
      ) : null}

      <CaseConfigurationEditor
        caseTypes={caseTypes}
        taskPurposes={taskPurposes}
      />
    </>
  );
}
