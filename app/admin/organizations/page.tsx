import Link from "next/link";
import { NavigableRow } from "@/components/navigable-row";
import { PageHeader, Badge } from "@/components/ui";
import { getPlatformAdministration } from "@/lib/data/platform-repository";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; query?: string }>;
}) {
  const [{ organizations }, params] = await Promise.all([
    getPlatformAdministration(),
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
        description="Provision and manage DM3Oi business organizations."
        action={
          <Link href="/admin/organizations/new" className="primary-button">
            ＋ Create Organization
          </Link>
        }
      />
      <section className="panel">
        <form className="filters">
          <label className="search">
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
