"use client";

import { useRef } from "react";

import { submitCustomerDataAction } from "@/app/customers/import/actions";
import { ApplicationIcon } from "@/components/application-icon";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function CustomerDataSubmitModal() {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="primary-button"
        onClick={() => dialog.current?.showModal()}
      >
        Submit Customer Data
      </button>

      <dialog
        ref={dialog}
        className="task-modal customer-data-modal"
        aria-labelledby="customer-data-modal-title"
        onCancel={(event) => {
          event.preventDefault();
          dialog.current?.close();
        }}
      >
        <form
          action={submitCustomerDataAction}
          className="task-modal-form customer-data-modal-form"
        >
          <header>
            <div>
              <p className="eyebrow">Customer Data</p>
              <h2 id="customer-data-modal-title">
                Submit Customer Data
              </h2>
              <p>
                Upload an Excel or CSV file for the platform administrator to
                import. Imported data files are not retained.
              </p>
            </div>

            <button
              type="button"
              className="rule-dialog-close"
              aria-label="Close Submit Customer Data modal"
              onClick={() => dialog.current?.close()}
            >
              <ApplicationIcon name="close" />
            </button>
          </header>

          <div className="customer-data-modal-guidance">
            <strong>
              Please include the following information for each Customer:
            </strong>

            <ul>
              <li>Name</li>
              <li>Street Address</li>
              <li>City</li>
              <li>State</li>
              <li>ZIP Code</li>
              <li>Email</li>
              <li>Phone Number</li>
            </ul>
          </div>

          <label>
            <span>Excel or CSV file</span>
            <input
              type="file"
              name="sourceFile"
              accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
            />
            <small>CSV, XLS, or XLSX · maximum 10 MB</small>
          </label>

          <label>
            <span>
              Context <small>Optional</small>
            </span>
            <textarea
              name="organizationNote"
              rows={4}
              maxLength={2000}
              placeholder="Source file, purchased list, column meanings, or data history."
            />
          </label>

          <footer>
            <button
              type="button"
              className="secondary-button"
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>

            <PendingSubmitButton
              className="primary-button"
              pendingLabel="Submitting…"
            >
              Submit Customer Data
            </PendingSubmitButton>
          </footer>
        </form>
      </dialog>
    </>
  );
}
