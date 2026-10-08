import "server-only";

import { requireSuperAdmin } from "@/lib/auth/context";
import {
  getFallbackLegalDocument,
  isLegalDocumentEffectiveDate,
  isLegalDocumentKey,
  isLegalDocumentVersion,
  legalDocumentContent,
  parseLegalDocumentContent,
  withLegalPublicationMetadata,
  type LegalDocumentContent,
  type LegalDocumentDefinition,
  type LegalDocumentKey,
} from "@/lib/legal-documents";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LegalDocumentHistoryItem = {
  id: string;
  version: string;
  effectiveDate: string;
  publishedAt: string;
  publishedBy: string | null;
  isCurrent: boolean;
};

export type LegalDocumentAdminState = {
  documentKey: LegalDocumentKey;
  draftContent: LegalDocumentContent;
  draftRevision: number | null;
  draftUpdatedAt: string | null;
  hasDatabaseDraft: boolean;
  publishedDocument: LegalDocumentDefinition;
  publishedAt: string | null;
  hasDatabasePublication: boolean;
  history: LegalDocumentHistoryItem[];
};

type AdminPayload = {
  document_key?: unknown;
  draft_content?: unknown;
  draft_revision?: unknown;
  draft_updated_at?: unknown;
  published_content?: unknown;
  published_version?: unknown;
  published_effective_date?: unknown;
  published_at?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAdminPayload(
  documentKey: LegalDocumentKey,
  value: unknown,
): Omit<LegalDocumentAdminState, "history"> | null {
  if (!isRecord(value)) return null;
  const payload = value as AdminPayload;
  if (payload.document_key !== documentKey) return null;

  const fallback = getFallbackLegalDocument(documentKey);
  const hasDatabaseDraft = payload.draft_content !== null;
  const draftContent = hasDatabaseDraft
    ? parseLegalDocumentContent(documentKey, payload.draft_content)
    : legalDocumentContent(fallback);

  if (!draftContent) return null;
  if (
    hasDatabaseDraft &&
    (!Number.isInteger(payload.draft_revision) ||
      (payload.draft_revision as number) < 1 ||
      typeof payload.draft_updated_at !== "string")
  ) {
    return null;
  }

  const hasDatabasePublication = payload.published_content !== null;
  let publishedDocument: LegalDocumentDefinition = fallback;
  let publishedAt: string | null = null;

  if (hasDatabasePublication) {
    const publishedContent = parseLegalDocumentContent(
      documentKey,
      payload.published_content,
    );
    if (
      !publishedContent ||
      typeof payload.published_version !== "string" ||
      !isLegalDocumentVersion(payload.published_version) ||
      typeof payload.published_effective_date !== "string" ||
      !isLegalDocumentEffectiveDate(payload.published_effective_date) ||
      typeof payload.published_at !== "string"
    ) {
      return null;
    }

    publishedDocument = withLegalPublicationMetadata(
      publishedContent,
      payload.published_version,
      payload.published_effective_date,
    );
    publishedAt = payload.published_at;
  }

  return {
    documentKey,
    draftContent,
    draftRevision: hasDatabaseDraft
      ? (payload.draft_revision as number)
      : null,
    draftUpdatedAt: hasDatabaseDraft
      ? (payload.draft_updated_at as string)
      : null,
    hasDatabaseDraft,
    publishedDocument,
    publishedAt,
    hasDatabasePublication,
  };
}

function parseHistory(value: unknown): LegalDocumentHistoryItem[] | null {
  if (!Array.isArray(value)) return null;

  const history: LegalDocumentHistoryItem[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (
      typeof item.id !== "string" ||
      typeof item.version !== "string" ||
      !isLegalDocumentVersion(item.version) ||
      typeof item.effective_date !== "string" ||
      !isLegalDocumentEffectiveDate(item.effective_date) ||
      typeof item.published_at !== "string" ||
      (item.published_by !== null && typeof item.published_by !== "string") ||
      typeof item.is_current !== "boolean"
    ) {
      return null;
    }

    history.push({
      id: item.id,
      version: item.version,
      effectiveDate: item.effective_date,
      publishedAt: item.published_at,
      publishedBy: item.published_by as string | null,
      isCurrent: item.is_current,
    });
  }

  return history;
}

export async function getLegalDocumentForAdmin(
  documentKey: LegalDocumentKey,
): Promise<LegalDocumentAdminState> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const [stateResult, historyResult] = await Promise.all([
    supabase.rpc(
      "get_legal_document_for_admin",
      { target_document_key: documentKey },
    ),
    supabase.rpc(
      "get_legal_document_history_for_admin",
      { target_document_key: documentKey },
    ),
  ]);

  if (stateResult.error || historyResult.error) {
    const error = stateResult.error ?? historyResult.error;
    console.error("Legal document admin query failed", {
      operation: "getLegalDocumentForAdmin",
      documentKey,
      code: error?.code,
      message: error?.message,
    });
    throw new Error("Legal document management is temporarily unavailable.");
  }

  const state = parseAdminPayload(documentKey, stateResult.data);
  const history = parseHistory(historyResult.data);
  if (!state || !history) {
    console.error("Legal document admin payload was invalid", {
      operation: "getLegalDocumentForAdmin",
      documentKey,
    });
    throw new Error("Legal document management is temporarily unavailable.");
  }

  return { ...state, history };
}

export async function getPublishedLegalDocumentForServer(
  documentKey: LegalDocumentKey,
): Promise<LegalDocumentDefinition> {
  const fallback = getFallbackLegalDocument(documentKey);

  try {
    const admin = createAdminClient();
    const result = await admin.rpc(
      "get_published_legal_document_server",
      { target_document_key: documentKey },
    );

    if (result.error) {
      console.error("Published legal document query failed", {
        operation: "getPublishedLegalDocumentForServer",
        documentKey,
        code: result.error.code,
        message: result.error.message,
      });
      return fallback;
    }

    const rawPayload: unknown = result.data;
    if (!isRecord(rawPayload)) return fallback;
    const payload = rawPayload;
    const content = parseLegalDocumentContent(documentKey, payload.content);
    if (
      payload.document_key !== documentKey ||
      !content ||
      typeof payload.version !== "string" ||
      !isLegalDocumentVersion(payload.version) ||
      typeof payload.effective_date !== "string" ||
      !isLegalDocumentEffectiveDate(payload.effective_date)
    ) {
      console.error("Published legal document payload was invalid", {
        operation: "getPublishedLegalDocumentForServer",
        documentKey,
      });
      return fallback;
    }

    return withLegalPublicationMetadata(
      content,
      payload.version,
      payload.effective_date,
    );
  } catch (error) {
    console.error("Published legal document loading failed", {
      operation: "getPublishedLegalDocumentForServer",
      documentKey,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return fallback;
  }
}

export function isRequestedLegalDocumentKey(
  value: unknown,
): value is LegalDocumentKey {
  return isLegalDocumentKey(value);
}
