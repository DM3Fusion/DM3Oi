import Link from "next/link";

import { NavigableRow } from "@/components/navigable-row";
import { Badge } from "@/components/ui";
import type { OrganizationAdminRow } from "@/lib/data/platform-repository";

export function OrganizationTable({
  organizations,
}: {
  organizations: readonly OrganizationAdminRow[];
}) {
  return (
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
            <th>Open Cases</th>
          </tr>
        </thead>
        <tbody>
          {organizations.map((organization) => {
            const href = `/admin/organizations/${organization.id}`;

            return (
              <NavigableRow
                key={organization.id}
                href={href}
                label={`Open organization ${organization.name}`}
              >
                <td>
                  <Link className="entity-row-link" href={href}>
                    {organization.name}
                  </Link>
                  <small className="table-secondary">
                    {organization.slug}
                  </small>
                </td>
                <td>
                  <Badge value={organization.status} />
                </td>
                <td>
                  <Badge
                    value={organization.license?.license_status ?? "EXPIRED"}
                  />
                </td>
                <td>
                  {new Date(organization.created_at).toLocaleDateString()}
                </td>
                <td>{organization.activeUsers}</td>
                <td>{organization.businessOwners}</td>
                <td>{organization.businessAdmins}</td>
                <td>{organization.openCases}</td>
              </NavigableRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
