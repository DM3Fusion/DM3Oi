import type {
  CustomerPortalCaseRequirement,
  CustomerPortalCaseSummary,
} from "@/lib/data/customer-portal-case-repository";
import { PortalDocumentsSentConfirmation } from "@/components/portal-documents-sent-confirmation";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";

const safePercentage = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

type Props = {
  cases: CustomerPortalCaseSummary[];
  requirements: CustomerPortalCaseRequirement[];
  organizationName: string;
  secureDocumentSystemUrl: string | null;
  documentSubmissionInstructions: string | null;
  timezone: string;
};

export function PortalCaseSummaries({
  cases,
  requirements,
  organizationName,
  secureDocumentSystemUrl,
  documentSubmissionInstructions,
  timezone,
}: Props) {
  if (!cases.length) {
    return (
      <section
        className="portal-case-empty"
        aria-labelledby="portal-cases-heading"
      >
        <h2 id="portal-cases-heading">No active cases</h2>
        <p>You don’t currently have any work in progress.</p>
      </section>
    );
  }

  const requirementByCase = new Map(
    requirements.map((item) => [item.case_number, item]),
  );
  const singular = cases.length === 1;

  return (
    <section
      className="portal-case-section"
      aria-labelledby="portal-cases-heading"
    >
      <h2 id="portal-cases-heading">
        {singular ? "Your Case" : "Active Cases"}
      </h2>
      <div className={`portal-case-grid${singular ? " single" : ""}`}>
        {cases.map((item) => {
          const percentage = safePercentage(item.progress_percent);
          const requirement = requirementByCase.get(item.case_number);

          return (
            <article className="portal-case-card" key={item.case_number}>
              <div className="portal-case-heading">
                <div>
                  <strong>{item.service_label || item.case_number}</strong>
                  <span>{item.case_number}</span>
                </div>
                <span className="portal-case-status">
                  {item.customer_status}
                </span>
              </div>

              <div className="portal-case-progress-copy">
                <strong>{percentage}% Complete</strong>
              </div>
              <div
                className="portal-case-progress"
                role="progressbar"
                aria-label={`${item.case_number} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentage}
                aria-valuetext={`${percentage}% complete`}
              >
                <span style={{ width: `${percentage}%` }} />
              </div>

              {requirement ? (
                <section
                  className="portal-case-requirement"
                  aria-label={`Action required for ${item.case_number}`}
                >
                  <div className="portal-case-requirement-label">
                    {requirement.reported_sent_at
                      ? "Awaiting Verification"
                      : "Action Required"}
                  </div>
                  <h3>
                    {requirement.reported_sent_at
                      ? "Documents Reported Sent"
                      : "Documents Needed"}
                  </h3>
                  <ul>
                    {requirement.missing_documents.map((document) => (
                      <li key={document}>{document}</li>
                    ))}
                  </ul>

                  {requirement.reported_sent_at ? (
                    <div className="portal-documents-reported-state">
                      <strong>Document Sent</strong>
                      <time dateTime={requirement.reported_sent_at}>
                        {formatOrganizationDateTime(
                          requirement.reported_sent_at,
                          timezone,
                          "medium",
                        )}
                      </time>
                      <p>
                        {organizationName} will verify receipt in its secure
                        document system.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="portal-case-privacy-notice">
                        <strong>Privacy Notice</strong>
                        <p>
                          For your privacy, do not send documents, tax records,
                          identification, or other sensitive information through
                          DM3Oi or a DM3Oi email reply.
                        </p>
                        <p>
                          You must use the secure document system required by{" "}
                          {organizationName} or follow the document-submission
                          instructions below.
                        </p>
                      </div>

                      {documentSubmissionInstructions ? (
                        <div className="portal-document-instructions">
                          <strong>How to Provide Your Documents</strong>
                          <p>{documentSubmissionInstructions}</p>
                        </div>
                      ) : null}
                    </>
                  )}

                  {!requirement.reported_sent_at && secureDocumentSystemUrl ? (
                    <a
                      className="primary-button portal-secure-document-link"
                      href={secureDocumentSystemUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Secure Document System
                    </a>
                  ) : null}

                  {!requirement.reported_sent_at ? (
                    <>
                      <small className="portal-external-system-note">
                        Opens the organization&apos;s external secure document
                        system outside DM3Oi.
                      </small>

                      <PortalDocumentsSentConfirmation
                        taskId={requirement.task_id}
                        caseNumber={item.case_number}
                        documents={requirement.missing_documents}
                        organizationName={organizationName}
                      />
                    </>
                  ) : null}
                </section>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
