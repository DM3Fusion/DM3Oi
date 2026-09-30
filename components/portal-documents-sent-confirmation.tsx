"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  reportCustomerCaseDocumentsSentAction,
  type ReportCustomerCaseDocumentsSentResult,
} from "@/lib/data/customer-portal-actions";

type Props = {
  taskId: string;
  caseNumber: string;
  documents: string[];
  organizationName: string;
};

export function PortalDocumentsSentConfirmation({
  taskId,
  caseNumber,
  documents,
  organizationName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (pending) return;

    setPending(true);
    setError(null);

    const form = new FormData();
    form.set("taskId", taskId);

    let result: ReportCustomerCaseDocumentsSentResult;

    try {
      result = await reportCustomerCaseDocumentsSentAction(form);
    } catch {
      result = {
        ok: false,
        error: "The confirmation could not be recorded.",
      };
    }

    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="secondary-button portal-documents-sent-button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        I&apos;ve Sent the Documents
      </button>

      {open ? (
        <div
          className="portal-confirmation-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setOpen(false);
            }
          }}
        >
          <section
            className="portal-confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`documents-sent-title-${taskId}`}
          >
            <h3 id={`documents-sent-title-${taskId}`}>
              Confirm Documents Sent
            </h3>

            <p>
              Confirm that you submitted the requested{" "}
              {documents.length === 1 ? documents[0] : "documents"} using{" "}
              {organizationName}&apos;s secure document system.
            </p>

            <p className="portal-confirmation-privacy">
              DM3Oi does not receive or verify the uploaded documents.
            </p>

            <p className="portal-confirmation-case">
              {caseNumber}
            </p>

            {error ? (
              <p className="form-alert" role="alert">
                {error}
              </p>
            ) : null}

            <div className="portal-confirmation-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-button"
                disabled={pending}
                onClick={() => void confirm()}
              >
                {pending ? "Confirming…" : "Confirm Documents Sent"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
