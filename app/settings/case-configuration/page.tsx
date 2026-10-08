import { notFound } from "next/navigation";
import {
  CaseConfigurationEditor,
  type CaseTypeConfiguration,
  type TaskPurposeConfiguration,
} from "@/components/case-configuration-editor";
import { PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
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
  const [types, purposes, query] = await Promise.all([
    supabase
      .from("organization_case_types")
      .select(
        "id,name,description,is_active,sort_order,customer_mode,tax_year_rule",
      )
      .eq("organization_id", organizationId)
      .order("sort_order")
      .order("name"),
    supabase
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
    (item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      customerMode:
        item.customer_mode as CaseTypeConfiguration["customerMode"],
      taxYearRule:
        item.tax_year_rule as CaseTypeConfiguration["taxYearRule"],
      sortOrder: item.sort_order,
      isActive: item.is_active,
    }),
  );
  const taskPurposes: TaskPurposeConfiguration[] = (purposes.data ?? []).map(
    (item) => ({
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
