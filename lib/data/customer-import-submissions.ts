import "server-only";

import { requireInternalContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export const CUSTOMER_IMPORT_FILE_BUCKET = "customer-import-files";
export const CUSTOMER_IMPORT_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const customerImportSubmissionRoles = [
  "BUSINESS_OWNER",
  "BUSINESS_ADMIN",
] as const;

export function canSubmitCustomerData(
  context: Awaited<ReturnType<typeof requireInternalContext>>,
) {
  return (
    !context.isSuperAdmin &&
    customerImportSubmissionRoles.some(
      (role) => role === context.activeOrganization.role,
    )
  );
}

export async function requireCustomerDataSubmitter() {
  const context = await requireInternalContext();

  if (!canSubmitCustomerData(context)) {
    throw new Error("UNAUTHORIZED");
  }

  return context;
}

export async function getCustomerImportSubmissions() {
  const context = await requireCustomerDataSubmitter();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customer_import_submissions")
    .select(
      "id,organization_id,uploaded_by_user_id,original_filename,file_size_bytes,mime_type,status,organization_note,created_at,updated_at,reviewed_at,imported_at,source_file_deleted_at",
    )
    .eq("organization_id", context.activeOrganization.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Customer data submissions could not be loaded", {
      organizationId: context.activeOrganization.id,
      code: error.code,
      message: error.message,
    });
    throw new Error("Customer data submissions could not be loaded.");
  }

  return {
    context,
    submissions: data ?? [],
  };
}
