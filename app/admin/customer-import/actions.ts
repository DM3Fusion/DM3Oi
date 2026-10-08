"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { parseCustomerImportCsv, previewCustomerImport } from "@/lib/customer-data-management";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
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


export async function executeAdministrativeCustomerImportAction(input: {
  organizationId: string;
  csv: string;
  fileName: string;
  confirmation: string;
}) {
  try {
    await requireSuperAdmin();

    const { organization, customers } =
      await getCustomerImportReadContext(
        input.organizationId,
        "customer_import_confirmation",
      );

    const rows = parseCustomerImportCsv(input.csv);
    const preview = previewCustomerImport(rows, customers);

    if (preview.summary.validNew === 0) {
      throw new Error("There are no safe new rows to import.");
    }

    const expected =
      `IMPORT ${preview.summary.validNew} CUSTOMERS INTO ${organization.name}`;

    if (input.confirmation !== expected) {
      throw new Error(`Type “${expected}” to confirm.`);
    }

    const fileBytes = new TextEncoder().encode(input.csv);

    if (fileBytes.length === 0 || fileBytes.length > 1_000_000) {
      throw new Error("The canonical CSV must be between 1 byte and 1 MB.");
    }

    const safeFileName =
      input.fileName.trim().slice(0, 255) || "administrative-import.csv";

    const storagePath =
      `${organization.id}/administrative/${randomUUID()}.csv`;

    const admin = createAdminClient();

    const uploaded = await admin.storage
      .from("customer-import-files")
      .upload(storagePath, fileBytes, {
        contentType: "text/csv",
        upsert: false,
      });

    if (uploaded.error) {
      console.error("Administrative Customer import source upload failed", {
        operation: "customer_import_admin_upload",
        organizationId: organization.id,
        message: uploaded.error.message,
      });

      throw new Error(
        "The administrative import source file could not be staged.",
      );
    }

    const supabase = await createClient();

    const created = (await supabase.rpc(
      "super_admin_create_administrative_import",
      {
        target_organization_id: organization.id,
        target_original_filename: safeFileName,
        target_storage_path: storagePath,
        target_file_size_bytes: fileBytes.length,
      },
    )) as unknown as {
      data: string | null;
      error: {
        code?: string;
        message?: string;
      } | null;
    };

    if (created.error || typeof created.data !== "string") {
      await admin.storage
        .from("customer-import-files")
        .remove([storagePath]);

      console.error("Administrative Customer import submission failed", {
        operation: "customer_import_admin_submission",
        organizationId: organization.id,
        code: created.error?.code ?? null,
        message: created.error?.message ?? null,
      });

      throw new Error(
        "The administrative import could not be prepared.",
      );
    }

    const submissionId = created.data;

    const imported = await supabase.rpc(
      "super_admin_import_customers",
      {
        target_organization_id: organization.id,
        target_submission_id: submissionId,
        target_rows: rows as unknown as Json,
      },
    );

    if (imported.error) {
      console.error("Administrative Customer import failed", {
        operation: "customer_import_admin_execute",
        organizationId: organization.id,
        submissionId,
        code: imported.error.code,
        message: imported.error.message,
        details: imported.error.details || undefined,
      });

      throw new Error(
        "No Customers were imported. The administrative import remains available for SUPER_ADMIN recovery.",
      );
    }

    revalidatePath("/admin/customer-import");
    revalidatePath("/admin/customer-duplicates");
    revalidatePath("/customers");
    revalidatePath("/customers/import");

    return {
      ok: true as const,
      submissionId,
      result: imported.data,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The administrative import could not be completed.",
    };
  }
}
