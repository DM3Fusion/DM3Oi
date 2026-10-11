import Link from "next/link";
import { PageHeader, Badge } from "@/components/ui";
import { requireInternalContext } from "@/lib/auth/context";
import { getMyPlatformSupportRequests } from "@/lib/data/platform-support-repository";
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

export default async function MyDM3OiRequestsPage() {
  const context = await requireInternalContext();
  const requests = await getMyPlatformSupportRequests(
    context.activeOrganization.id,
  );

  return (
    <>
      <PageHeader
        eyebrow="Help"
        title="My DM3Oi Requests"
        description="Track the DM3Oi support requests you personally submitted."
      />

      <section className="panel my-support-panel">
        <div className="my-support-heading">
          <div>
            <h2>Request History</h2>
            <p>
              Open and closed requests remain available for your
              records.
            </p>
          </div>

          <Link
            className="primary-button"
            href="/help/contact-dm3oi"
          >
            Contact DM3Oi
          </Link>
        </div>

        {requests.length ? (
          <div className="my-support-list">
            {requests.map((request) => (
              <Link
                key={request.id}
                className="my-support-row"
                href={`/help/my-requests/${request.id}`}
              >
                <div className="my-support-row-main">
                  <div className="my-support-row-heading">
                    <strong>{request.subject}</strong>
                    <Badge
                      value={
                        platformSupportStatusLabels[request.status]
                      }
                    />
                  </div>

                  <p>{request.message}</p>

                  <div className="my-support-meta">
                    <span>
                      {platformSupportCategoryLabels[
                        request.category
                      ]}
                    </span>
                    <span>
                      Submitted {formatDate(request.createdAt)}
                    </span>
                    <span>
                      Updated {formatDate(request.updatedAt)}
                    </span>
                  </div>
                </div>

                <span
                  className="my-support-open"
                  aria-hidden="true"
                >
                  ›
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="my-support-empty">
            <h2>No DM3Oi requests yet</h2>
            <p>
              Requests you submit through Contact DM3Oi will
              appear here.
            </p>
            <Link
              className="primary-button"
              href="/help/contact-dm3oi"
            >
              Contact DM3Oi
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
