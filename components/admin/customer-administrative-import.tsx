"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  executeAdministrativeCustomerImportAction,
  previewCustomerImportAction,
} from "@/app/admin/customer-import/actions";
import type { ImportPreview } from "@/lib/customer-data-management";

type Organization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  customerCount: number;
};

type ImportResult = {
  created?: number;
  skipped_exact?: number;
  held_duplicates?: number;
  invalid?: number;
};

export function CustomerAdministrativeImport({
  organizations,
}: {
  organizations: Organization[];
}) {
  const router = useRouter();

  const [organizationId, setOrganizationId] = useState("");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selected = organizations.find(
    (organization) => organization.id === organizationId,
  );

  const expected =
    selected && preview
      ? `IMPORT ${preview.summary.validNew} CUSTOMERS INTO ${selected.name}`
      : "";

  async function runPreview() {
    if (!organizationId || !csv) {
      setError("Select an organization and canonical CSV file first.");
      return;
    }

    setPending(true);
    setError(null);
    setResult(null);

    try {
      const response = await previewCustomerImportAction({
        organizationId,
        csv,
      });

      if (!response.ok) {
        setPreview(null);
        setError(response.error);
        return;
      }

      setPreview(response.preview);
      setConfirmation("");
    } finally {
      setPending(false);
    }
  }

  async function execute() {
    if (!selected || !preview) return;

    setPending(true);
    setError(null);

    try {
      const response =
        await executeAdministrativeCustomerImportAction({
          organizationId,
          csv,
          fileName,
          confirmation,
        });

      if (!response.ok) {
        setError(response.error);
        return;
      }

      setResult(response.result as ImportResult);
      setPreview(null);
      setConfirmation("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="customer-data-workspace">
      <section className="panel customer-data-step customer-import-step">
        <div className="section-head">
          <div>
            <span className="step-kicker">SUPER_ADMIN</span>
            <h2>Administrative Import</h2>
            <p>
              Import a canonical DM3Oi CSV directly for setup, seed,
              demonstration, or other controlled administrative work.
              Organization users do not see this administrative submission.
            </p>
          </div>
        </div>

        <label>
          <span>Target organization</span>
          <select
            value={organizationId}
            onChange={(event) => {
              setOrganizationId(event.target.value);
              setCsv("");
              setFileName("");
              setPreview(null);
              setResult(null);
              setConfirmation("");
              setError(null);
            }}
          >
            <option value="">Select an organization</option>
            {organizations.map((organization) => (
              <option
                key={organization.id}
                value={organization.id}
                disabled={organization.status !== "ACTIVE"}
              >
                {organization.name} ({organization.status})
              </option>
            ))}
          </select>
        </label>

        {selected ? (
          <div className="customer-data-identity">
            <strong>{selected.name}</strong>
            <span>
              {selected.slug} · {selected.customerCount} current Customers
            </span>
          </div>
        ) : null}

        <input
          className="customer-import-file"
          type="file"
          accept=".csv,text/csv"
          disabled={!organizationId || pending}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;

            setFileName(file.name);
            setCsv(await file.text());
            setPreview(null);
            setResult(null);
            setConfirmation("");
            setError(null);
          }}
        />

        {fileName ? (
          <p className="muted">
            Selected: <strong>{fileName}</strong>
          </p>
        ) : null}

        <button
          type="button"
          className="secondary-button"
          disabled={!organizationId || !csv || pending}
          onClick={() => void runPreview()}
        >
          {pending ? "Checking…" : "Validate and preview"}
        </button>
      </section>

      {error ? (
        <div className="form-alert" role="alert">
          {error}
        </div>
      ) : null}

      {preview ? (
        <>
          <section
            className="customer-import-summary"
            aria-label="Administrative import summary"
          >
            {[
              ["Total rows", preview.summary.total],
              ["Safe new", preview.summary.validNew],
              ["Exact matches", preview.summary.exactMatches],
              ["Duplicate review", preview.summary.duplicateCandidates],
              ["Invalid", preview.summary.invalid],
            ].map(([label, value]) => (
              <div className="panel" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>

          <section className="panel customer-data-step customer-import-step">
            <div className="section-head">
              <div>
                <span className="step-kicker">Confirm</span>
                <h2>Administrative Import</h2>
                <p>
                  The canonical CSV will be staged privately and imported
                  through the same atomic Customer import transaction.
                </p>
              </div>
            </div>

            <p className="customer-import-confirm-instruction">
              Type <strong>{expected}</strong>
            </p>

            <input
              className="customer-import-confirm-input"
              value={confirmation}
              onChange={(event) =>
                setConfirmation(event.currentTarget.value)
              }
              aria-label="Administrative import confirmation"
            />

            <button
              type="button"
              className="primary-button"
              disabled={
                pending ||
                preview.summary.validNew === 0 ||
                confirmation !== expected
              }
              onClick={() => void execute()}
            >
              {pending
                ? "Importing…"
                : `Import ${preview.summary.validNew} safe Customers`}
            </button>
          </section>
        </>
      ) : null}

      {result ? (
        <section className="panel customer-import-result">
          <div className="success-alert customer-import-success">
            Administrative import transaction completed.
          </div>
          <dl className="customer-import-result-summary">
            <div>
              <dt>Created</dt>
              <dd>{result.created ?? 0}</dd>
            </div>
            <div>
              <dt>Skipped exact</dt>
              <dd>{result.skipped_exact ?? 0}</dd>
            </div>
            <div>
              <dt>Held for review</dt>
              <dd>{result.held_duplicates ?? 0}</dd>
            </div>
            <div>
              <dt>Invalid</dt>
              <dd>{result.invalid ?? 0}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
