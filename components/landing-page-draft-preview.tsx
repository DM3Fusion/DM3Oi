"use client";

import { useEffect, useState } from "react";

import { PublicLandingPage } from "@/components/public-landing-page";
import type { PublicLandingPageContent } from "@/lib/public-landing-page";

export function LandingPageDraftPreview({
  content,
  deploymentVersion,
}: {
  content: PublicLandingPageContent;
  deploymentVersion: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="button secondary"
        onClick={() => setOpen(true)}
      >
        Preview Draft
      </button>

      {open && (
        <div
          className="landing-page-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="landing-page-preview-title"
        >
          <div
            className="landing-page-preview-backdrop"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />

          <section className="landing-page-preview-window">
            <header className="landing-page-preview-header">
              <div>
                <div className="landing-page-preview-heading-row">
                  <h2 id="landing-page-preview-title">
                    Landing Page Draft Preview
                  </h2>

                  <span className="landing-page-preview-status">
                    Not Published
                  </span>
                </div>

                <p>
                  Previewing the SUPER_ADMIN working draft.
                  Changes are not visible on the public DM3Oi site
                  until published.
                </p>
              </div>

              <button
                type="button"
                className="button secondary landing-page-preview-close"
                onClick={() => setOpen(false)}
                autoFocus
              >
                Close
              </button>
            </header>

            <div className="landing-page-preview-content">
              <PublicLandingPage
                content={content}
                deploymentVersion={deploymentVersion}
                preview
              />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
