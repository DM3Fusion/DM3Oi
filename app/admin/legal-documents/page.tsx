import { LegalDocumentEditor } from "@/components/admin/legal-document-editor";
import { PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth/context";
import { getLegalDocumentForAdmin } from "@/lib/data/legal-document-repository";
import {
  isLegalDocumentKey,
  type LegalDocumentKey,
} from "@/lib/legal-documents";

export const metadata = { title: "Legal Documents" };

export default async function LegalDocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  await requireSuperAdmin();

  const query = await searchParams;
  const requestedDocument = query?.document ?? "";
  const documentKey: LegalDocumentKey = isLegalDocumentKey(requestedDocument)
    ? requestedDocument
    : "TERMS_OF_SERVICE";
  const state = await getLegalDocumentForAdmin(documentKey);

  const error =
    query?.error === "invalid"
      ? "Review the document content. One or more values are invalid."
      : query?.error === "save"
        ? "The legal document draft could not be saved."
        : query?.error === "publish-validation"
          ? "Enter a valid version and effective date, then type PUBLISH exactly."
          : query?.error === "duplicate-version"
            ? "That version already exists for this document. Published history cannot be overwritten."
            : query?.error === "publish"
              ? "The saved draft could not be published."
              : null;

  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title="Legal Documents"
        description="Manage Terms of Service and Privacy Policy drafts. Draft changes remain private until explicitly published."
      />

      {query?.saved ? (
        <div className="form-success" role="status">Draft saved.</div>
      ) : null}
      {query?.published ? (
        <div className="form-success" role="status">Legal document published.</div>
      ) : null}
      {error ? (
        <div className="form-alert" role="alert">{error}</div>
      ) : null}

      <nav className="settings-tabs email-template-tabs" aria-label="Legal documents">
        <a
          href="/admin/legal-documents?document=TERMS_OF_SERVICE"
          className={documentKey === "TERMS_OF_SERVICE" ? "active" : undefined}
        >
          Terms of Service
        </a>
        <a
          href="/admin/legal-documents?document=PRIVACY_POLICY"
          className={documentKey === "PRIVACY_POLICY" ? "active" : undefined}
        >
          Privacy Policy
        </a>
      </nav>

      <LegalDocumentEditor
        documentKey={state.documentKey}
        initialContent={state.draftContent}
        draftRevision={state.draftRevision}
        draftUpdatedAt={state.draftUpdatedAt}
        hasDatabaseDraft={state.hasDatabaseDraft}
        publishedVersion={state.publishedDocument.version}
        publishedEffectiveDate={state.publishedDocument.effectiveDate}
        publishedAt={state.publishedAt}
        hasDatabasePublication={state.hasDatabasePublication}
        history={state.history}
      />
    </>
  );
}
