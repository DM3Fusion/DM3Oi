import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { NavigableRow } from "@/components/navigable-row";
import { UrlSearch } from "@/components/question-search";
import { UserAvatar } from "@/components/user-avatar";
import { getPlatformAdministration } from "@/lib/data/platform-repository";
import {
  normalizePlatformUserQuery,
  platformUserMatchesSearch,
} from "@/lib/platform-user-filters";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ users }, query] = await Promise.all([
    getPlatformAdministration(),
    searchParams,
  ]);
  const q = normalizePlatformUserQuery(query.q);
  const visibleUsers = users.filter((user) =>
    platformUserMatchesSearch(user, q),
  );
  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title="Users / Access"
        description="Review and provision platform, organization, portal, and pending access."
        action={
          <Link className="primary-button" href="/admin/users/new">
            ＋ Create User
          </Link>
        }
      />
      <UrlSearch
        q={q}
        label="Search platform users"
        placeholder="Search users..."
        clearLabel="Clear platform user search"
      />
      <section className="panel">
        {users.length ? (
          visibleUsers.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Access state</th>
                    <th>Organizations / roles</th>
                    <th>Portal access</th>
                    <th>Profile</th>
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
                        <span className="user-identity-cell"><UserAvatar displayName={user.display_name} email={user.email} src={user.avatarUrl} size="sm"/><span><Link className="entity-row-link" href={`/admin/users/${user.id}`}>{user.display_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || "Unnamed user"}</Link><small className="table-secondary">{user.email ?? "No email"}</small></span></span>
                      </td>
                      <td>
                        <Badge value={user.accessState} />
                      </td>
                      <td>
                        {user.memberships.length
                          ? user.memberships.map((membership) => (
                              <span className="access-line" key={membership.id}>
                                {membership.organizationName} ·{" "}
                                {membership.role.replaceAll("_", " ")} ·{" "}
                                {membership.active ? "Active" : "Inactive"}
                              </span>
                            ))
                          : "—"}
                      </td>
                      <td>{user.portalAccess}</td>
                      <td>
                        <Badge value={user.is_active ? "ACTIVE" : "INACTIVE"} />
                      </td>
                    </NavigableRow>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-results">No users match this search.</div>
          )
        ) : (
          <div className="empty compact-empty">
            <h2>No user profiles yet</h2>
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
