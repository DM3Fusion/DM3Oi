"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
} from "react";

const mobilePanels = [
  {
    src: "/brand/dm3oi-workflow-panel-1C.png",
    alt: "DM3Oi workflow step 1: Capture field-ready surveys with photos",
  },
  {
    src: "/brand/dm3oi-workflow-panel-2C.png",
    alt: "DM3Oi workflow step 2: Review survey details and photos",
  },
  {
    src: "/brand/dm3oi-workflow-panel-3C.png",
    alt: "DM3Oi workflow step 3: Generate and deliver professional reports",
  },
] as const;

export function PublicWorkflowImage({
  src,
}: {
  src: string;
}) {
  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const [activePanel, setActivePanel] =
    useState(0);

  const [isMobile, setIsMobile] =
    useState(false);

  useEffect(() => {
    const media =
      window.matchMedia(
        "(max-width: 560px)",
      );

    const update = () =>
      setIsMobile(media.matches);

    update();

    media.addEventListener(
      "change",
      update,
    );

    return () =>
      media.removeEventListener(
        "change",
        update,
      );
  }, []);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    const reducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      );

    if (reducedMotion.matches) {
      return;
    }

    const interval =
      window.setInterval(() => {
        setActivePanel(
          (current) =>
            (current + 1) %
            mobilePanels.length,
        );
      }, 4000);

    return () =>
      window.clearInterval(interval);
  }, [isMobile]);

  function previousPanel() {
    setActivePanel(
      (current) =>
        (current - 1 + mobilePanels.length) %
        mobilePanels.length,
    );
  }

  function nextPanel() {
    setActivePanel(
      (current) =>
        (current + 1) %
        mobilePanels.length,
    );
  }

  function openDialog() {
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  const activeImage =
    isMobile
      ? mobilePanels[activePanel]
      : {
          src,
          alt: "DM3Oi Capture, Review, and Report workflow",
        };

  return (
    <>
      <div className="public-home-workflow-desktop">
        <button
          type="button"
          className="public-home-workflow-artwork-trigger"
          onClick={openDialog}
          aria-label="Enlarge DM3Oi workflow image"
        >
          <Image
            src={src}
            alt="DM3Oi Capture, Review, and Report workflow"
            width={1787}
            height={750}
            priority
            quality={86}
            sizes="(max-width: 1000px) calc(100vw - 2.5rem), 76rem"
            className="public-home-workflow-artwork-image"
          />
        </button>
      </div>

      <div
        className="public-home-workflow-carousel"
        aria-label="DM3Oi workflow"
        aria-roledescription="carousel"
      >
        <div className="public-home-workflow-carousel-stage">
          <div className="public-home-workflow-carousel-viewport">
            <div
              className="public-home-workflow-carousel-track"
              style={{
                transform: `translateX(-${activePanel * 100}%)`,
              }}
            >
              {mobilePanels.map((panel, index) => (
                <button
                  key={panel.src}
                  type="button"
                  className="public-home-workflow-carousel-image-button"
                  onClick={openDialog}
                  aria-label={`Enlarge ${panel.alt}`}
                  tabIndex={index === activePanel ? 0 : -1}
                  aria-hidden={index !== activePanel}
                >
                  <Image
                    src={panel.src}
                    alt={panel.alt}
                    width={576}
                    height={750}
                    priority={index === 0}
                    quality={90}
                    sizes="calc(100vw - 4rem)"
                    className="public-home-workflow-carousel-image"
                  />
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="public-home-workflow-carousel-arrow public-home-workflow-carousel-arrow-left"
            onClick={previousPanel}
            aria-label="Previous workflow step"
          >
            ‹
          </button>

          <button
            type="button"
            className="public-home-workflow-carousel-arrow public-home-workflow-carousel-arrow-right"
            onClick={nextPanel}
            aria-label="Next workflow step"
          >
            ›
          </button>
        </div>

        <div
          className="public-home-workflow-carousel-dots"
          aria-label={`Workflow step ${activePanel + 1} of ${mobilePanels.length}`}
        >
          {mobilePanels.map(
            (panel, index) => (
              <button
                key={panel.src}
                type="button"
                className={
                  index === activePanel
                    ? "is-active"
                    : undefined
                }
                onClick={() =>
                  setActivePanel(index)
                }
                aria-label={`Show workflow step ${index + 1}`}
                aria-current={
                  index === activePanel
                    ? "true"
                    : undefined
                }
              />
            ),
          )}
        </div>

        <button
          type="button"
          className="public-home-workflow-mobile-enlarge"
          onClick={openDialog}
        >
          Tap to enlarge
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="public-home-workflow-dialog"
        aria-label="DM3Oi workflow enlarged view"
        onClick={(event) => {
          if (
            event.target ===
            event.currentTarget
          ) {
            closeDialog();
          }
        }}
      >
        <div className="public-home-workflow-dialog-content">
          <button
            type="button"
            className="public-home-workflow-dialog-close"
            onClick={closeDialog}
            aria-label="Close enlarged workflow image"
          >
            ×
          </button>

          <Image
            src={activeImage.src}
            alt={`${activeImage.alt} enlarged`}
            width={
              isMobile
                ? 576
                : 1787
            }
            height={750}
            quality={100}
            sizes="96vw"
            className="public-home-workflow-dialog-image"
          />
        </div>
      </dialog>
    </>
  );
}
