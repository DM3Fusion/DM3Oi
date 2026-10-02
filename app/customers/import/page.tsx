import Link from "next/link";
import { notFound } from "next/navigation";

import { submitCustomerDataAction } from "@/app/customers/import/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Badge, PageHeader } from "@/components/ui";
import {
  canSubmitCustomerData,
  getCustomerImportSubmissions,
} from "@/lib/data/customer-import-submissions";
import { getAccessContext } from "@/lib/auth/context";

export const metadata = { title: "Submit Customer Data" };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const access = await getAccessContext();

  if (
    !access?.activeOrganization ||
    !access.internalAccess ||
    !canSubmitCustomerData(
      access as Parameters<typeof canSubmitCustomerData>[0],
    )
  ) {
    notFound();
  }

  const [{ submissions }, query] = await Promise.all([
    getCustomerImportSubmissions(),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Relationships"
        title="Submit Customer Data"
        description="Securely submit Excel or CSV Customer data for system administrator preparation and import."
        action={
          <Link className="secondary-button" href="/customers">
            Back to Customers
          </Link>
        }
      />

      {query.message ? (
        <div className="success-alert page-notice">{query.message}</div>
      ) : null}

      {query.error ? (
        <div className="form-alert page-notice" role="alert">
          {query.error}
        </div>
      ) : null}

      <section className="panel customer-data-step">
        <div className="customer-data-guidance">
          <strong>Please include the following information for each Customer whenever available:</strong>
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

        <form
          action={submitCustomerDataAction}
          className="entity-form customer-data-submit-form"
        >
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

          <textarea
            name="organizationNote"
            rows={4}
            maxLength={2000}
            aria-label="Optional note for the system administrator"
            placeholder="Optional context about the source file, purchased list, column meanings, or data history."
          />

          <div className="form-actions">
            <PendingSubmitButton
              className="primary-button"
              pendingLabel="Submitting…"
            >
              Submit Customer Data
            </PendingSubmitButton>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Submission History</h2>
          </div>
        </div>

        {submissions.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>File</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>Source File</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission.id}>
                    <td>
                      {new Intl.DateTimeFormat("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(submission.created_at))}
                    </td>
                    <td>
                      <strong>{submission.original_filename}</strong>
                    </td>
                    <td>{formatBytes(submission.file_size_bytes)}</td>
                    <td>
                      <Badge value={submission.status} />
                    </td>
                    <td>{submission.organization_note || "—"}</td>
                    <td>
                      {submission.source_file_deleted_at
                        ? "Removed after processing"
                        : "Retained for review"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty compact-empty">
            <h2>No Customer data submissions yet</h2>
          </div>
        )}
      </section>
    </>
  );
}
