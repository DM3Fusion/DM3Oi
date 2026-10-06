import { Badge } from "@/components/ui";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { CustomerImportReviewForm } from "@/components/admin/customer-import-review-form";
import { CustomerImportDeleteSourceForm } from "@/components/admin/customer-import-delete-source-form";
import { CustomerImportRollback } from "@/components/admin/customer-import-rollback";
import {
  downloadCustomerImportSourceAction,
} from "@/app/admin/customer-import/submission-actions";

type Submission = {
  id: string;
  organization_id: string;
  organizationName: string;
  uploadedBy: string;
  original_filename: string;
  file_size_bytes: number;
  status: string;
  file_disposition: string;
  organization_note: string | null;
  super_admin_note: string | null;
  correction_instructions: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewedBy: string | null;
  imported_at: string | null;
  source_file_deleted_at: string | null;
};

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

  return "Available / Retained";
}

const PLATFORM_ADMIN_TIMEZONE = "America/New_York";

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: PLATFORM_ADMIN_TIMEZONE,
  }).format(new Date(value));
}

export function CustomerImportSubmissionQueue({
  submissions,
}: {
  submissions: Submission[];
}) {
  return (
    <section className="panel customer-import-submission-queue">
      <div className="section-head">
        <div>
          <span className="step-kicker">Organization submissions</span>
          <h2>Submitted Customer Files</h2>
          <p>
            Download source Excel or CSV files, prepare the data outside DM3Oi,
            then use the Customer Import workspace below with the finished CSV.
          </p>
        </div>
      </div>

      {submissions.length ? (
        <div className="customer-import-submission-list">
          {submissions.map((submission) => (
            <details
              className="customer-import-submission"
              key={submission.id}
            >
              <summary className="customer-import-submission-summary">
                <div className="customer-import-summary-identity">
                  <strong>{submission.organizationName}</strong>
                  <span>{submission.original_filename}</span>
                </div>

                <div className="customer-import-summary-meta">
                  <span>
                    <small>Submitted</small>
                    {formatDate(submission.created_at)}
                  </span>
                  <span>
                    <small>Size</small>
                    {formatBytes(submission.file_size_bytes)}
                  </span>
                  <span>
                    <small>Source</small>
                    {fileDispositionLabel(submission.file_disposition)}
                  </span>
                </div>

                <Badge value={submission.status} />
                <span
                  className="customer-import-summary-chevron"
                  aria-hidden="true"
                >
                  ›
                </span>
              </summary>

              <div className="customer-import-submission-body">
                <dl className="customer-import-submission-meta">
                  <div>
                    <dt>Submitted by</dt>
                    <dd>{submission.uploadedBy}</dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>{formatDate(submission.created_at)}</dd>
                  </div>
                  <div>
                    <dt>File size</dt>
                    <dd>{formatBytes(submission.file_size_bytes)}</dd>
                  </div>
                  <div>
                    <dt>Source file</dt>
                    <dd>
                      {submission.source_file_deleted_at
                        ? `${fileDispositionLabel(
                            submission.file_disposition,
                          )} · ${formatDate(
                            submission.source_file_deleted_at,
                          )}`
                        : fileDispositionLabel(
                            submission.file_disposition,
                          )}
                    </dd>
                  </div>
                </dl>

                {submission.organization_note ? (
                  <div className="customer-import-submission-note">
                    <strong>Organization note</strong>
                    <p>{submission.organization_note}</p>
                  </div>
                ) : null}

                {!submission.source_file_deleted_at ? (
                  <form action={downloadCustomerImportSourceAction}>
                    <input
                      type="hidden"
                      name="submissionId"
                      value={submission.id}
                    />
                    <PendingSubmitButton
                      className="secondary-button"
                      pendingLabel="Preparing download…"
                    >
                      Download Source File
                    </PendingSubmitButton>
                  </form>
                ) : null}

                {submission.status !== "IMPORTED" ? (
                  <CustomerImportReviewForm
                    submissionId={submission.id}
                    initialStatus={submission.status}
                    initialFileDisposition={submission.file_disposition}
                    initialSuperAdminNote={submission.super_admin_note ?? ""}
                    initialCorrectionInstructions={
                      submission.correction_instructions ?? ""
                    }
                  />
                ) : (
                  <p className="muted">
                    Imported {formatDate(submission.imported_at)}
                  </p>
                )}

                {submission.status === "IMPORTED" ? (
                  <CustomerImportRollback
                    submissionId={submission.id}
                    originalFilename={submission.original_filename}
                    importedAt={submission.imported_at}
                  />
                ) : null}

                {!submission.source_file_deleted_at ? (
                  <CustomerImportDeleteSourceForm
                    submissionId={submission.id}
                    fileName={submission.original_filename}
                    fileDisposition={submission.file_disposition}
                  />
                ) : null}

                {submission.reviewed_at ? (
                  <p className="muted customer-import-reviewed">
                    Last reviewed {formatDate(submission.reviewed_at)}
                    {" by platform administrator"}
                  </p>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="empty compact-empty">
          <h2>No submitted Customer files</h2>
          <p>
            Owner/Admin Customer onboarding submissions will appear here.
          </p>
        </div>
      )}
    </section>
  );
}
