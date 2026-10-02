"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CUSTOMER_IMPORT_FILE_BUCKET,
  CUSTOMER_IMPORT_FILE_MAX_BYTES,
  requireCustomerDataSubmitter,
} from "@/lib/data/customer-import-submissions";
import { notifyPlatformAdministratorsOfCustomerDataSubmission } from "@/lib/data/customer-data-submission-notification-service";
import { createAdminClient } from "@/lib/supabase/admin";

const allowedExtensions = new Map([
  ["csv", "text/csv"],
  ["xls", "application/vnd.ms-excel"],
  [
    "xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
]);

function destination(key: "message" | "error", value: string) {
  return `/customers/import?${key}=${encodeURIComponent(value)}`;
}

function fail(message: string): never {
  redirect(destination("error", message));
}

export async function submitCustomerDataAction(form: FormData) {
  const context = await requireCustomerDataSubmitter();
  const source = form.get("sourceFile");
  const organizationNote = String(form.get("organizationNote") ?? "").trim();

  if (!(source instanceof File) || source.size === 0) {
    fail("Select an Excel or CSV file to submit.");
  }

  if (source.size > CUSTOMER_IMPORT_FILE_MAX_BYTES) {
    fail("Customer data files must be 10 MB or smaller.");
  }

  const originalFilename = source.name.trim();

  if (!originalFilename || originalFilename.length > 255) {
    fail("The selected file name is invalid.");
  }

  const extension = originalFilename.split(".").pop()?.toLowerCase() ?? "";
  const contentType = allowedExtensions.get(extension);

  if (!contentType) {
    fail("Choose a CSV, XLS, or XLSX file.");
  }

  if (organizationNote.length > 2000) {
    fail("The submission note must be 2,000 characters or fewer.");
  }

  const submissionId = randomUUID();
  const objectId = randomUUID();
  const storagePath =
    `${context.activeOrganization.id}/${submissionId}/` +
    `source-${objectId}.${extension}`;

  const admin = createAdminClient();
  const bytes = new Uint8Array(await source.arrayBuffer());

  const upload = await admin.storage
    .from(CUSTOMER_IMPORT_FILE_BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (upload.error) {
    console.error("Customer source file upload failed", {
      organizationId: context.activeOrganization.id,
      userId: context.user.id,
      code: upload.error.name,
      message: upload.error.message,
    });
    fail("The Customer data file could not be uploaded. Please try again.");
  }

  const inserted = await admin
    .from("customer_import_submissions")
    .insert({
      id: submissionId,
      organization_id: context.activeOrganization.id,
      uploaded_by_user_id: context.user.id,
      original_filename: originalFilename,
      storage_bucket: CUSTOMER_IMPORT_FILE_BUCKET,
      storage_path: storagePath,
      file_size_bytes: source.size,
      mime_type: contentType,
      organization_note: organizationNote || null,
      status: "UPLOADED",
    })
    .select("id,created_at")
    .single();

  if (inserted.error || !inserted.data) {
    await admin.storage
      .from(CUSTOMER_IMPORT_FILE_BUCKET)
      .remove([storagePath]);

    console.error("Customer import submission record failed", {
      organizationId: context.activeOrganization.id,
      userId: context.user.id,
      code: inserted.error.code,
      message: inserted.error.message,
    });

    fail("The Customer data submission could not be saved. Please try again.");
  }

  try {
    const uploaderName =
      context.displayName?.trim() ||
      context.profileEmail?.trim() ||
      context.user.email?.trim() ||
      "Organization user";
    const uploaderEmail =
      context.profileEmail?.trim().toLowerCase() ||
      context.user.email?.trim().toLowerCase() ||
      "Email unavailable";

    await notifyPlatformAdministratorsOfCustomerDataSubmission({
      submissionId,
      organizationId: context.activeOrganization.id,
      organizationName: context.activeOrganization.name,
      uploaderUserId: context.user.id,
      uploaderName,
      uploaderEmail,
      originalFilename,
      submittedAt: inserted.data.created_at,
    });
  } catch (error) {
    console.error("Customer data submission notification failed", {
      submissionId,
      organizationId: context.activeOrganization.id,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }

  revalidatePath("/customers/import");
  revalidatePath("/admin/customer-import");
  revalidatePath("/communications");
  revalidatePath("/", "layout");

  redirect(
    destination(
      "message",
      "Customer data submitted for platform administrator review.",
    ),
  );
}
