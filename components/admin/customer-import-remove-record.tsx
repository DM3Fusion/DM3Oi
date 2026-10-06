"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { removeCustomerImportRecordAction } from "@/app/admin/customer-import/history-actions";

export function CustomerImportRemoveRecord({
  submissionId,
}: {
  submissionId: string;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expected = "REMOVE IMPORT RECORD";
  const armed = confirmation === expected && !pending;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!armed) return;

    setPending(true);
    setError(null);

    try {
      const result = await removeCustomerImportRecordAction({
        submissionId,
        confirmation,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setConfirmation("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="customer-import-remove-record" onSubmit={submit}>
      <div>
        <strong>Remove Import Record</strong>
        <p className="muted">
          Available only after the source file is deleted and all Customers
          originally created by this import have already been removed.
        </p>
      </div>

      <input
        type="text"
        value={confirmation}
        onChange={(event) => {
          setConfirmation(event.currentTarget.value);
          setError(null);
        }}
        placeholder="Type REMOVE IMPORT RECORD"
        autoComplete="off"
      />

      <button
        type="submit"
        className={`danger-button${armed ? " is-armed" : ""}`}
        disabled={!armed}
      >
        {pending ? "Removing…" : "Remove Import Record"}
      </button>

      {error ? (
        <div className="form-alert" role="alert">
          {error}
        </div>
      ) : null}
    </form>
  );
}
