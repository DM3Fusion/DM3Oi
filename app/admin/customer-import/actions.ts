"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/context";
import { parseCustomerImportCsv, previewCustomerImport } from "@/lib/customer-data-management";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.generated";
import { requireOrganizationCustomers } from "@/lib/data/organization-customers";

async function loadImportContext(organizationId: string) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const [{ data: organization, error }, { data: customers, error: customerError }] = await Promise.all([
    supabase.from("organizations").select("id,name,status").eq("id", organizationId).maybeSingle(),
    supabase.from("organization_customers").select("*").eq("organization_id", organizationId),
  ]);
  if (error || customerError || !organization || organization.status !== "ACTIVE")
    throw new Error("Select an active target organization.");
  return {
    supabase,
    organization,
    customers: requireOrganizationCustomers(customers ?? []),
  };
}

export async function previewCustomerImportAction(input: { organizationId: string; csv: string }) {
  try {
    const { organization, customers } = await loadImportContext(input.organizationId);
    const rows = parseCustomerImportCsv(input.csv);
    return { ok: true as const, organization, preview: previewCustomerImport(rows, customers) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The CSV could not be previewed." };
  }
}

export async function executeCustomerImportAction(input: { organizationId: string; csv: string; confirmation: string }) {
  try {
    const { supabase, organization, customers } = await loadImportContext(input.organizationId);
    const rows = parseCustomerImportCsv(input.csv);
    const preview = previewCustomerImport(rows, customers);
    const expected = `IMPORT ${preview.summary.validNew} CUSTOMERS INTO ${organization.name}`;
    if (preview.summary.validNew === 0) throw new Error("There are no safe new rows to import.");
    if (input.confirmation !== expected) throw new Error(`Type “${expected}” to confirm.`);
    const { data, error } = await supabase.rpc("super_admin_import_customers", {
      target_organization_id: organization.id,
      target_rows: rows as unknown as Json,
    });
    if (error) {
      console.error("SUPER_ADMIN Customer import failed", { code: error.code, message: error.message, organizationId: organization.id });
      const failedRow = error.message.match(/CSV row (\d+)/)?.[1];
      throw new Error(failedRow ? `No Customers were imported. Database validation failed at CSV row ${failedRow}.` : "No Customers were imported. The database rejected the transaction.");
    }
    revalidatePath("/admin/customer-import"); revalidatePath("/admin/customer-duplicates"); revalidatePath("/customers");
    return { ok: true as const, result: data };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The import could not be completed." };
  }
}
