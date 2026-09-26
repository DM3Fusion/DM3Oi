"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCustomerDeletionPreviewAction,
  permanentlyDeleteCustomerAction,
  type CustomerDeletionPreview,
} from "@/lib/data/customer-permanent-deletion-actions";

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
  const [error, setError] = useState<string | null>(null);

  const checkEligibility = async () => {
    if (checking || deleting) return;

    setChecking(true);
    setError(null);

    const result = await getCustomerDeletionPreviewAction(customerId);

    if (!result.ok) {
      setError(result.error);
      setChecking(false);
      return;
    }

    setPreview(result.preview);
    setChecking(false);
  };

  const deleteCustomer = async () => {
    if (!preview?.eligible || deleting) return;

    const confirmed = window.confirm(
      `Permanently delete Customer ${customerNumber} — "${customerName}"?\n\n` +
        "This action cannot be undone. Only the Customer record will be deleted.",
    );

    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    const result = await permanentlyDeleteCustomerAction(customerId);

    if (!result.ok) {
      setError(result.error);
      setDeleting(false);

      const refreshed = await getCustomerDeletionPreviewAction(customerId);
      if (refreshed.ok) setPreview(refreshed.preview);

      return;
    }

    router.push("/customers");
    router.refresh();
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

          <button
            type="button"
            className="danger-button"
            disabled={deleting}
            onClick={() => void deleteCustomer()}
          >
            {deleting ? "Deleting…" : "Delete Customer Permanently"}
          </button>
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
