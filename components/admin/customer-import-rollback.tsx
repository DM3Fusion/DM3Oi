"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  executeCustomerImportRollbackAction,
  previewCustomerImportRollbackAction,
  type CustomerImportRollbackPreview,
} from "@/app/admin/customer-import/rollback-actions";

function formatImportedAt(value: string | null) {
  if (!value) return "Unavailable";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export function CustomerImportRollback({
  submissionId,
  originalFilename,
  importedAt,
}: {
  submissionId: string;
  originalFilename: string;
  importedAt: string | null;
}) {
  const router = useRouter();
  const [preview, setPreview] =
    useState<CustomerImportRollbackPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const expectedConfirmation = preview
    ? `DELETE ${preview.eligible} IMPORTED CUSTOMERS`
    : "";

  const checkRollback = async () => {
    if (checking || deleting) return;

    setChecking(true);
    setError(null);
    setMessage(null);

    try {
      const result = await previewCustomerImportRollbackAction(submissionId);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setPreview(result.preview);
      setConfirmation("");
    } catch {
      setError("The Customer import rollback could not be previewed.");
    } finally {
      setChecking(false);
    }
  };

  const executeRollback = async () => {
    if (!preview || deleting || preview.eligible === 0) return;

    if (confirmation !== expectedConfirmation) {
      setError(`Type “${expectedConfirmation}” exactly to continue.`);
      return;
    }

    setDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const result = await executeCustomerImportRollbackAction(
        submissionId,
        confirmation,
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(
        `Rollback pass complete: ${result.result.deleted} deleted, ` +
          `${result.result.blocked} blocked, ${result.result.failed} failed, ` +
          `${result.result.alreadyMissing} already missing. Preview again to ` +
          "verify remaining imported Customers.",
      );
      setPreview(null);
      setConfirmation("");
      router.refresh();
    } catch {
      setError(
        "The rollback pass could not be completed. Preview again before retrying.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="customer-import-rollback" aria-labelledby={`rollback-${submissionId}`}>
      <div className="customer-import-rollback-heading">
        <div>
          <span className="step-kicker">SUPER_ADMIN maintenance</span>
          <h3 id={`rollback-${submissionId}`}>Rollback Imported Customers</h3>
        </div>
        {!preview ? (
          <button
            type="button"
            className="secondary-button"
            disabled={checking || deleting}
            onClick={() => void checkRollback()}
          >
            {checking ? "Checking…" : "Preview Rollback"}
          </button>
        ) : null}
      </div>

      <p>
        Rollback deletes only Customers originally created by this import.
        Existing Customers and rows held as duplicates are not deleted.
      </p>

      <dl className="customer-import-rollback-source">
        <div>
          <dt>Import file</dt>
          <dd>{originalFilename}</dd>
        </div>
        <div>
          <dt>Import completed</dt>
          <dd>{formatImportedAt(importedAt)}</dd>
        </div>
      </dl>

      {preview ? (
        <>
          <dl className="customer-import-rollback-summary">
            <div><dt>Created by this import</dt><dd>{preview.auditedCreated}</dd></div>
            <div><dt>Currently present</dt><dd>{preview.currentlyPresent}</dd></div>
            <div><dt>Already missing</dt><dd>{preview.alreadyMissing}</dd></div>
            <div><dt>Eligible</dt><dd>{preview.eligible}</dd></div>
            <div><dt>Blocked</dt><dd>{preview.blocked}</dd></div>
          </dl>

          {preview.blockerCategories.length ? (
            <div className="form-alert" role="alert">
              <strong>Protected dependencies were found.</strong>
              <ul>
                {preview.blockerCategories.map((blocker) => (
                  <li key={blocker.code}>
                    {blocker.label} ({blocker.customerCount} Customers;{" "}
                    {blocker.rowCount} relationships)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.eligible > 0 ? (
            <form
              className="customer-import-rollback-confirmation"
              onSubmit={(event) => {
                event.preventDefault();
                void executeRollback();
              }}
            >
              <p>
                This pass will delete up to{" "}
                {Math.min(preview.batchSize, preview.eligible)} of{" "}
                {preview.eligible} eligible imported Customers. Preview again
                after every pass to continue safely.
              </p>
              <label>
                <span>Type {expectedConfirmation} to confirm</span>
                <input
                  type="text"
                  name="rollbackConfirmation"
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.currentTarget.value);
                    setError(null);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <div className="customer-import-rollback-actions">
                <button
                  type="submit"
                  className="secondary-button danger-button"
                  disabled={
                    deleting || confirmation !== expectedConfirmation
                  }
                >
                  {deleting
                    ? "Deleting batch…"
                    : `Delete next ${Math.min(preview.batchSize, preview.eligible)}`}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={checking || deleting}
                  onClick={() => void checkRollback()}
                >
                  {checking ? "Rechecking…" : "Recheck Preview"}
                </button>
              </div>
            </form>
          ) : (
            <div className="success-alert">
              No currently eligible imported Customers remain to delete.
            </div>
          )}
        </>
      ) : null}

      {message ? <div className="success-alert">{message}</div> : null}
      {error ? <div className="form-alert" role="alert">{error}</div> : null}
    </section>
  );
}
