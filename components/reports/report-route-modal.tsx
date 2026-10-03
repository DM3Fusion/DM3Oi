"use client";

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApplicationIcon } from "@/components/application-icon";

export function ReportRouteModal({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const close = () => router.back();
  const closeFromBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) close();
  };

  return (
    <dialog
      ref={dialog}
      className="customer-route-modal business-reach-unmapped-modal"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={closeFromBackdrop}
    >
      <div className="customer-route-modal-frame">
        <header className="customer-route-modal-header">
          <div>
            <p className="eyebrow">Business Reach</p>
            <h1 id={titleId}>{title}</h1>
            <p id={descriptionId}>{description}</p>
          </div>
          <div className="customer-route-modal-actions">
            <button
              type="button"
              className="rule-dialog-close"
              aria-label="Close unmapped customer locations"
              onClick={close}
              autoFocus
            >
              <ApplicationIcon name="close" />
            </button>
          </div>
        </header>
        <div className="customer-route-modal-body">{children}</div>
      </div>
    </dialog>
  );
}
