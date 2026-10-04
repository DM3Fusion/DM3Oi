import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { GuideFigure } from "./guide-figures";
import { HowToGuideTextRenderer } from "./rich-text";

import type {
  HowToGuideCalloutType,
  HowToGuideContent,
  HowToGuideSection,
} from "@/lib/how-to-guide-content";

const calloutLabels: Record<HowToGuideCalloutType, string> = {
  TIP: "Tip",
  IMPORTANT: "Important",
  OWNER_ADMIN: "Owner/Admin",
  STAFF_BOUNDARY: "Staff boundary",
};

function SectionText({
  section,
}: {
  section: HowToGuideSection;
}) {
  if (section.key === "common-workflows") {
    return (
      <div className="guide-workflow-grid">
        {section.steps.map((step) => (
          <article key={step.title}>
            <h3>{step.title}</h3>
            <p>
              <HowToGuideTextRenderer value={step.body} />
            </p>
          </article>
        ))}
      </div>
    );
  }

  return (
    <>
      {section.paragraphs.map((paragraph, index) => (
        <p key={`${section.key}-p-${index}`}>
          <HowToGuideTextRenderer value={paragraph} />
        </p>
      ))}

      {section.steps.length ? (
        <ol className="guide-steps">
          {section.steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              {step.body ? (
                <>
                  {" "}
                  <HowToGuideTextRenderer value={step.body} />
                </>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {section.callout ? (
        <aside className="guide-callout">
          <strong>
            {calloutLabels[section.callout.type]}
          </strong>
          <p>
            <HowToGuideTextRenderer
              value={section.callout.text}
            />
          </p>
        </aside>
      ) : null}
    </>
  );
}

export function HowToGuideRenderer({
  content,
  showFinishLink = false,
  preview = false,
}: {
  content: HowToGuideContent;
  showFinishLink?: boolean;
  preview?: boolean;
}) {
  const sections = content.sections.filter(
    (section) => section.enabled,
  );

  return (
    <div className="how-to-guide" id="guide-top">
      <PageHeader
        eyebrow="Help"
        title={content.title}
        description={content.intro}
      />

      {preview ? (
        <div
          className="guide-preview-label"
          role="status"
        >
          Draft Preview
        </div>
      ) : null}

      <nav
        className="panel guide-toc"
        aria-label="How to Guide sections"
      >
        <strong>On this page</strong>
        <ol>
          {sections.map((section, index) => (
            <li key={section.key}>
              <a href={`#${section.key}`}>
                <span>{index + 1}</span>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="guide-section-list">
        {sections.map((section, index) => (
          <section
            className="panel guide-section"
            id={section.key}
            key={section.key}
          >
            <div className="guide-section-heading">
              <span aria-hidden="true">{index + 1}</span>
              <h2>{section.title}</h2>
            </div>

            {section.figure_key &&
            section.figure_caption ? (
              <div className="guide-with-figure">
                <div>
                  <SectionText section={section} />
                </div>

                <GuideFigure
                  figureKey={section.figure_key}
                  caption={
                    <HowToGuideTextRenderer
                      value={section.figure_caption}
                    />
                  }
                />
              </div>
            ) : (
              <SectionText section={section} />
            )}

            <a
              className="guide-back-to-top"
              href="#guide-top"
            >
              Back to top
            </a>
          </section>
        ))}
      </div>

      {showFinishLink ? (
        <p className="guide-finish">
          Ready to work?{" "}
          <Link href="/">Return to Dashboard</Link>
        </p>
      ) : null}
    </div>
  );
}
