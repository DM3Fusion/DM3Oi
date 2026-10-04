"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperAdmin } from "@/lib/auth/context";
import {
  isLegalDocumentEffectiveDate,
  isLegalDocumentKey,
  isLegalDocumentVersion,
  parseLegalDocumentContent,
  type LegalDocumentKey,
} from "@/lib/legal-documents";
import { createClient } from "@/lib/supabase/server";

function field(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function destination(documentKey: string, status: string) {
  const selected = isLegalDocumentKey(documentKey)
    ? documentKey
    : "TERMS_OF_SERVICE";
  return `/admin/legal-documents?document=${encodeURIComponent(selected)}&${status}`;
}

function parseDraft(documentKey: LegalDocumentKey, raw: string) {
  try {
    return parseLegalDocumentContent(documentKey, JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveLegalDocumentDraftAction(form: FormData) {
  await requireSuperAdmin();

  const documentKey = field(form, "documentKey");
  const rawContent = field(form, "content");
  if (!isLegalDocumentKey(documentKey)) {
    redirect(destination(documentKey, "error=invalid"));
  }

  const content = parseDraft(documentKey, rawContent);
  if (!content) {
    redirect(destination(documentKey, "error=invalid"));
  }

  const supabase = await createClient();
  const result = await supabase.rpc(
    "save_legal_document_draft" as never,
    {
      target_document_key: documentKey,
      target_content: content,
    } as never,
  );

  if (result.error) {
    console.error("Legal document draft save failed", {
      operation: "saveLegalDocumentDraft",
      documentKey,
      code: result.error.code,
      message: result.error.message,
    });
    redirect(destination(documentKey, "error=save"));
  }

  revalidatePath("/admin/legal-documents");
  redirect(destination(documentKey, "saved=1"));
}

export async function publishLegalDocumentAction(form: FormData) {
  await requireSuperAdmin();

  const documentKey = field(form, "documentKey");
  const version = field(form, "version");
  const effectiveDate = field(form, "effectiveDate");
  const confirmation = field(form, "confirmation");

  if (
    !isLegalDocumentKey(documentKey) ||
    !isLegalDocumentVersion(version) ||
    !isLegalDocumentEffectiveDate(effectiveDate) ||
    confirmation !== "PUBLISH"
  ) {
    redirect(destination(documentKey, "error=publish-validation"));
  }

  const supabase = await createClient();
  const result = await supabase.rpc(
    "publish_legal_document" as never,
    {
      target_document_key: documentKey,
      target_version: version,
      target_effective_date: effectiveDate,
    } as never,
  );

  if (result.error) {
    const duplicate =
      result.error.code === "23505" ||
      /duplicate|unique/i.test(result.error.message);

    console.error("Legal document publish failed", {
      operation: "publishLegalDocument",
      documentKey,
      code: result.error.code,
      message: result.error.message,
    });
    redirect(
      destination(
        documentKey,
        duplicate ? "error=duplicate-version" : "error=publish",
      ),
    );
  }

  revalidatePath("/admin/legal-documents");
  revalidatePath(
    documentKey === "TERMS_OF_SERVICE" ? "/terms" : "/privacy",
  );
  redirect(destination(documentKey, "published=1"));
}
