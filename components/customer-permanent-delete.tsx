"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCustomerDeletionPreviewAction,
  permanentlyDeleteCustomerAction,
  type CustomerDeletionPreview,
} from "@/lib/data/customer-permanent-deletion-actions";

const eligibilityRequestError =
  "Customer dependency checks could not be completed. Refresh the page and try again.";
const expectedConfirmation = "DELETE";

export function CustomerPermanentDelete({
  customerId,
  customerName,
  customerNumber,
}: {
  customerId: string;
  customerName: string;
  customerNumber: string;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<CustomerDeletionPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const checkEligibility = async () => {
    if (checking || deleting) return;

    setChecking(true);
    setError(null);

    try {
      const result = await getCustomerDeletionPreviewAction(customerId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setPreview(result.preview);
    } catch {
      setError(eligibilityRequestError);
    } finally {
      setChecking(false);
    }
  };

  const deleteCustomer = async () => {
    if (!preview?.eligible || deleting) return;

    if (confirmation !== expectedConfirmation) {
      setError("Type DELETE exactly to confirm permanent Customer deletion.");
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const result = await permanentlyDeleteCustomerAction(
        customerId,
        confirmation,
      );

      if (!result.ok) {
        setError(result.error);

        try {
          const refreshed = await getCustomerDeletionPreviewAction(customerId);
          if (refreshed.ok) setPreview(refreshed.preview);
        } catch {
          // Preserve the deletion error; a fresh page load can re-run preflight.
        }

        return;
      }

      router.push("/customers");
      router.refresh();
    } catch {
      setError(
        "The Customer could not be permanently deleted. Refresh the page and recheck dependencies before trying again.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="panel detail-section customer-danger-zone">
      <div className="section-head">
        <div>
          <h2>Permanent Customer Deletion</h2>
          <p>
            SUPER_ADMIN maintenance for disposable or test Customer records.
          </p>
        </div>
      </div>

      {!preview ? (
        <>
          <p className="muted">
            DM3Oi will check for Cases, Service Desk history, Portal Access,
            and saved Guided Intake drafts before allowing deletion.
          </p>

          <button
            type="button"
            className="danger-button"
            disabled={checking}
            onClick={() => void checkEligibility()}
          >
            {checking ? "Checking…" : "Check Delete Eligibility"}
          </button>
        </>
      ) : preview.eligible ? (
        <>
          <div className="success-alert">
            No protected Customer dependencies were found. This Customer is
            eligible for permanent deletion.
          </div>

          <form
            className="customer-delete-confirmation"
            onSubmit={(event) => {
              event.preventDefault();
              void deleteCustomer();
            }}
          >
            <p>
              Permanently deleting Customer {customerNumber} — “{customerName}”
              cannot be undone.
            </p>

            <label>
              <span>Type DELETE to confirm</span>
              <input
                type="text"
                name="confirmation"
                value={confirmation}
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  setError(null);
                }}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="customer-delete-confirmation-warning"
              />
            </label>

            <small id="customer-delete-confirmation-warning">
              The confirmation is case-sensitive and must match exactly.
            </small>

            <button
              type="submit"
              className="secondary-button danger-button"
              disabled={deleting || confirmation !== expectedConfirmation}
            >
              {deleting ? "Deleting…" : "Delete Customer Permanently"}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="form-alert" role="alert">
            <strong>This Customer cannot be permanently deleted.</strong>
          </div>

          <ul className="customer-delete-blockers">
            {preview.blockers.map((blocker) => (
              <li key={blocker.code}>
                {blocker.label}
                {blocker.count > 0 ? ` (${blocker.count})` : ""}
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="secondary-button"
            disabled={checking}
            onClick={() => void checkEligibility()}
          >
            {checking ? "Rechecking…" : "Recheck Dependencies"}
          </button>
        </>
      )}

      {error ? (
        <div className="form-alert customer-delete-error" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
