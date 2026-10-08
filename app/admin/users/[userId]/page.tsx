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
  transitionUserMembershipAction,
} from "@/lib/data/user-invitation-actions";
import { evaluateInvitationEligibility } from "@/lib/data/invitation-eligibility";
import { ApplicationIcon } from "@/components/application-icon";
import { SuperAdminUserDelete } from "@/components/super-admin-user-delete";
import { deleteOrphanedTestIdentityAction } from "@/lib/data/platform-actions";
import { getPlatformUserDeletionEligibility } from "@/lib/data/platform-user-deletion";
import { getGlobalUserDeletionEligibility } from "@/lib/data/platform-user-global-deletion";
import {
  getPlatformUserRoleHistory,
  roleHistoryChangeLabel,
  roleHistoryEventDescription,
} from "@/lib/data/user-role-history";
import { formatPlatformDateTime } from "@/lib/format";

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
  const invitationEligible = evaluateInvitationEligibility({
    targetHasActiveSuperAdminRole: user.platformAdmin,
    authEmail: user.authEmail,
    authEmailConfirmedAt: user.emailConfirmedAt,
    authLastSignInAt: user.lastSignInAt,
    actorIsSuperAdmin: access?.isSuperAdmin === true,
    actorCanManageOrganization: false,
  });
  const revokedMembership =
    user.memberships.find((membership) => membership.status === "REVOKED") ??
    null;
  const deletionEligibility = revokedMembership
    ? await getPlatformUserDeletionEligibility(user.id, revokedMembership.id)
    : null;

  const orphanDeletionEligibility =
    user.memberships.length === 0
      ? await getGlobalUserDeletionEligibility(user.id)
      : null;

  const roleHistory = await getPlatformUserRoleHistory(user.id);

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

  const testIdentityCleanupBlockers = new Set([
    "A Customer Portal identity exists.",
    "Service Desk history or responsibility exists.",
  ]);

  const canDeleteTestIdentity =
    !isOwnProfile &&
    user.memberships.length === 0 &&
    orphanDeletionEligibility !== null &&
    !orphanDeletionEligibility.eligible &&
    orphanDeletionEligibility.blockers.length > 0 &&
    orphanDeletionEligibility.blockers.every((blocker) =>
      testIdentityCleanupBlockers.has(blocker),
    );

  const testIdentityConfirmation = `DELETE TEST USER ${name}`;

  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title={name}
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
            <Badge value={user.status} />
          </div>
          <PlatformIdentityForm
            userId={user.id}
            identity={{ displayName: user.display_name ?? "", title: user.title ?? "", email: user.email ?? "", active: user.is_active }}
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
            <div>
              <dt>Last Sign In</dt>
              <dd>
                {user.lastSignInAt
                  ? formatPlatformDateTime(user.lastSignInAt)
                  : "Never"}
              </dd>
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
                      <Badge value={membership.status} />
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
                        <button>Save role</button>
                      </form>
                      <div className="form-actions">
                        {membership.status === "VERIFIED" ? (
                          <form action={transitionUserMembershipAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <input type="hidden" name="action" value="ACTIVATE" />
                            <button className="secondary-button">Activate</button>
                          </form>
                        ) : null}
                        {membership.status === "ACTIVE" ? (
                          <form action={transitionUserMembershipAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <input type="hidden" name="action" value="SUSPEND" />
                            <button className="secondary-button">Suspend</button>
                          </form>
                        ) : null}
                        {membership.status === "SUSPENDED" ? (
                          <form action={transitionUserMembershipAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <input type="hidden" name="action" value="REACTIVATE" />
                            <button className="secondary-button">Reactivate</button>
                          </form>
                        ) : null}
                        {membership.status !== "REVOKED" ? (
                          <form action={transitionUserMembershipAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <input type="hidden" name="action" value="REVOKE" />
                            <button className="secondary-button">Revoke</button>
                          </form>
                        ) : (
                          <form action={transitionUserMembershipAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <input type="hidden" name="action" value="REINSTATE" />
                            <button className="secondary-button">Reinstate</button>
                          </form>
                        )}
                      </div>
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
      <section className="panel detail-section">
        <div className="section-head">
          <div>
            <h2>Role History</h2>
            <p>
              Recorded platform and organization role assignments and changes.
            </p>
          </div>
        </div>
        {roleHistory.length ? (
          <div className="role-history-list">
            {roleHistory.map((event) => (
              <article className="role-history-item" key={event.id}>
                <time dateTime={event.createdAt}>
                  {formatPlatformDateTime(event.createdAt)}
                </time>
                <span className="table-secondary">
                  {event.scope === "PLATFORM"
                    ? "DM3Oi Platform"
                    : event.organizationName || "Organization"}
                </span>
                <b>{roleHistoryChangeLabel(event)}</b>
                <span>
                  {roleHistoryEventDescription(event, true)}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="no-results">
            No role history is available for this user.
          </div>
        )}
      </section>

      {revokedMembership ? (
        <section className="panel detail-section">
          <div className="section-head">
            <div>
              <h2>Permanent deletion</h2>
              <p>
                SUPER_ADMIN identity deletion for revoked organization access.
              </p>
            </div>
          </div>
          <SuperAdminUserDelete
            userId={user.id}
            membershipId={revokedMembership.id}
            organizationId={revokedMembership.organizationId}
            displayName={name}
            email={user.email ?? ""}
            blockers={
              deletionEligibility?.blockers ?? [
                "Dependency checks could not be completed.",
              ]
            }
          />
        </section>
      ) : null}

      {user.memberships.length === 0 ? (
        <section className="panel detail-section">
          <div className="section-head">
            <div>
              <h2>Orphaned identity cleanup</h2>
              <p>
                SUPER_ADMIN permanent deletion for an identity with no
                organization membership.
              </p>
            </div>
          </div>
          <SuperAdminUserDelete
            userId={user.id}
            displayName={name}
            email={user.email ?? ""}
            blockers={
              orphanDeletionEligibility?.blockers ?? [
                "Dependency checks could not be completed.",
              ]
            }
            orphaned
          />

          {canDeleteTestIdentity ? (
            <div className="admin-test-identity-cleanup">
              <h3>Delete test identity and dependencies</h3>
              <p>
                This SUPER_ADMIN recovery action removes this orphaned
                identity&apos;s Customer Portal relationship and Service Desk
                identity references, then runs the global deletion guard again.
                Any other retained business history still blocks deletion.
              </p>

              <form action={deleteOrphanedTestIdentityAction}>
                <input type="hidden" name="userId" value={user.id} />

                <label>
                  <span>
                    Type <strong>{testIdentityConfirmation}</strong> to confirm
                  </span>
                  <input
                    name="confirmation"
                    autoComplete="off"
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="danger-button admin-test-identity-delete-button"
                >
                  Confirm Delete Test Identity
                </button>
              </form>
            </div>
          ) : null}
        </section>
      ) : null}
      <Link className="auth-link" href="/admin/users">
        <ApplicationIcon name="back" />All users
      </Link>
    </>
  );
}
