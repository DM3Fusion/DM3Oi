"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export function PublicInfographicModal() {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="public-home-overview-button"
        onClick={() => setOpen(true)}
      >
        Download
      </button>

      {open ? (
        <div
          className="public-infographic-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-infographic-title"
        >
          <button
            type="button"
            className="public-infographic-backdrop"
            aria-label="Close DM3Oi Overview"
            onClick={() => setOpen(false)}
          />

          <section className="public-infographic-window">
            <header className="public-infographic-header">
              <h2 id="public-infographic-title">DM3Oi Overview</h2>

              <button
                ref={closeButtonRef}
                type="button"
                className="public-infographic-close"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </header>

            <div className="public-infographic-content">
              <Image
                src="/images/DM3Oi_InfoGraphic.webp"
                alt="DM3Oi Business Operations Intelligence overview"
                width={1030}
                height={1558}
                sizes="(max-width: 760px) calc(100vw - 32px), 900px"
                priority={false}
              />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
