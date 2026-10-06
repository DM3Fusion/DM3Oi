"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { deleteCustomerImportSourceAction } from "@/app/admin/customer-import/submission-actions";

const DELETE_DISPOSITIONS = new Set([
  "DELETED_WITHOUT_PROCESSING",
  "DELETED_AFTER_PROCESSING",
]);

export function CustomerImportDeleteSourceForm({
  submissionId,
  fileName,
  fileDisposition,
  submissionStatus,
}: {
  submissionId: string;
  fileName: string;
  fileDisposition: string;
  submissionStatus: string;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importedSubmission = submissionStatus === "IMPORTED";
  const dispositionAllowsDelete =
    importedSubmission || DELETE_DISPOSITIONS.has(fileDisposition);

  const armed =
    dispositionAllowsDelete &&
    confirmation === "DELETE FILE" &&
    !pending;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!armed) return;

    setPending(true);
    setError(null);

    try {
      const form = new FormData();
      form.set("submissionId", submissionId);
      form.set("confirmation", confirmation);

      const result = await deleteCustomerImportSourceAction(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setConfirmation("");
      router.refresh();
    } catch (caught) {
      console.error(
        "Customer import source deletion action threw",
        caught,
      );
      setError("The staged source file could not be deleted.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="customer-import-delete-source" onSubmit={submit}>
      <label>
        <span>Delete source file</span>
        <input
          name="confirmation"
          autoComplete="off"
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.currentTarget.value);
            setError(null);
          }}
          placeholder="Type DELETE FILE"
          aria-label={`Delete source file confirmation for ${fileName}`}
        />
      </label>

      <button
        type="submit"
        className={`danger-button${armed ? " is-armed" : ""}`}
        disabled={!armed}
        aria-busy={pending}
      >
        {pending ? "Deleting…" : "Delete Source File"}
      </button>

      <small
        className={
          dispositionAllowsDelete
            ? undefined
            : "customer-import-delete-help"
        }
      >
        {importedSubmission
          ? "Removes only the private uploaded source file. DM3Oi will record the file as Deleted after Processing. The submission audit record and imported Customers remain."
          : dispositionAllowsDelete
            ? "Removes only the private uploaded source file. The submission audit record and any imported Customers remain."
            : "Set File Disposition to a deleted state and save the review before deleting the source file."}
      </small>

      {error ? (
        <div
          className="form-alert customer-import-delete-error"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </form>
  );
}
