"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updateCustomerImportSubmissionAction } from "@/app/admin/customer-import/submission-actions";

type ReviewValues = {
  status: string;
  fileDisposition: string;
  superAdminNote: string;
  correctionInstructions: string;
};

export function CustomerImportReviewForm({
  submissionId,
  initialStatus,
  initialFileDisposition,
  initialSuperAdminNote,
  initialCorrectionInstructions,
}: {
  submissionId: string;
  initialStatus: string;
  initialFileDisposition: string;
  initialSuperAdminNote: string;
  initialCorrectionInstructions: string;
}) {
  const router = useRouter();

  const initial: ReviewValues = {
    status: initialStatus,
    fileDisposition: initialFileDisposition,
    superAdminNote: initialSuperAdminNote,
    correctionInstructions: initialCorrectionInstructions,
  };

  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    values.status !== saved.status ||
    values.fileDisposition !== saved.fileDisposition ||
    values.superAdminNote !== saved.superAdminNote ||
    values.correctionInstructions !== saved.correctionInstructions;

  const update = (change: Partial<ReviewValues>) => {
    setValues((current) => ({ ...current, ...change }));
    setJustSaved(false);
    setError(null);
  };

  return (
    <form
      className="customer-import-review-form"
      onSubmit={async (event) => {
        event.preventDefault();

        setPending(true);
        setJustSaved(false);
        setError(null);

        try {
          const result = await updateCustomerImportSubmissionAction(
            new FormData(event.currentTarget),
          );

          if (!result.ok) {
            setError(result.error);
            return;
          }

          setSaved(values);
          setJustSaved(true);
          router.refresh();
        } catch (caught) {
          console.error("Customer import review action threw", caught);
          setError("The Customer data submission could not be updated.");
        } finally {
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="submissionId" value={submissionId} />

      <div className="customer-import-review-top-row">
        <label className="customer-import-review-status">
          <span>Review status</span>
          <select
            name="status"
            value={values.status}
            onChange={(event) => update({ status: event.currentTarget.value })}
          >
            <option value="UPLOADED">Uploaded</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="NEEDS_CORRECTION">Needs Correction</option>
            <option value="READY_TO_IMPORT">Ready to Import</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>

        <label className="customer-import-file-disposition">
          <span>File disposition</span>
          <select
            name="fileDisposition"
            value={values.fileDisposition}
            onChange={(event) =>
              update({ fileDisposition: event.currentTarget.value })
            }
          >
            <option value="RETAINED">Available / Retained</option>
            <option value="DELETED_WITHOUT_PROCESSING">
              Deleted without Processing
            </option>
            <option value="DELETED_AFTER_PROCESSING">
              Deleted after Processing
            </option>
          </select>
        </label>

        <button
          type="submit"
          className={
            dirty
              ? "customer-import-save-review review-unsaved"
              : justSaved
                ? "customer-import-save-review review-saved"
                : "secondary-button customer-import-save-review"
          }
          disabled={pending || !dirty}
          aria-busy={pending}
        >
          {pending
            ? "Saving…"
            : justSaved
              ? "Review Saved"
              : "Save Review"}
        </button>
      </div>

      <div className="customer-import-review-notes-row">
        <label>
          <span>Platform administrator note</span>
          <textarea
            name="superAdminNote"
            rows={3}
            maxLength={4000}
            value={values.superAdminNote}
            onChange={(event) =>
              update({ superAdminNote: event.currentTarget.value })
            }
            placeholder="Internal preparation, mapping, or review notes."
          />
        </label>

        <label className="customer-import-correction-field">
          <span>
            Correction instructions
            <small> Required for Needs Correction</small>
          </span>
          <textarea
            name="correctionInstructions"
            rows={3}
            maxLength={4000}
            value={values.correctionInstructions}
            onChange={(event) =>
              update({ correctionInstructions: event.currentTarget.value })
            }
            placeholder="Organization-visible instructions describing what must be corrected."
          />
          <small>
            Visible to the organization Owner/Admin only when the submission
            status is Needs Correction.
          </small>
        </label>
      </div>

      {error ? (
        <div className="form-alert customer-import-review-error" role="alert">
          {error}
        </div>
      ) : null}
    </form>
  );
}
