import Link from "next/link";
import { NavigableRow } from "@/components/navigable-row";
import { UserAvatar } from "@/components/user-avatar";
import { getAccessContext } from "@/lib/auth/context";
import { Badge, PageHeader } from "@/components/ui";
import { PlatformIdentityForm } from "@/components/platform-identity-form";
import { getPlatformUser } from "@/lib/data/platform-repository";
import {
  addUserMembershipAction,
  updateUserMembershipAction,
  getInvitationEligibility,
} from "@/lib/data/user-invitation-actions";
import { ApplicationIcon } from "@/components/application-icon";

const roles = [
  "BUSINESS_OWNER",
  "BUSINESS_ADMIN",
  "STAFF_MANAGER",
  "STAFF_USER",
] as const;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const [{ user, organizations }, access] = await Promise.all([
    getPlatformUser(userId),
    getAccessContext(),
  ]);
  const invitationEligible = await getInvitationEligibility(user.id);

  const isOwnProfile = access?.user.id === user.id;
  const activeOrganizations = organizations.filter(
    (organization) =>
      organization.status === "ACTIVE" &&
      !user.memberships.some(
        (membership) => membership.organizationId === organization.id,
      ),
  );
  const name =
    user.display_name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.email ||
    "Unnamed user";
  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title={name}
        description="User identity and application access."
      />
      {query.message ? (
        <div className="success-alert page-notice">{query.message}</div>
      ) : null}
      {query.error ? (
        <div className="form-alert page-notice">{query.error}</div>
      ) : null}
      <div className="admin-detail-grid">
        <section className="panel detail-section">
          <div className="section-head">
            <div>
              <span className="user-detail-identity">
                {isOwnProfile ? (
                  <Link
                    href="/account/profile"
                    aria-label="Open My Profile"
                    className="avatar-profile-link"
                  >
                    <UserAvatar
                      displayName={user.display_name}
                      email={user.email}
                      src={user.avatarUrl}
                      size="lg"
                    />
                  </Link>
                ) : (
                  <UserAvatar
                    displayName={user.display_name}
                    email={user.email}
                    src={user.avatarUrl}
                    size="lg"
                  />
                )}
                <span>
                  <h2>Platform identity</h2>
                  <p>Auth and profile identity shared across organizations</p>
                </span>
              </span>
            </div>
            <Badge value={user.is_active ? "ACTIVE" : "INACTIVE"} />
          </div>
          <PlatformIdentityForm
            userId={user.id}
            identity={{ displayName: user.display_name ?? "", email: user.email ?? "", active: user.is_active }}
            invitationEligible={invitationEligible}
          />
        </section>
        <aside className="panel detail-section admin-summary">
          <h2>Access summary</h2>
          <dl>
            <div>
              <dt>Access state</dt>
              <dd>{user.accessState}</dd>
            </div>
            <div>
              <dt>Platform role</dt>
              <dd>{user.platformAdmin ? "SUPER ADMIN" : "None"}</dd>
            </div>
            <div>
              <dt>Portal access</dt>
              <dd>{user.portalAccess}</dd>
            </div>
            <div>
              <dt>Memberships</dt>
              <dd>{user.memberships.length}</dd>
            </div>
          </dl>
        </aside>
      </div>
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Organization memberships</h2>
            <p>Organization access is separate from the platform identity above.</p>
          </div>
        </div>
        {activeOrganizations.length ? (
          <details className="admin-provision">
            <summary><ApplicationIcon name="add" />Add organization access</summary>
            <form action={addUserMembershipAction} className="mini-form">
              <input type="hidden" name="userId" value={user.id} />
              <label>
                <span>Active organization</span>
                <select name="organizationId">
                  {activeOrganizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Role</span>
                <select name="role">
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mini-actions">
                <button>Provision access</button>
              </div>
            </form>
          </details>
        ) : null}
        {user.memberships.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th>Change access</th>
                </tr>
              </thead>
              <tbody>
                {user.memberships.map((membership) => (
                  <NavigableRow
                    key={membership.id}
                    href={`/admin/organizations/${membership.organizationId}`}
                    label={`Open organization ${membership.organizationName}`}
                  >
                    <td>
                      <Link
                        className="entity-row-link"
                        href={`/admin/organizations/${membership.organizationId}`}
                      >
                        {membership.organizationName}
                      </Link>
                    </td>
                    <td>{membership.role.replaceAll("_", " ")}</td>
                    <td>
                      <Badge
                        value={membership.active ? "ACTIVE" : "INACTIVE"}
                      />
                    </td>
                    <td>
                      {new Date(membership.joinedAt).toLocaleDateString()}
                    </td>
                    <td>
                      <form
                        action={updateUserMembershipAction}
                        className="membership-form"
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="hidden"
                          name="membershipId"
                          value={membership.id}
                        />
                        <select name="role" defaultValue={membership.role}>
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {role.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                        <select
                          name="active"
                          defaultValue={String(membership.active)}
                        >
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                        <button>Save</button>
                      </form>
                    </td>
                  </NavigableRow>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-results">
            No organization memberships. This user has Pending Access unless
            another access type applies.
          </div>
        )}
      </section>
      <Link className="auth-link" href="/admin/users">
        <ApplicationIcon name="back" />All users
      </Link>
    </>
  );
}
