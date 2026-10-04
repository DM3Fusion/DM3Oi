"use client";

import { useState } from "react";

import {
  publishLegalDocumentAction,
  saveLegalDocumentDraftAction,
} from "@/app/admin/legal-documents/actions";
import { LegalDocumentPage } from "@/components/legal-document-page";
import {
  withLegalPublicationMetadata,
  type LegalDocumentContent,
  type LegalDocumentKey,
} from "@/lib/legal-documents";
import type { LegalDocumentHistoryItem } from "@/lib/data/legal-document-repository";

type EditableLegalContent = {
  type: LegalDocumentKey;
  title: string;
  introduction: string[];
  sections: Array<{ heading: string; paragraphs: string[] }>;
};

type Props = {
  documentKey: LegalDocumentKey;
  initialContent: LegalDocumentContent;
  draftRevision: number | null;
  draftUpdatedAt: string | null;
  hasDatabaseDraft: boolean;
  publishedVersion: string;
  publishedEffectiveDate: string;
  publishedAt: string | null;
  hasDatabasePublication: boolean;
  history: LegalDocumentHistoryItem[];
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

function editableCopy(content: LegalDocumentContent): EditableLegalContent {
  return {
    type: content.type,
    title: content.title,
    introduction: [...content.introduction],
    sections: content.sections.map((section) => ({
      heading: section.heading,
      paragraphs: [...section.paragraphs],
    })),
  };
}

export function LegalDocumentEditor({
  documentKey,
  initialContent,
  draftRevision,
  draftUpdatedAt,
  hasDatabaseDraft,
  publishedVersion,
  publishedEffectiveDate,
  publishedAt,
  hasDatabasePublication,
  history,
}: Props) {
  const initialJson = JSON.stringify(initialContent);
  const [content, setContent] = useState<EditableLegalContent>(() =>
    editableCopy(initialContent),
  );
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const dirty = JSON.stringify(content) !== initialJson;

  const updateSection = (
    sectionIndex: number,
    updater: (section: EditableLegalContent["sections"][number]) =>
      EditableLegalContent["sections"][number],
  ) => {
    setContent((current) => ({
      ...current,
      sections: current.sections.map((section, index) =>
        index === sectionIndex ? updater(section) : section,
      ),
    }));
  };

  const label =
    documentKey === "TERMS_OF_SERVICE" ? "Terms of Service" : "Privacy Policy";
  const previewDocument = withLegalPublicationMetadata(
    content,
    "Draft preview",
    "Not published",
  );

  return (
    <div className="legal-admin-workspace">
      <section className="panel form-panel legal-admin-summary">
        <div className="section-heading">
          <div>
            <h2>{label}</h2>
            <p className="muted">
              Draft changes remain private until the saved draft is explicitly
              published.
            </p>
          </div>
          {!hasDatabasePublication ? (
            <span className="legal-fallback-badge">
              Code fallback / not yet database-published
            </span>
          ) : null}
        </div>

        <div className="legal-admin-meta">
          <span>
            <strong>Draft status</strong>
            {hasDatabaseDraft ? `Revision ${draftRevision}` : "Code fallback"}
          </span>
          <span>
            <strong>Last draft update</strong>
            {formatDateTime(draftUpdatedAt)}
          </span>
          <span>
            <strong>Current version</strong>
            {publishedVersion}
          </span>
          <span>
            <strong>Effective date</strong>
            {publishedEffectiveDate}
          </span>
          <span>
            <strong>Last published</strong>
            {hasDatabasePublication ? formatDateTime(publishedAt) : "Code fallback"}
          </span>
        </div>
      </section>

      <form
        action={saveLegalDocumentDraftAction}
        className="legal-admin-editor"
        onSubmit={() => setSaving(true)}
      >
        <input type="hidden" name="documentKey" value={documentKey} />
        <input
          type="hidden"
          name="content"
          value={JSON.stringify(content)}
          readOnly
        />

        <section className="panel form-panel">
          <div className="section-heading">
            <div>
              <h2>Document Header</h2>
              <p className="muted">Plain text only. Publication metadata is managed separately.</p>
            </div>
          </div>

          <div className="form-grid">
            <label className="full">
              <span>Document title</span>
              <input
                required
                maxLength={160}
                value={content.title}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        </section>

        <section className="panel form-panel">
          <div className="section-heading">
            <div>
              <h2>Introduction</h2>
              <p className="muted">Up to 12 introductory paragraphs.</p>
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={content.introduction.length >= 12}
              onClick={() =>
                setContent((current) => ({
                  ...current,
                  introduction: [...current.introduction, "New paragraph"],
                }))
              }
            >
              Add Paragraph
            </button>
          </div>

          <div className="legal-editor-list">
            {content.introduction.map((paragraph, paragraphIndex) => (
              <div className="legal-editor-row" key={`intro-${paragraphIndex}`}>
                <label>
                  <span>Paragraph {paragraphIndex + 1}</span>
                  <textarea
                    required
                    maxLength={4000}
                    rows={4}
                    value={paragraph}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        introduction: current.introduction.map((item, index) =>
                          index === paragraphIndex ? event.target.value : item,
                        ),
                      }))
                    }
                  />
                </label>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={content.introduction.length === 1}
                  onClick={() =>
                    setContent((current) => ({
                      ...current,
                      introduction: current.introduction.filter(
                        (_, index) => index !== paragraphIndex,
                      ),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>

        {content.sections.map((section, sectionIndex) => (
          <section
            className="panel form-panel legal-section-editor"
            key={`section-${sectionIndex}`}
          >
            <div className="section-heading">
              <div>
                <h2>Section {sectionIndex + 1}</h2>
                <p className="muted">Edit the heading and its plain-text paragraphs.</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={content.sections.length === 1}
                onClick={() =>
                  setContent((current) => ({
                    ...current,
                    sections: current.sections.filter(
                      (_, index) => index !== sectionIndex,
                    ),
                  }))
                }
              >
                Remove Section
              </button>
            </div>

            <div className="form-grid">
              <label className="full">
                <span>Section heading</span>
                <input
                  required
                  maxLength={200}
                  value={section.heading}
                  onChange={(event) =>
                    updateSection(sectionIndex, (current) => ({
                      ...current,
                      heading: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="legal-editor-list">
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <div
                  className="legal-editor-row"
                  key={`section-${sectionIndex}-paragraph-${paragraphIndex}`}
                >
                  <label>
                    <span>Paragraph {paragraphIndex + 1}</span>
                    <textarea
                      required
                      maxLength={4000}
                      rows={4}
                      value={paragraph}
                      onChange={(event) =>
                        updateSection(sectionIndex, (current) => ({
                          ...current,
                          paragraphs: current.paragraphs.map((item, index) =>
                            index === paragraphIndex ? event.target.value : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={section.paragraphs.length === 1}
                    onClick={() =>
                      updateSection(sectionIndex, (current) => ({
                        ...current,
                        paragraphs: current.paragraphs.filter(
                          (_, index) => index !== paragraphIndex,
                        ),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              className="secondary-button"
              type="button"
              disabled={section.paragraphs.length >= 20}
              onClick={() =>
                updateSection(sectionIndex, (current) => ({
                  ...current,
                  paragraphs: [...current.paragraphs, "New paragraph"],
                }))
              }
            >
              Add Section Paragraph
            </button>
          </section>
        ))}

        <button
          className="secondary-button legal-add-section"
          type="button"
          disabled={content.sections.length >= 30}
          onClick={() =>
            setContent((current) => ({
              ...current,
              sections: [
                ...current.sections,
                { heading: "New section", paragraphs: ["New paragraph"] },
              ],
            }))
          }
        >
          Add Section
        </button>

        <div className="legal-editor-actions">
          <span className="muted" aria-live="polite">
            {dirty ? "Unsaved draft changes" : "Draft matches the loaded content"}
          </span>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setShowPreview((current) => !current)}
          >
            {showPreview ? "Hide Preview" : "Preview Unsaved Draft"}
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Draft"}
          </button>
        </div>
      </form>

      {showPreview ? (
        <section className="legal-admin-preview" aria-label="Legal document preview">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>Unsaved draft preview</h2>
            </div>
          </div>
          <LegalDocumentPage document={previewDocument} preview />
        </section>
      ) : null}

      <form
        action={publishLegalDocumentAction}
        className="panel form-panel legal-publish-panel"
        onSubmit={() => setPublishing(true)}
      >
        <input type="hidden" name="documentKey" value={documentKey} />
        <div className="section-heading">
          <div>
            <h2>Publish Saved Draft</h2>
            <p className="muted">
              Publishing creates a new immutable historical version and makes it
              public. Unsaved editor changes above are not included.
            </p>
          </div>
        </div>

        <div className="form-grid">
          <label>
            <span>Version</span>
            <input
              name="version"
              required
              maxLength={32}
              pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,31}"
              placeholder="1.2"
              autoComplete="off"
            />
          </label>
          <label>
            <span>Effective date</span>
            <input name="effectiveDate" type="date" required />
          </label>
          <label className="full">
            <span>Type PUBLISH to confirm</span>
            <input
              name="confirmation"
              required
              pattern="PUBLISH"
              autoComplete="off"
            />
          </label>
        </div>

        <button className="primary-button" type="submit" disabled={publishing}>
          {publishing ? "Publishing…" : "Publish Saved Draft"}
        </button>
      </form>

      <section className="panel legal-history-panel">
        <div className="section-heading">
          <div>
            <h2>Publication History</h2>
            <p className="muted">Immutable versions, newest first.</p>
          </div>
        </div>

        {history.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Effective date</th>
                  <th>Published</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.version}</strong></td>
                    <td>{item.effectiveDate}</td>
                    <td>{formatDateTime(item.publishedAt)}</td>
                    <td>{item.isCurrent ? "Current" : "Historical"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            No database publications yet. The code fallback remains public.
          </div>
        )}
      </section>
    </div>
  );
}
