import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Badge } from "@/components/ui";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getPlatformSupportRequest } from "@/lib/data/platform-support-repository";
import {
  respondToPlatformSupportRequestAction,
  setPlatformSupportStatusAction,
} from "@/lib/data/platform-support-actions";
import {
  platformSupportCategoryLabels,
  platformSupportStatusLabels,
} from "@/lib/platform-support";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));

export default async function PlatformInboxDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{
    sent?: string;
    error?: string;
  }>;
}) {
  const { requestId } = await params;
  const query = await searchParams;
  const request = await getPlatformSupportRequest(requestId);

  if (!request) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Platform Inbox"
        title={request.subject}
        description={`${request.organizationName} · ${request.submitterName}`}
      />

      {query.sent === "1" ? (
        <div className="success-alert page-notice" role="status">
          Response sent.
        </div>
      ) : null}

      {query.error ? (
        <div className="form-alert page-notice" role="alert">
          {query.error}
        </div>
      ) : null}

      <section className="panel detail-section">
        <div className="section-heading">
          <div>
            <Badge
              value={
                platformSupportStatusLabels[request.status]
              }
            />
            <h2>{request.subject}</h2>
          </div>

          <Link className="auth-link" href="/admin/inbox">
            Back to Platform Inbox
          </Link>
        </div>

        <div className="detail-grid">
          <div>
            <span>Organization</span>
            <strong>{request.organizationName}</strong>
          </div>
          <div>
            <span>Submitted by</span>
            <strong>{request.submitterName}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{request.submitterEmail}</strong>
          </div>
          <div>
            <span>Category</span>
            <strong>
              {platformSupportCategoryLabels[request.category]}
            </strong>
          </div>
          <div>
            <span>Submitted</span>
            <strong>{formatDate(request.createdAt)}</strong>
          </div>
          <div>
            <span>Platform notification email</span>
            <strong>{request.notificationEmailStatus}</strong>
          </div>
        </div>
      </section>

      <section className="panel detail-section">
        <div className="section-heading">
          <div>
            <h2>Conversation</h2>
            <p>
              Durable history of the organization request and
              DM3Oi responses.
            </p>
          </div>
        </div>

        <div className="message-thread">
          {request.messages.map((message) => (
            <article
              key={message.id}
              className="message-card"
            >
              <div className="section-heading">
                <div>
                  <strong>{message.senderName}</strong>
                  <p>
                    {message.senderType === "PLATFORM_ADMIN"
                      ? "DM3Oi"
                      : request.organizationName}
                  </p>
                </div>
                <small>{formatDate(message.createdAt)}</small>
              </div>

              <p className="message-body">{message.body}</p>

              {message.senderType === "PLATFORM_ADMIN" &&
              message.emailStatus ? (
                <small>
                  Email: {message.emailStatus}
                  {message.emailError
                    ? ` — ${message.emailError}`
                    : ""}
                </small>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel form-panel platform-inbox-status-panel">
        <h2>Request Status</h2>

        <form
          action={setPlatformSupportStatusAction}
          className="inline-control platform-inbox-status-form"
        >
          <input
            type="hidden"
            name="requestId"
            value={request.id}
          />

          <label>
            <span>Status</span>
            <select
              name="status"
              defaultValue={
                request.status === "SUBMITTED"
                  ? "RECEIVED"
                  : request.status
              }
            >
              <option value="RECEIVED">Received</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="RESPONDED">Responded</option>
              <option value="CLOSED">Closed</option>
            </select>
          </label>

          <PendingSubmitButton
            className="secondary-button platform-inbox-status-button"
            pendingLabel="Updating…"
          >
            Update Status
          </PendingSubmitButton>
        </form>
      </section>

      {request.status !== "CLOSED" ? (
        <section className="panel form-panel">
          <h2>Respond</h2>
          <p>
            The response is recorded in DM3Oi before email
            delivery is attempted.
          </p>

          <form
            action={respondToPlatformSupportRequestAction}
            className="entity-form"
          >
            <input
              type="hidden"
              name="requestId"
              value={request.id}
            />

            <label>
              <span>Message</span>
              <textarea
                name="message"
                rows={8}
                maxLength={5000}
                required
                placeholder="Enter the response to the organization user."
              />
            </label>

            <div className="form-actions">
              <PendingSubmitButton
                className="primary-button"
                pendingLabel="Sending…"
              >
                Send Response
              </PendingSubmitButton>
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
