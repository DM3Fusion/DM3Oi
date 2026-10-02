import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, PageHeader } from "@/components/ui";
import { CustomerDataSubmitModal } from "@/components/customers/customer-data-submit-modal";
import { CustomerImportSuccessNotice } from "@/components/customers/customer-import-success-notice";
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

function fileDispositionLabel(value: string) {
  if (value === "DELETED_WITHOUT_PROCESSING") {
    return "Deleted without Processing";
  }

  if (value === "DELETED_AFTER_PROCESSING") {
    return "Deleted after Processing";
  }

  return "Retained for Review";
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

  const [{ submissions, timezone }, query] = await Promise.all([
    getCustomerImportSubmissions(),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Relationships"
        title="Submit Customer Data"
        description="Securely upload customer data using an Excel or CSV file for platform administrator to import. Imported data files are not retained."
        action={
          <div className="page-header-actions">
            <CustomerDataSubmitModal />
            <Link className="secondary-button" href="/customers">
              Back to Customers
            </Link>
          </div>
        }
      />

      {query.message ? (
        <CustomerImportSuccessNotice message={query.message} />
      ) : null}

      {query.error ? (
        <div className="form-alert page-notice" role="alert">
          {query.error}
        </div>
      ) : null}

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
                        timeZone: timezone,
                      }).format(new Date(submission.created_at))}
                    </td>
                    <td>
                      <strong>{submission.original_filename}</strong>
                    </td>
                    <td>{formatBytes(submission.file_size_bytes)}</td>
                    <td>
                      <div className="customer-import-org-status">
                        <Badge value={submission.status} />
                        {submission.status === "NEEDS_CORRECTION" &&
                        submission.correction_instructions ? (
                          <p className="customer-import-correction-instructions">
                            {submission.correction_instructions}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td>{submission.organization_note || "—"}</td>
                    <td>
                      {fileDispositionLabel(
                        submission.file_disposition,
                      )}
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
