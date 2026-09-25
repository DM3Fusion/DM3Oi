import Link from "next/link";
import { NavigableRow } from "@/components/navigable-row";
import { PageHeader, Badge } from "@/components/ui";
import { getPlatformAdministration } from "@/lib/data/platform-repository";
import { ApplicationIcon } from "@/components/application-icon";
import {
  getPendingPermanentOrganizationDeletionCleanups,
  getRetainedPermanentOrganizationDeletionIdentityReviews,
  recheckPermanentOrganizationDeletionRetainedIdentitiesAction,
  retryPermanentOrganizationDeletionCleanupAction,
} from "@/lib/data/platform-actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    query?: string;
    message?: string;
    error?: string;
    deletionAuditId?: string;
  }>;
}) {
  const [
    { organizations },
    pendingDeletionCleanups,
    retainedIdentityReviews,
    params,
  ] = await Promise.all([
    getPlatformAdministration(),
    getPendingPermanentOrganizationDeletionCleanups(),
    getRetainedPermanentOrganizationDeletionIdentityReviews(),
    searchParams,
  ]);
  const status = params.status ?? "ACTIVE";
  const query = (params.query ?? "").toLowerCase();
  const items = organizations.filter(
    (o) =>
      (status === "ALL" ||
        (status === "INACTIVE"
          ? o.status !== "ACTIVE"
          : o.status === "ACTIVE")) &&
      `${o.name} ${o.slug}`.toLowerCase().includes(query),
  );
  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title="Organizations"
        action={
          <Link href="/admin/organizations/new" className="primary-button">
            <ApplicationIcon name="add" />Create Organization
          </Link>
        }
      />
      {params.message ? (
        <div className="success-alert page-notice">{params.message}</div>
      ) : null}

      {params.error ? (
        <div className="form-alert page-notice">{params.error}</div>
      ) : null}

      {retainedIdentityReviews.length ? (
        <section className="panel admin-deletion-cleanup-panel">
          <div className="section-head">
            <div>
              <span className="admin-danger-zone-label">
                Identity Review
              </span>
              <h2>Retained Identity Review</h2>
              <p>
                These permanently deleted organizations still have identities
                that were deliberately retained by an earlier fail-closed
                dependency review. Re-evaluation runs the current global
                dependency guard before any Auth identity can be removed.
              </p>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Deleted organization</th>
                  <th>Retained identities</th>
                  <th>Last reviewed</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {retainedIdentityReviews.map((review) => (
                  <tr key={review.id}>
                    <td>
                      <strong>{review.organizationName}</strong>
                      <small className="table-secondary">
                        {review.organizationSlug}
                      </small>
                    </td>
                    <td>{review.retainedIdentityCount}</td>
                    <td>
                      {new Date(
                        review.cleanupUpdatedAt,
                      ).toLocaleString()}
                    </td>
                    <td>
                      <form
                        action={
                          recheckPermanentOrganizationDeletionRetainedIdentitiesAction
                        }
                      >
                        <input
                          type="hidden"
                          name="deletionAuditId"
                          value={review.id}
                        />
                        <button
                          type="submit"
                          className="secondary-button"
                        >
                          Re-evaluate Identities
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {pendingDeletionCleanups.length ? (
        <section className="panel admin-deletion-cleanup-panel">
          <div className="section-head">
            <div>
              <span className="admin-danger-zone-label">
                Cleanup Required
              </span>
              <h2>Pending Deletion Cleanup</h2>
              <p>
                These organizations have already been permanently deleted.
                Retry remaining identity or Storage cleanup without repeating
                the organization deletion.
              </p>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Deleted organization</th>
                  <th>Identity cleanup</th>
                  <th>Storage cleanup</th>
                  <th>Last updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingDeletionCleanups.map((cleanup) => (
                  <tr key={cleanup.id}>
                    <td>
                      <strong>{cleanup.organizationName}</strong>
                      <small className="table-secondary">
                        {cleanup.organizationSlug}
                      </small>
                    </td>
                    <td>
                      <Badge value={cleanup.identityStatus} />
                    </td>
                    <td>
                      <Badge value={cleanup.storageStatus} />
                    </td>
                    <td>
                      {new Date(
                        cleanup.cleanupUpdatedAt,
                      ).toLocaleString()}
                    </td>
                    <td>
                      <form
                        action={
                          retryPermanentOrganizationDeletionCleanupAction
                        }
                      >
                        <input
                          type="hidden"
                          name="deletionAuditId"
                          value={cleanup.id}
                        />
                        <button
                          type="submit"
                          className="secondary-button"
                        >
                          Retry Cleanup
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <form className="filters">
          <label className="search">
            <ApplicationIcon name="search" />
            <input
              name="query"
              defaultValue={params.query}
              placeholder="Search organizations"
            />
          </label>
          <select name="status" defaultValue={status}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All</option>
          </select>
          <button className="filter-button">Apply</button>
        </form>
        {items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>License</th>
                  <th>Created</th>
                  <th>Users</th>
                  <th>Owners</th>
                  <th>Admins</th>
                  <th>Open cases</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <NavigableRow
                    key={o.id}
                    href={`/admin/organizations/${o.id}`}
                    label={`Open organization ${o.name}`}
                  >
                    <td>
                      <Link
                        className="entity-row-link"
                        href={`/admin/organizations/${o.id}`}
                      >
                        {o.name}
                      </Link>
                      <small className="table-secondary">{o.slug}</small>
                    </td>
                    <td>
                      <Badge value={o.status} />
                    </td>
                    <td><Badge value={o.license?.license_status ?? "EXPIRED"} /></td>
                    <td>{new Date(o.created_at).toLocaleDateString()}</td>
                    <td>{o.activeUsers}</td>
                    <td>{o.businessOwners}</td>
                    <td>{o.businessAdmins}</td>
                    <td>{o.openCases}</td>
                  </NavigableRow>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-results">
            No organizations match these filters.
          </div>
        )}
      </section>
    </>
  );
}
