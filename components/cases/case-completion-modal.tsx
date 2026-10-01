"use client";

import { useRef } from "react";
import { PendingSubmitButton } from "@/components/pending-submit-button";

type CompletionAction = (
  formData: FormData,
) => void | Promise<void>;

export function CaseCompletionModal({
  caseId,
  action,
}: {
  caseId: string;
  action: CompletionAction;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="primary-button case-completion-open"
        onClick={() => dialogRef.current?.showModal()}
      >
        Complete Case
      </button>

      <dialog
        ref={dialogRef}
        className="case-completion-dialog"
        aria-labelledby="case-completion-title"
      >
        <form action={action} className="case-completion-form">
          <input type="hidden" name="caseId" value={caseId} />

          <header>
            <div>
              <span className="eyebrow">Tax Preparation</span>
              <h2 id="case-completion-title">Tax Prep Outcome</h2>
              <p>
                Select the final tax preparation outcome. This result will be
                displayed in the Customer Portal.
              </p>
            </div>
          </header>

          <fieldset>
            <legend>Final outcome</legend>

            <label className="case-completion-option">
              <input
                type="radio"
                name="taxOutcome"
                value="REFUND"
                required
              />
              <span>
                <strong>Refund</strong>
                <small>
                  The completed return results in a refund to the customer.
                </small>
              </span>
            </label>

            <label className="case-completion-option">
              <input
                type="radio"
                name="taxOutcome"
                value="BALANCE_DUE"
                required
              />
              <span>
                <strong>Balance Due</strong>
                <small>
                  The completed return results in an amount the customer must
                  pay.
                </small>
              </span>
            </label>

            <label className="case-completion-option">
              <input
                type="radio"
                name="taxOutcome"
                value="ZERO_BALANCE"
                required
              />
              <span>
                <strong>No Refund / No Balance Due</strong>
                <small>
                  The completed return has neither a refund nor a balance due.
                </small>
              </span>
            </label>
          </fieldset>

          <div className="case-completion-warning">
            Completing this Case records the date, time, and Staff user who
            completed it. The Case will become read-only.
          </div>

          <footer>
            <button
              type="button"
              className="secondary-button"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>

            <PendingSubmitButton pendingLabel="Completing…">
              Complete Case
            </PendingSubmitButton>
          </footer>
        </form>
      </dialog>
    </>
  );
}
