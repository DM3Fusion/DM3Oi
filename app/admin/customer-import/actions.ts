"use server";

import { revalidatePath } from "next/cache";
import { parseCustomerImportCsv, previewCustomerImport } from "@/lib/customer-data-management";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.generated";
import {
  getCustomerImportReadContext,
  requireReadyCustomerImportSubmission,
} from "@/lib/data/customer-data-management-repository";
import { requireSuperAdmin } from "@/lib/auth/context";

const PREVIEW_FAILURE_MESSAGE = "The CSV preview could not be completed.";

export async function previewCustomerImportAction(input: { organizationId: string; csv: string }) {
  try {
    const { organization, customers } = await getCustomerImportReadContext(
      input.organizationId,
      "customer_import_preview",
    );
    const rows = parseCustomerImportCsv(input.csv);
    return { ok: true as const, organization, preview: previewCustomerImport(rows, customers) };
  } catch (error) {
    console.error("Customer CSV preview failed", {
      operation: "customer_import_preview",
      code: "PREVIEW_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
      details: undefined,
      organizationId: input.organizationId,
    });
    return { ok: false as const, error: PREVIEW_FAILURE_MESSAGE };
  }
}

export async function executeCustomerImportAction(input: {
  organizationId: string;
  submissionId: string;
  csv: string;
  confirmation: string;
}) {
  try {
    await requireSuperAdmin();

    const [{ organization, customers }, submission] = await Promise.all([
      getCustomerImportReadContext(
        input.organizationId,
        "customer_import_confirmation",
      ),
      requireReadyCustomerImportSubmission(
        input.submissionId,
        input.organizationId,
      ),
    ]);
    const rows = parseCustomerImportCsv(input.csv);
    const preview = previewCustomerImport(rows, customers);
    const expected = `IMPORT ${preview.summary.validNew} CUSTOMERS INTO ${organization.name}`;
    if (preview.summary.validNew === 0) throw new Error("There are no safe new rows to import.");
    if (input.confirmation !== expected) throw new Error(`Type “${expected}” to confirm.`);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("super_admin_import_customers", {
      target_organization_id: organization.id,
      target_submission_id: submission.id,
      target_rows: rows as unknown as Json,
    });
    if (error) {
      console.error("SUPER_ADMIN Customer import failed", {
        operation: "customer_import_execute",
        code: error.code,
        message: error.message,
        details: error.details || undefined,
        hint: error.hint || undefined,
        organizationId: organization.id,
        submissionId: submission.id,
      });

      const failedRow = error.message.match(/CSV row (\d+)/)?.[1];

      throw new Error(
        failedRow
          ? `No Customers were imported. Database validation failed at CSV row ${failedRow}.`
          : "No Customers were imported. The database rejected the transaction.",
      );
    }

    revalidatePath("/admin/customer-import");
    revalidatePath("/admin/customer-duplicates");
    revalidatePath("/customers");
    revalidatePath("/customers/import");

    return {
      ok: true as const,
      result: data,
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The import could not be completed." };
  }
}
