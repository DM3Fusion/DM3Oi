import Link from "next/link";
import { ApplicationIcon } from "@/components/application-icon";
import { NavigableRow } from "@/components/navigable-row";
import { Badge } from "@/components/ui";
import type { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import {
  displayName,
  getServiceDeskData,
} from "@/lib/data/case-repository";
import { getServiceRequestMetrics } from "@/lib/live-dashboard-metrics";
import { formatServiceRequestUpdatedAt } from "@/lib/service-request-format";

type ServiceDeskDataPromise = ReturnType<typeof getServiceDeskData>;
type AccessPromise = ReturnType<typeof getAccessContext>;

export async function ServiceDeskCreateActionServerSection({
  accessPromise,
}: {
  accessPromise: AccessPromise;
}) {
  const access = await accessPromise;

  return hasPermission(access, "CREATE_SERVICE_REQUEST") ? (
    <Link className="primary-button" href="/service-desk/new">
      <ApplicationIcon name="add" />New Service Request
    </Link>
  ) : null;
}

export async function ServiceDeskBodyServerSection({
  dataPromise,
}: {
  dataPromise: ServiceDeskDataPromise;
}) {
  const data = await dataPromise;
  const metrics = getServiceRequestMetrics(data.serviceRequests);

  return (
    <>
      <div className="metric-grid service-desk-metrics">
        {metrics.map((metric) => (
          <Link
            key={metric.label}
            href={metric.href}
            className={`metric tone-${metric.tone}`}
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </Link>
        ))}
      </div>
      <section className="panel">
        <div className="section-head">
          <h2>Recent Service Requests</h2>
          <Link href="/service-desk/requests">
            View All Service Requests <ApplicationIcon name="forward" />
          </Link>
        </div>
        {data.serviceRequests.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Customer</th>
                  <th>Subject</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.serviceRequests.slice(0, 8).map((request) => (
                  <NavigableRow
                    key={request.id}
                    href={`/service-desk/${request.id}`}
                    label={`Open service request ${request.request_number}`}
                  >
                    <td>
                      <b className="case-link">{request.request_number}</b>
                    </td>
                    <td>{request.customer?.name ?? "—"}</td>
                    <td>
                      <b>{request.subject}</b>
                    </td>
                    <td>
                      <Badge value={request.priority} />
                    </td>
                    <td>
                      <Badge value={request.status} />
                    </td>
                    <td>{displayName(request.assigned)}</td>
                    <td>
                      {formatServiceRequestUpdatedAt(
                        request.updated_at,
                        data.timezone,
                      )}
                    </td>
                  </NavigableRow>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty compact-empty">
            <h2>No service requests yet</h2>
            <p>
              Create the first service request to begin tracking customer
              support work.
            </p>
            <Link className="primary-button" href="/service-desk/new">
              <ApplicationIcon name="add" />New Service Request
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
