"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperAdmin } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "customer-import-files";

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

async function loadSubmission(id: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("customer_import_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Customer data submission was not found.");
  }

  return { admin, submission: data };
}

export async function downloadCustomerImportSourceAction(form: FormData) {
  await requireSuperAdmin();

  const submissionId = text(form, "submissionId");

  if (!submissionId) {
    throw new Error("Customer data submission was not found.");
  }

  const { admin, submission } = await loadSubmission(submissionId);

  if (submission.source_file_deleted_at) {
    throw new Error("The source file has already been deleted.");
  }

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(submission.storage_path, 60, {
      download: submission.original_filename,
    });

  if (error || !data?.signedUrl) {
    console.error("Customer import source signing failed", {
      submissionId,
      code: error?.name ?? null,
      message: error?.message ?? null,
    });

    throw new Error("The source file could not be downloaded.");
  }

  redirect(data.signedUrl);
}

export async function updateCustomerImportSubmissionAction(form: FormData) {
  const context = await requireSuperAdmin();

  const submissionId = text(form, "submissionId");
  const status = text(form, "status");
  const superAdminNote = text(form, "superAdminNote");
  const correctionInstructions = text(form, "correctionInstructions");

  const allowed = new Set([
    "UPLOADED",
    "UNDER_REVIEW",
    "NEEDS_CORRECTION",
    "READY_TO_IMPORT",
    "REJECTED",
  ]);

  if (!submissionId || !allowed.has(status)) {
    return {
      ok: false as const,
      error: "Select a valid Customer import review status.",
    };
  }

  if (superAdminNote.length > 4000) {
    return {
      ok: false as const,
      error: "Platform administrator notes must be 4,000 characters or fewer.",
    };
  }

  if (correctionInstructions.length > 4000) {
    return {
      ok: false as const,
      error: "Correction instructions must be 4,000 characters or fewer.",
    };
  }

  if (status === "NEEDS_CORRECTION" && !correctionInstructions) {
    return {
      ok: false as const,
      error:
        "Correction instructions are required when Customer data needs correction.",
    };
  }

  const { admin, submission } = await loadSubmission(submissionId);

  if (submission.status === "IMPORTED") {
    return {
      ok: false as const,
      error: "Imported Customer submissions cannot be changed.",
    };
  }

  const { error } = await admin
    .from("customer_import_submissions")
    .update({
      status,
      super_admin_note: superAdminNote || null,
      correction_instructions:
        status === "NEEDS_CORRECTION"
          ? correctionInstructions
          : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: context.user.id,
    })
    .eq("id", submissionId);

  if (error) {
    console.error("Customer import submission review update failed", {
      submissionId,
      code: error.code,
      message: error.message,
    });

    return {
      ok: false as const,
      error: "The Customer data submission could not be updated.",
    };
  }

  revalidatePath("/admin/customer-import");
  revalidatePath("/customers/import");

  return {
    ok: true as const,
  };
}

export async function deleteCustomerImportSourceAction(form: FormData) {
  const context = await requireSuperAdmin();

  const submissionId = text(form, "submissionId");
  const confirmation = text(form, "confirmation");

  if (!submissionId) {
    throw new Error("Customer data submission was not found.");
  }

  if (confirmation !== "DELETE FILE") {
    throw new Error('Type "DELETE FILE" to remove the staged source file.');
  }

  const { admin, submission } = await loadSubmission(submissionId);

  if (submission.source_file_deleted_at) {
    revalidatePath("/admin/customer-import");
    return;
  }

  const removed = await admin.storage
    .from(BUCKET)
    .remove([submission.storage_path]);

  if (removed.error) {
    console.error("Customer import source deletion failed", {
      submissionId,
      code: removed.error.name,
      message: removed.error.message,
    });

    throw new Error("The staged source file could not be deleted.");
  }

  const { error } = await admin
    .from("customer_import_submissions")
    .update({
      source_file_deleted_at: new Date().toISOString(),
      source_file_deleted_by_user_id: context.user.id,
    })
    .eq("id", submissionId);

  if (error) {
    console.error("Customer import source deletion audit failed", {
      submissionId,
      code: error.code,
      message: error.message,
    });

    throw new Error(
      "The source file was deleted, but its cleanup audit could not be finalized.",
    );
  }

  revalidatePath("/admin/customer-import");
  revalidatePath("/customers/import");
}
