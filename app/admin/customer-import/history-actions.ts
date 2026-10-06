"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export async function removeCustomerImportRecordAction(input: {
  submissionId: string;
  confirmation: string;
}) {
  try {
    await requireSuperAdmin();

    if (input.confirmation !== "REMOVE IMPORT RECORD") {
      return {
        ok: false as const,
        error: 'Type "REMOVE IMPORT RECORD" exactly to continue.',
      };
    }

    const supabase = await createClient();

    const { error } = await supabase.rpc(
      "super_admin_remove_customer_import_record" as never,
      {
        target_submission_id: input.submissionId,
      } as never,
    );

    if (error) {
      console.error("Customer import record removal failed", {
        operation: "customer_import_record_remove",
        submissionId: input.submissionId,
        code: error.code,
        message: error.message,
      });

      if (error.code === "23514") {
        return {
          ok: false as const,
          error:
            error.message.includes("rollback imported Customers")
              ? "Rollback the Customers created by this import before removing its history record."
              : "The import record is not eligible for removal yet.",
        };
      }

      return {
        ok: false as const,
        error: "The import history record could not be removed.",
      };
    }

    revalidatePath("/admin/customer-import");

    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "The import history record could not be removed.",
    };
  }
}
