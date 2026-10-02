import { Badge } from "@/components/ui";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  deleteCustomerImportSourceAction,
  downloadCustomerImportSourceAction,
  updateCustomerImportSubmissionAction,
} from "@/app/admin/customer-import/submission-actions";

type Submission = {
  id: string;
  organization_id: string;
  organizationName: string;
  uploadedBy: string;
  original_filename: string;
  file_size_bytes: number;
  status: string;
  organization_note: string | null;
  super_admin_note: string | null;
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

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
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
            <article
              className="customer-import-submission"
              key={submission.id}
            >
              <header>
                <div>
                  <strong>{submission.organizationName}</strong>
                  <span>{submission.original_filename}</span>
                </div>
                <Badge value={submission.status} />
              </header>

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
                      ? `Deleted ${formatDate(
                          submission.source_file_deleted_at,
                        )}`
                      : "Available"}
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

              <form
                action={updateCustomerImportSubmissionAction}
                className="customer-import-review-form"
              >
                <input
                  type="hidden"
                  name="submissionId"
                  value={submission.id}
                />

                <label>
                  <span>Review status</span>
                  <select
                    name="status"
                    defaultValue={submission.status}
                    disabled={submission.status === "IMPORTED"}
                  >
                    <option value="UPLOADED">Uploaded</option>
                    <option value="UNDER_REVIEW">Under Review</option>
                    <option value="NEEDS_CORRECTION">
                      Needs Correction
                    </option>
                    <option value="READY_TO_IMPORT">
                      Ready to Import
                    </option>
                    <option value="REJECTED">Rejected</option>
                    {submission.status === "IMPORTED" ? (
                      <option value="IMPORTED">Imported</option>
                    ) : null}
                  </select>
                </label>

                <label>
                  <span>system administrator note</span>
                  <textarea
                    name="superAdminNote"
                    rows={3}
                    maxLength={4000}
                    defaultValue={submission.super_admin_note ?? ""}
                    disabled={submission.status === "IMPORTED"}
                    placeholder="Internal preparation, mapping, or review notes."
                  />
                </label>

                {submission.status !== "IMPORTED" ? (
                  <PendingSubmitButton
                    className="secondary-button"
                    pendingLabel="Saving…"
                  >
                    Save Review
                  </PendingSubmitButton>
                ) : (
                  <p className="muted">
                    Imported {formatDate(submission.imported_at)}
                  </p>
                )}
              </form>

              {!submission.source_file_deleted_at ? (
                <form
                  action={deleteCustomerImportSourceAction}
                  className="customer-import-delete-source"
                >
                  <input
                    type="hidden"
                    name="submissionId"
                    value={submission.id}
                  />

                  <label>
                    <span>Delete source file</span>
                    <input
                      name="confirmation"
                      autoComplete="off"
                      placeholder="Type DELETE FILE"
                      aria-label={`Delete source file confirmation for ${submission.original_filename}`}
                    />
                  </label>

                  <PendingSubmitButton
                    className="danger-button"
                    pendingLabel="Deleting…"
                  >
                    Delete Source File
                  </PendingSubmitButton>

                  <small>
                    Removes only the private uploaded source file. The
                    submission audit record and any imported Customers remain.
                  </small>
                </form>
              ) : null}

              {submission.reviewed_at ? (
                <p className="muted customer-import-reviewed">
                  Last reviewed {formatDate(submission.reviewed_at)}
                  {submission.reviewedBy
                    ? ` by ${submission.reviewedBy}`
                    : ""}
                </p>
              ) : null}
            </article>
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
