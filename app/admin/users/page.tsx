import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { NavigableRow } from "@/components/navigable-row";
import { PlatformUserFilters } from "@/components/platform-user-filters";
import { UserAvatar } from "@/components/user-avatar";
import { getPlatformAdministration } from "@/lib/data/platform-repository";
import {
  normalizePlatformUserQuery,
  normalizePlatformUserRole,
  normalizePlatformUserStatus,
  platformRoleLabels,
  platformUserMatchesFilters,
} from "@/lib/platform-user-filters";
import { ApplicationIcon } from "@/components/application-icon";
import { formatPlatformDateTime } from "@/lib/format";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string }>;
}) {
  const [{ users }, query] = await Promise.all([
    getPlatformAdministration(),
    searchParams,
  ]);
  const q = normalizePlatformUserQuery(query.q);
  const role = normalizePlatformUserRole(query.role);
  const status = normalizePlatformUserStatus(query.status);
  const visibleUsers = users.filter((user) =>
    platformUserMatchesFilters(user, q, role, status),
  );
  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title="Platform Users"
        action={
          <Link className="primary-button" href="/admin/users/new">
            <ApplicationIcon name="add" />Create User
          </Link>
        }
      />
      <div className="platform-user-count">
        <b>{visibleUsers.length}</b> of <b>{users.length}</b> user{users.length === 1 ? "" : "s"}
      </div>
      <PlatformUserFilters
        query={q}
        role={role}
        status={status}
      />
      <section className="panel">
        {users.length ? (
          visibleUsers.length ? (
            <div className="table-scroll platform-users-table-scroll">
              <table className="platform-users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Organization / Role</th>
                    <th>Status</th>
                    <th>Last Sign In</th>
                    <th>User Since</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <NavigableRow
                      key={user.id}
                      href={`/admin/users/${user.id}`}
                      label={`Open user ${user.display_name || user.email || "record"}`}
                    >
                      <td>
                        <span className="user-identity-cell"><UserAvatar displayName={user.display_name} email={user.email} src={user.avatarUrl} size="sm"/><span><Link className="entity-row-link" href={`/admin/users/${user.id}`}>{user.display_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || "Unnamed user"}</Link><small className="table-secondary">{user.email ?? "Email unavailable"}</small></span></span>
                      </td>
                      <td>
                        <span className="platform-user-access-list">
                          {user.platformRoleAssigned ? (
                            <span className="access-line">
                              <b>DM3Oi Platform</b> · {platformRoleLabels.SUPER_ADMIN} · {user.platformAdmin ? "Active" : "Inactive"}
                            </span>
                          ) : null}
                          {user.memberships.map((membership) => (
                            <span className="access-line" key={membership.id}>
                              <b>{membership.organizationName}</b> · {platformRoleLabels[membership.role as keyof typeof platformRoleLabels] ?? membership.role.replaceAll("_", " ")} · {membership.status.charAt(0) + membership.status.slice(1).toLowerCase()}
                            </span>
                          ))}
                          {user.portalAccesses.map((portal) => (
                            <span className="access-line" key={portal.id}>
                              <b>{portal.organizationName}</b> · {platformRoleLabels.PUBLIC_USER} · {portal.effective ? "Active" : "Inactive"}
                            </span>
                          ))}
                          {!user.platformRoleAssigned && !user.memberships.length && !user.portalAccesses.length ? "—" : null}
                        </span>
                      </td>
                      <td>
                        <Badge value={user.status} />
                        {user.accessState.replaceAll("_", " ").toUpperCase() !== user.status.replaceAll("_", " ") ? (
                          <small className="table-secondary platform-user-access-state">{user.accessState}</small>
                        ) : null}
                      </td>
                      <td><time dateTime={user.lastSignInAt ?? undefined}>{user.lastSignInAt ? formatPlatformDateTime(user.lastSignInAt) : "Never"}</time></td>
                      <td><time dateTime={user.userSinceAt ?? undefined}>{formatPlatformDateTime(user.userSinceAt)}</time></td>
                    </NavigableRow>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-results">No users match the current filters.</div>
          )
        ) : (
          <div className="empty compact-empty">
            <h2>No platform users yet</h2>
            <p>
              Invite the first user and optionally provision organization
              access.
            </p>
            <Link className="primary-button" href="/admin/users/new">
              Create User
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
