import Link from "next/link";

import { LegalReviewScroll } from "@/components/legal-review-scroll";
import type { LegalDocumentDefinition } from "@/lib/legal-documents";

type LegalReviewPresentation = {
  returnHref: string;
  previousDocument: LegalDocumentDefinition | null;
};

function sameParagraphs(
  left: readonly string[],
  right: readonly string[],
) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function reviewState(
  current: LegalDocumentDefinition,
  previous: LegalDocumentDefinition | null,
) {
  if (!previous) {
    return {
      firstChangedId: null,
      changedIntroduction: false,
      changedSections: new Set<number>(),
    };
  }

  const changedIntroduction = !sameParagraphs(
    current.introduction,
    previous.introduction,
  );

  const changedSections = new Set<number>();
  const count = Math.max(
    current.sections.length,
    previous.sections.length,
  );

  for (let index = 0; index < count; index += 1) {
    const currentSection = current.sections[index];
    const previousSection = previous.sections[index];

    if (
      !currentSection ||
      !previousSection ||
      currentSection.heading !== previousSection.heading ||
      !sameParagraphs(
        currentSection.paragraphs,
        previousSection.paragraphs,
      )
    ) {
      changedSections.add(index);
    }
  }

  let firstChangedId: string | null = null;

  if (changedIntroduction) {
    firstChangedId = "legal-review-introduction";
  } else {
    const firstChangedSection = [...changedSections]
      .filter((index) => index < current.sections.length)
      .sort((a, b) => a - b)[0];

    if (firstChangedSection !== undefined) {
      firstChangedId = `legal-review-section-${firstChangedSection}`;
    }
  }

  return {
    firstChangedId,
    changedIntroduction,
    changedSections,
  };
}

export function LegalDocumentPage({
  document,
  preview = false,
  review = null,
}: {
  document: LegalDocumentDefinition;
  preview?: boolean;
  review?: LegalReviewPresentation | null;
}) {
  const {
    firstChangedId,
    changedIntroduction,
    changedSections,
  } = reviewState(
    document,
    review?.previousDocument ?? null,
  );

  const renderedDocument = (
    <article className="legal-document">
      {review ? (
        <>
          <div className="legal-review-return">
            <Link
              href={review.returnHref}
              className="primary-button"
            >
              Return to Organization Acceptance
            </Link>
          </div>
          <LegalReviewScroll targetId={firstChangedId} />
        </>
      ) : null}

      <header className="legal-document-header">
        <Link href="/" className="legal-document-brand">
          <strong>DM3Oi™</strong>
          <span>Operational Intelligence</span>
        </Link>

        <p className="eyebrow">Legal</p>
        <h1>{document.title}</h1>

        <p className="legal-document-version">
          Version {document.version}
          {" · "}
          Effective {document.effectiveDate}
        </p>
      </header>

      <div className="legal-document-body">
        <div
          id={
            changedIntroduction
              ? "legal-review-introduction"
              : undefined
          }
          className={
            changedIntroduction
              ? "legal-review-updated"
              : undefined
          }
        >
          {changedIntroduction ? (
            <span className="legal-review-updated-label">
              Updated
            </span>
          ) : null}

          {document.introduction.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        {document.sections.map((section, index) => {
          const changed = changedSections.has(index);

          return (
            <section
              key={section.heading}
              id={
                changed
                  ? `legal-review-section-${index}`
                  : undefined
              }
              className={
                changed ? "legal-review-updated" : undefined
              }
            >
              <h2>
                {section.heading}
                {changed ? (
                  <span className="legal-review-updated-label">
                    Updated
                  </span>
                ) : null}
              </h2>

              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          );
        })}
      </div>

      <footer className="legal-document-footer">
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/login">DM3Oi Sign In</Link>
      </footer>
    </article>
  );

  return preview ? renderedDocument : (
    <main className="legal-page">{renderedDocument}</main>
  );
}
