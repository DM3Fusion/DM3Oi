"use client";

import { useState } from "react";

import { HowToGuideRenderer } from "@/components/how-to-guides/guide-renderer";
import { HowToGuideRichTextEditor } from "@/components/admin/how-to-guide-rich-text-editor";
import {
  type HowToGuideContent,
  type HowToGuideKey,
} from "@/lib/how-to-guide-content";

import {
  publishHowToGuideAction,
  saveHowToGuideDraftAction,
} from "@/app/admin/how-to-guides/actions";

type Props = {
  guideKey: HowToGuideKey;
  initialContent: HowToGuideContent;
  draftRevision: number;
  publishedRevision: number;
  draftUpdatedAt: string;
  publishedAt: string;
};

const guideDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

function formatGuideDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : guideDateFormatter.format(date);
}

export function HowToGuideEditor({
  guideKey,
  initialContent,
  draftRevision,
  publishedRevision,
  draftUpdatedAt,
  publishedAt,
}: Props) {
  const [content, setContent] = useState<HowToGuideContent>(initialContent);
  const [showPreview, setShowPreview] = useState(false);

  const updateSection = (
    index: number,
    updater: (section: HowToGuideContent["sections"][number]) =>
      HowToGuideContent["sections"][number],
  ) => {
    setContent((current) => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) =>
        sectionIndex === index ? updater(section) : section,
      ),
    }));
  };

  const guideLabel =
    guideKey === "OWNER_ADMIN" ? "Owner/Admin Guide" : "Staff Guide";

  return (
    <>
      <section className="panel form-panel guide-template-summary">
        <div className="section-heading">
          <div>
            <h2>{guideLabel}</h2>
            <p className="muted">
              Edit the draft below. Organization users continue seeing the
              published revision until you explicitly publish.
            </p>
          </div>
        </div>

        <div className="guide-template-meta">
          <span>
            <strong>Draft revision</strong>
            {draftRevision}
          </span>
          <span>
            <strong>Last draft update</strong>
            {formatGuideDate(draftUpdatedAt)}
          </span>
          <span>
            <strong>Published revision</strong>
            {publishedRevision}
          </span>
          <span>
            <strong>Published</strong>
            {formatGuideDate(publishedAt)}
          </span>
        </div>
      </section>

      <form action={saveHowToGuideDraftAction} className="guide-template-editor">
        <input type="hidden" name="guideKey" value={guideKey} />
        <input
          type="hidden"
          name="content"
          value={JSON.stringify(content)}
          readOnly
        />

        <section className="panel form-panel">
          <div className="section-heading">
            <div>
              <h2>Guide Header</h2>
              <p className="muted">
                These values appear at the top of the published guide.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <label className="full">
              <span>Title</span>
              <input
                maxLength={120}
                required
                value={content.title}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>

            <label className="full">
              <span>Introduction</span>
              <textarea
                maxLength={500}
                required
                rows={3}
                value={content.intro}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    intro: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        </section>

        {content.sections.map((section, sectionIndex) => (
          <section
            className="panel form-panel guide-template-section-editor"
            key={section.key}
          >
            <div className="section-heading">
              <div>
                <h2>
                  {sectionIndex + 1}. {section.title}
                </h2>
                <p className="muted">{section.key}</p>
              </div>

              <label className="guide-template-enabled">
                <input
                  type="checkbox"
                  checked={section.enabled}
                  onChange={(event) =>
                    updateSection(sectionIndex, (current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                />
                <span>Published section</span>
              </label>
            </div>

            <div className="form-grid">
              <label className="full">
                <span>Section title</span>
                <input
                  maxLength={120}
                  required
                  value={section.title}
                  onChange={(event) =>
                    updateSection(sectionIndex, (current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>

              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <div
                  className="full guide-rich-field"
                  key={`${section.key}-paragraph-${paragraphIndex}`}
                >
                  <span className="guide-rich-field-label">
                    Paragraph {paragraphIndex + 1}
                  </span>
                  <HowToGuideRichTextEditor
                    value={paragraph}
                    maxLength={2000}
                    ariaLabel={`${section.title} paragraph ${paragraphIndex + 1}`}
                    onChange={(value) =>
                      updateSection(sectionIndex, (current) => ({
                        ...current,
                        paragraphs: current.paragraphs.map((item, itemIndex) =>
                          itemIndex === paragraphIndex ? value : item,
                        ),
                      }))
                    }
                  />
                </div>
              ))}

              {section.steps.map((step, stepIndex) => (
                <div
                  className="full guide-template-step-editor"
                  key={`${section.key}-step-${stepIndex}`}
                >
                  <label>
                    <span>Step {stepIndex + 1} title</span>
                    <input
                      maxLength={160}
                      required
                      value={step.title}
                      onChange={(event) =>
                        updateSection(sectionIndex, (current) => ({
                          ...current,
                          steps: current.steps.map((item, itemIndex) =>
                            itemIndex === stepIndex
                              ? { ...item, title: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                  </label>

                  <div className="guide-rich-field">
                    <span className="guide-rich-field-label">
                      Step {stepIndex + 1} text
                    </span>
                    <HowToGuideRichTextEditor
                      value={step.body}
                      maxLength={1500}
                      ariaLabel={`${section.title} step ${stepIndex + 1} text`}
                      onChange={(value) =>
                        updateSection(sectionIndex, (current) => ({
                          ...current,
                          steps: current.steps.map((item, itemIndex) =>
                            itemIndex === stepIndex
                              ? { ...item, body: value }
                              : item,
                          ),
                        }))
                      }
                    />
                  </div>
                </div>
              ))}

              {section.callout ? (
                <div className="full guide-rich-field">
                  <span className="guide-rich-field-label">
                    {section.callout.type === "TIP"
                      ? "Tip"
                      : section.callout.type === "IMPORTANT"
                        ? "Important"
                        : section.callout.type === "OWNER_ADMIN"
                          ? "Owner/Admin"
                          : "Staff boundary"}
                  </span>
                  <HowToGuideRichTextEditor
                    value={section.callout.text}
                    maxLength={1500}
                    ariaLabel={`${section.title} callout`}
                    onChange={(value) =>
                      updateSection(sectionIndex, (current) => ({
                        ...current,
                        callout: current.callout
                          ? {
                              ...current.callout,
                              text: value,
                            }
                          : null,
                      }))
                    }
                  />
                </div>
              ) : null}

              {section.figure_key && section.figure_caption ? (
                <div className="full guide-rich-field">
                  <span className="guide-rich-field-label">
                    Instructional graphic caption
                  </span>
                  <HowToGuideRichTextEditor
                    value={section.figure_caption}
                    maxLength={500}
                    ariaLabel={`${section.title} instructional graphic caption`}
                    onChange={(value) =>
                      updateSection(sectionIndex, (current) => ({
                        ...current,
                        figure_caption: value,
                      }))
                    }
                  />
                  <small className="form-help">
                    Graphic: {section.figure_key}
                  </small>
                </div>
              ) : null}
            </div>
          </section>
        ))}

        <div className="guide-template-actions">
          <button className="primary-button" type="submit">
            Save Draft
          </button>

          <button
            className="secondary-button"
            type="button"
            onClick={() => setShowPreview((current) => !current)}
          >
            {showPreview ? "Hide Draft Preview" : "Preview Draft"}
          </button>
        </div>
      </form>

      <form action={publishHowToGuideAction} className="guide-template-publish">
        <input type="hidden" name="guideKey" value={guideKey} />
        <div className="form-alert" role="note">
          Publishing replaces the current organization-facing guide with the
          latest saved draft. Unsaved edits shown above are not published.
        </div>
        <button className="primary-button" type="submit">
          Publish Saved Draft
        </button>
      </form>

      {showPreview ? (
        <section className="guide-template-preview">
          <HowToGuideRenderer content={content} preview />
        </section>
      ) : null}
    </>
  );
}
