"use client";

import { useState } from "react";
import { executeCustomerImportAction, previewCustomerImportAction } from "@/app/admin/customer-import/actions";
import type { ImportPreview } from "@/lib/customer-data-management";

type Organization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  customerCount: number;
};

type Submission = {
  id: string;
  organization_id: string;
  original_filename: string;
  status: string;
  created_at: string;
  submissionOrigin?: string;
};

type ImportResult = {
  created?: number;
  skipped_exact?: number;
  held_duplicates?: number;
  invalid?: number;
  outcomes?: Array<{
    row_number: number;
    classification: string;
    customer_number?: string;
    reason: string;
  }>;
};

export function CustomerImportWorkspace({
  organizations,
  submissions,
}: {
  organizations: Organization[];
  submissions: Submission[];
}) {
  const [organizationId, setOrganizationId] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const selected = organizations.find(
    (organization) => organization.id === organizationId,
  );

  const readySubmissions = submissions.filter(
    (submission) =>
      submission.organization_id === organizationId &&
      submission.status === "READY_TO_IMPORT" &&
      submission.submissionOrigin !== "ADMINISTRATIVE",
  );

  const selectedSubmission = readySubmissions.find(
    (submission) => submission.id === submissionId,
  );
  const stepTwoAvailable = Boolean(organizationId && selectedSubmission);

  const resetImportState = () => {
    setCsv("");
    setFileName("");
    setPreview(null);
    setResult(null);
    setPreviewError(null);
    setImportError(null);
  };

  const expected =
    selected && preview
      ? `IMPORT ${preview.summary.validNew} CUSTOMERS INTO ${selected.name}`
      : "";

  const runPreview = async () => {
    if (!organizationId || !submissionId || !csv) {
      setPreviewError(
        "Select an organization, Ready-To-Import submission, and CSV file first.",
      );
      return;
    }

    setPending(true);
    setPreviewError(null);
    setImportError(null);
    setResult(null);

    try {
      const response = await previewCustomerImportAction({
        organizationId,
        csv,
      });

      if (!response.ok) {
        setPreview(null);
        setPreviewError(response.error);
        return;
      }

      setPreview(response.preview);
      setConfirmation("");
    } catch (error) {
      console.error("Customer import preview request failed", error);
      setPreview(null);
      setPreviewError(
        "The CSV preview request could not be completed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  };

  const execute = async () => {
    setPending(true);
    setImportError(null);

    try {
      const response = await executeCustomerImportAction({
        organizationId,
        submissionId,
        csv,
        confirmation,
      });

      if (!response.ok) {
        setImportError(response.error);
        return;
      }

      setResult(response.result as ImportResult);
      setPreview(null);
      setConfirmation("");
    } catch (error) {
      console.error("Customer import request failed", error);
      setImportError(
        "The Customer import request could not be completed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="customer-data-workspace">
      <section className="panel customer-data-step customer-import-step"><div className="section-head"><div><span className="step-kicker">Step 1</span><h2>Select Company</h2><p>The organization is rechecked by the database at import time.</p></div></div>
        <label>
          <span>Target organization</span>
          <select
            value={organizationId}
            onChange={(event) => {
              const nextOrganizationId = event.target.value;
              const nextReadySubmissions = submissions.filter(
                (submission) =>
                  submission.organization_id === nextOrganizationId &&
                  submission.status === "READY_TO_IMPORT",
              );
              setOrganizationId(nextOrganizationId);
              setSubmissionId(
                nextReadySubmissions.length === 1
                  ? nextReadySubmissions[0].id
                  : "",
              );
              resetImportState();
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
          <>
            <div className="customer-data-identity">
              <strong>{selected.name}</strong>
              <span>
                {selected.slug} · {selected.customerCount} current Customers
              </span>
            </div>

            <label>
              <span>Ready-To-Import submission</span>
              <select
                value={submissionId}
                onChange={(event) => {
                  setSubmissionId(event.target.value);
                  resetImportState();
                }}
              >
                <option value="">
                  {readySubmissions.length
                    ? "Select a submission"
                    : "No Ready-To-Import submissions"}
                </option>

                {readySubmissions.map((submission) => (
                  <option key={submission.id} value={submission.id}>
                    {submission.original_filename}
                  </option>
                ))}
              </select>
            </label>

            {selectedSubmission ? (
              <p className="muted">
                Processing submission:{" "}
                <strong>{selectedSubmission.original_filename}</strong>
              </p>
            ) : null}
          </>
        ) : null}
      </section>
      <section className={`panel customer-data-step customer-import-step${stepTwoAvailable ? "" : " customer-import-step-unavailable"}`}>
        <div className="section-head"><div><span className="step-kicker">Step 2</span><h2>Select CSV</h2><p>Required headers are validated exactly; all rows are normalized and classified before writes.</p></div></div>
        {!organizationId ? (
          <p className="customer-import-step-guidance">Select an organization in Step 1 to continue.</p>
        ) : readySubmissions.length === 0 ? (
          <p className="customer-import-step-guidance">No Ready-To-Import submissions are available for this organization. Review a Customer Data submission and mark it Ready To Import first.</p>
        ) : !selectedSubmission ? (
          <p className="customer-import-step-guidance">Select a Ready-To-Import submission in Step 1 before choosing the CSV.</p>
        ) : null}
        <input className="customer-import-file" type="file" accept=".csv,text/csv" disabled={!stepTwoAvailable || pending} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setFileName(file.name); setCsv(await file.text()); setPreview(null); setResult(null); setPreviewError(null); setImportError(null); }} />
        {fileName ? <p className="muted customer-import-file-name">Selected: <strong>{fileName}</strong></p> : null}
        <button className="secondary-button" type="button" disabled={!stepTwoAvailable || !csv || pending} onClick={runPreview}>{pending ? "Checking…" : "Validate and preview"}</button>
      </section>
      {previewError ? <div className="form-alert" role="alert">{previewError}</div> : null}
      {preview ? <>
        <section className="customer-import-summary" aria-label="Import summary">
          {[['Total rows', preview.summary.total], ['Safe new', preview.summary.validNew], ['Exact matches', preview.summary.exactMatches], ['Duplicate review', preview.summary.duplicateCandidates], ['Invalid', preview.summary.invalid]].map(([label, value]) => <div className="panel" key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </section>
        <section className="panel"><div className="section-head"><div><h2>Row outcomes</h2><p>Only rows marked New are eligible for import.</p></div></div><div className="table-scroll"><table><thead><tr><th>Row</th><th>Customer</th><th>Email / phone</th><th>Outcome</th><th>Reason</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.row_number}><td>{row.row_number}</td><td><strong>{row.name}</strong><small className="table-secondary">{row.street_address}, {row.city}, {row.state} {row.postal_code}</small></td><td>{row.email}<small className="table-secondary">{row.phone}</small></td><td><span className={`import-outcome ${row.classification.toLowerCase()}`}>{row.classification}</span></td><td>{row.reasons.join("; ")}{row.matchedCustomerNumbers.length ? <small className="table-secondary">Matches {row.matchedCustomerNumbers.join(", ")}</small> : null}</td></tr>)}</tbody></table></div></section>
        <section className="panel customer-data-step customer-import-step customer-import-confirm"><div className="section-head"><div><span className="step-kicker">Step 3</span><h2>Confirm Import</h2><p>The server will parse, validate, and classify the original CSV again. Changed matches are skipped safely.</p></div></div>{importError ? <div className="form-alert" role="alert">{importError}</div> : null}<p className="customer-import-confirm-instruction">Type <strong>{expected}</strong></p><input className="customer-import-confirm-input" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-label="Import confirmation" /><button className="primary-button" type="button" disabled={pending || confirmation !== expected || preview.summary.validNew === 0} onClick={execute}>{pending ? "Importing…" : `Import ${preview.summary.validNew} safe Customers`}</button></section>
      </> : null}
      {result ? <section className="panel customer-import-result"><div className="success-alert customer-import-success">Import transaction completed.</div><dl className="customer-import-result-summary"><div><dt>Created</dt><dd>{result.created ?? 0}</dd></div><div><dt>Skipped exact</dt><dd>{result.skipped_exact ?? 0}</dd></div><div><dt>Held for review</dt><dd>{result.held_duplicates ?? 0}</dd></div><div><dt>Invalid</dt><dd>{result.invalid ?? 0}</dd></div></dl>{result.outcomes?.length ? <div className="table-scroll"><table><thead><tr><th>Row</th><th>Outcome</th><th>Customer number</th><th>Reason</th></tr></thead><tbody>{result.outcomes.map((outcome) => <tr key={outcome.row_number}><td>{outcome.row_number}</td><td><span className={`import-outcome ${outcome.classification.toLowerCase()}`}>{outcome.classification}</span></td><td><strong className="customer-import-number">{outcome.customer_number ?? "—"}</strong></td><td>{outcome.reason}</td></tr>)}</tbody></table></div> : null}</section> : null}
    </div>
  );
}
