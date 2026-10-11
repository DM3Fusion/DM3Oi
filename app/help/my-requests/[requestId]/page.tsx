import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Badge } from "@/components/ui";
import { requireInternalContext } from "@/lib/auth/context";
import { getMyPlatformSupportRequest } from "@/lib/data/platform-support-repository";
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

export default async function MyDM3OiRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const context = await requireInternalContext();
  const { requestId } = await params;

  const request = await getMyPlatformSupportRequest(
    context.activeOrganization.id,
    requestId,
  );

  if (!request) notFound();

  return (
    <>
      <PageHeader
        eyebrow="My DM3Oi Requests"
        title={request.subject}
        description={request.organizationName}
      />

      <section className="panel my-support-detail">
        <div className="my-support-detail-heading">
          <div>
            <Badge
              value={
                platformSupportStatusLabels[request.status]
              }
            />
            <h2>{request.subject}</h2>
          </div>

          <Link
            className="auth-link"
            href="/help/my-requests"
          >
            Back to My DM3Oi Requests
          </Link>
        </div>

        <dl className="my-support-facts">
          <div>
            <dt>Category</dt>
            <dd>
              {platformSupportCategoryLabels[request.category]}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{platformSupportStatusLabels[request.status]}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{formatDate(request.createdAt)}</dd>
          </div>
          <div>
            <dt>Last Updated</dt>
            <dd>{formatDate(request.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="panel my-support-conversation">
        <div className="my-support-conversation-heading">
          <h2>Conversation</h2>
          <p>
            This history is read-only. DM3Oi responses are also
            sent to your account email address.
          </p>
        </div>

        <div className="my-support-thread">
          {request.messages.map((message) => (
            <article
              key={message.id}
              className={`my-support-message ${
                message.senderType === "PLATFORM_ADMIN"
                  ? "my-support-message-dm3oi"
                  : "my-support-message-user"
              }`}
            >
              <div className="my-support-message-heading">
                <div>
                  <strong>
                    {message.senderType === "PLATFORM_ADMIN"
                      ? "DM3Oi"
                      : message.senderName}
                  </strong>
                  <span>
                    {message.senderType === "PLATFORM_ADMIN"
                      ? "Platform Support"
                      : request.organizationName}
                  </span>
                </div>
                <time dateTime={message.createdAt}>
                  {formatDate(message.createdAt)}
                </time>
              </div>

              <p>{message.body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
