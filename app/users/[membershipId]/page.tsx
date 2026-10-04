import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { ResendInviteButton } from "@/components/resend-invite-button";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import {
  updateOrganizationMembershipAction,
  transitionOrganizationMembershipAction,
  reassignOrganizationUserWorkAction,
} from "@/lib/data/organization-user-actions";
import { evaluateInvitationEligibility } from "@/lib/data/invitation-eligibility";
import { ORGANIZATION_USER_ROLES, isOrganizationUserRole } from "@/lib/data/user-provisioning";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformAdminUserIds } from "@/lib/data/platform-privacy";
import { attachAuthorizedAvatarUrls } from "@/lib/data/avatar-urls";
import { OrganizationUserProfileEditor } from "@/components/organization-user-profile-editor";
import { ApplicationIcon } from "@/components/application-icon";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { canConfigureOrganizationRole } from "@/lib/auth/organization-permissions";
import { organizationUserDisplayName } from "@/lib/data/pending-invite-identity";
import { getOrganizationUserWorkload } from "@/lib/data/organization-user-workload";
import { getPlatformUserDeletionEligibility } from "@/lib/data/platform-user-deletion";
import { SuperAdminUserDelete } from "@/components/super-admin-user-delete";
import {
  getOrganizationUserRoleHistory,
  roleHistoryChangeLabel,
  roleHistoryEventDescription,
} from "@/lib/data/user-role-history";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const [{ membershipId }, query, access] = await Promise.all([
    params,
    searchParams,
    getAccessContext(),
  ]);
  if (!access?.activeOrganization || !hasPermission(access, "VIEW_USERS"))
    notFound();
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select(
      "id,user_id,role,is_active,status,joined_at,updated_at,profiles(id,email,first_name,last_name,display_name,title,avatar_path,avatar_updated_at)",
    )
    .eq("id", membershipId)
    .eq("organization_id", access.activeOrganization.id)
    .maybeSingle();
  if (!membership) notFound();
  const platformAdminIds = await getPlatformAdminUserIds();
  const targetHasActiveSuperAdminRole = platformAdminIds.has(
    membership.user_id,
  );
  if (targetHasActiveSuperAdminRole) notFound();

  const membershipProfile = Array.isArray(membership.profiles)
    ? membership.profiles[0]
    : membership.profiles;
  const [profile] = membershipProfile
    ? await attachAuthorizedAvatarUrls([membershipProfile])
    : [];
  const name = organizationUserDisplayName(profile ?? {});
  const canManage = hasPermission(access, "MANAGE_USERS");
  const canManageTarget =
    canManage &&
    isOrganizationUserRole(membership.role) &&
    canConfigureOrganizationRole(
      access.activeOrganization.role,
      membership.role,
      access.isSuperAdmin,
    );
  const canViewUserAccess=
    hasPermission(access,"VIEW_SETTINGS") &&
    hasPermission(access,"MANAGE_ROLE_PERMISSIONS");
  const authIdentity = canManage
    ? await createAdminClient().auth.admin.getUserById(membership.user_id)
    : null;
  const invitationEligible = canManage
    ? evaluateInvitationEligibility({
        organizationId: access.activeOrganization.id,
        membershipStatus: membership.status,
        targetHasActiveSuperAdminRole,
        authEmail: authIdentity?.data.user?.email,
        authEmailConfirmedAt: authIdentity?.data.user?.email_confirmed_at,
        authLastSignInAt: authIdentity?.data.user?.last_sign_in_at,
        actorIsSuperAdmin: access.isSuperAdmin,
        actorCanManageOrganization: canManage,
      })
    : false;

  const revokedWorkload =
    canManageTarget && membership.status === "REVOKED"
      ? await getOrganizationUserWorkload(
          access.activeOrganization.id,
          membership.user_id,
        )
      : null;

  const deletionEligibility =
    access.isSuperAdmin && membership.status === "REVOKED"
      ? await getPlatformUserDeletionEligibility(
          membership.user_id,
          membership.id,
        )
      : null;

  const [roleHistory, organizationSettings] = await Promise.all([
    getOrganizationUserRoleHistory(
      access.activeOrganization.id,
      membership.user_id,
    ),
    createAdminClient()
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", access.activeOrganization.id)
      .maybeSingle(),
  ]);

  const organizationTimezone =
    organizationSettings.data?.timezone || "UTC";

  return (
    <>
      <PageHeader
        eyebrow="Organization User"
        title={name}
        description={`Membership in ${access.activeOrganization.name}.`}
      />
      {query.message ? (
        <div className="success-alert page-notice">{query.message}</div>
      ) : null}
      {query.error ? (
        <div className="form-alert page-notice" role="alert">
          {query.error}
        </div>
      ) : null}
      <section className="panel detail-section">
        <div className="section-head">
          <span className="user-detail-identity">
            <UserAvatar
              displayName={profile?.display_name}
              email={profile?.email}
              src={profile?.avatarUrl}
              size="lg"
            />
            <span>
              <h2>{access.activeOrganization.name} Membership</h2>
              <p>Access applies only to this organization.</p>
            </span>
          </span>
          <span className="user-detail-actions">
            <Badge
              value={
                membership.status ??
                (membership.is_active ? "ACTIVE" : "SUSPENDED")
              }
            />
            {canManage ? (
              <OrganizationUserProfileEditor
                membershipId={membership.id}
                displayName={profile?.display_name ?? ""}
                title={profile?.title ?? ""}
                email={profile?.email ?? ""}
                hasAvatar={Boolean(profile?.avatar_path)}
              />
            ) : null}
          </span>
        </div>
        <dl className="detail-facts">
          <div>
            <dt>Display name</dt>
            <dd>{name}</dd>
          </div>
          <div>
            <dt>Title</dt>
            <dd>{profile?.title || "—"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{profile?.email ?? "—"}</dd>
          </div>
          <div>
            <dt>Organization role</dt>
            <dd>{membership.role.replaceAll("_", " ")}{canViewUserAccess?<small className="table-secondary"><Link href={`/settings/user-access?role=${membership.role}`}>View {membership.role.replaceAll("_"," ")} access <ApplicationIcon name="forward" /></Link></small>:null}</dd>
          </div>
          <div>
            <dt>Membership status</dt>
            <dd>
              {(membership.status ??
                (membership.is_active ? "ACTIVE" : "SUSPENDED")
              ).replaceAll("_", " ")}
            </dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{formatDate(membership.joined_at)}</dd>
          </div>
          <div>
            <dt>Last membership update</dt>
            <dd>{formatDate(membership.updated_at)}</dd>
          </div>
          <div>
            <dt>Membership ID</dt>
            <dd>{membership.id}</dd>
          </div>
          {canManage ? (
            <div>
              <dt>Invitation state</dt>
              <dd>
                {membership.status === "INVITED"
                  ? "Invitation pending"
                  : membership.status === "VERIFIED"
                    ? "Verified — awaiting activation"
                    : "—"}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
      <section className="panel detail-section">
        <div className="section-head">
          <div>
            <h2>Role History</h2>
            <p>Recorded organization role assignments and changes.</p>
          </div>
        </div>
        {roleHistory.length ? (
          <div className="role-history-list">
            {roleHistory.map((event) => (
              <article className="role-history-item" key={event.id}>
                <time dateTime={event.createdAt}>
                  {formatOrganizationDateTime(
                    event.createdAt,
                    organizationTimezone,
                  )}
                </time>
                <b>{roleHistoryChangeLabel(event)}</b>
                <span>
                  {roleHistoryEventDescription(event, access.isSuperAdmin)}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="no-results">
            No role history is available for this membership.
          </div>
        )}
      </section>

      {canManageTarget ? (
        <section className="panel detail-section">
          <div className="section-head">
            <div>
              <h2>Manage organization access</h2>
              <p>
                Change this membership only; platform identity access is managed
                separately.
              </p>
            </div>
          </div>
          <form
            action={updateOrganizationMembershipAction}
            className="mini-form"
          >
            <input type="hidden" name="membershipId" value={membership.id} />
            <label>
              <span>Role</span>
              <select name="role" defaultValue={membership.role}>
                {ORGANIZATION_USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button">Save role</button>
          </form>

          <div className="form-actions">
            {membership.status === "VERIFIED" ? (
              <form action={transitionOrganizationMembershipAction}>
                <input type="hidden" name="membershipId" value={membership.id} />
                <input type="hidden" name="action" value="ACTIVATE" />
                <PendingSubmitButton className="primary-button" pendingLabel="Activating…">
                  Activate User
                </PendingSubmitButton>
              </form>
            ) : null}

            {membership.status === "ACTIVE" ? (
              <form action={transitionOrganizationMembershipAction}>
                <input type="hidden" name="membershipId" value={membership.id} />
                <input type="hidden" name="action" value="SUSPEND" />
                <button className="secondary-button">Suspend access</button>
              </form>
            ) : null}

            {membership.status === "SUSPENDED" ? (
              <form action={transitionOrganizationMembershipAction}>
                <input type="hidden" name="membershipId" value={membership.id} />
                <input type="hidden" name="action" value="REACTIVATE" />
                <button className="secondary-button">Reactivate access</button>
              </form>
            ) : null}

            {membership.status !== "REVOKED" ? (
              <form action={transitionOrganizationMembershipAction}>
                <input type="hidden" name="membershipId" value={membership.id} />
                <input type="hidden" name="action" value="REVOKE" />
                <button className="secondary-button">Revoke access</button>
              </form>
            ) : null}
          </div>

          {invitationEligible ? (
            <div className="form-actions">
              <ResendInviteButton
                userId={membership.user_id}
                organizationId={access.activeOrganization.id}
              />
            </div>
          ) : null}
        </section>
      ) : null}
      {revokedWorkload ? (
        <section className="panel detail-section">
          <div className="section-head">
            <div>
              <h2>Reassign Work</h2>
              <p>
                Move current operational responsibility from this revoked user
                to an active user. Historical activity and attribution are preserved.
              </p>
            </div>
          </div>

          <dl className="detail-facts">
            <div>
              <dt>Open Cases</dt>
              <dd>{revokedWorkload.counts.cases}</dd>
            </div>
            <div>
              <dt>Incomplete Tasks</dt>
              <dd>{revokedWorkload.counts.tasks}</dd>
            </div>
            <div>
              <dt>Active Service Requests</dt>
              <dd>{revokedWorkload.counts.serviceRequests}</dd>
            </div>
          </dl>

          {revokedWorkload.assignees.length ? (
            <div className="revoked-user-work-grid">
              {[
                {
                  key: "CASES",
                  label: "Cases",
                  count: revokedWorkload.counts.cases,
                },
                {
                  key: "TASKS",
                  label: "Tasks",
                  count: revokedWorkload.counts.tasks,
                },
                {
                  key: "SERVICE_REQUESTS",
                  label: "Service Requests",
                  count: revokedWorkload.counts.serviceRequests,
                },
              ].map((work) => (
                <form
                  key={work.key}
                  action={reassignOrganizationUserWorkAction}
                  className="mini-form revoked-user-work-form"
                >
                  <input
                    type="hidden"
                    name="membershipId"
                    value={membership.id}
                  />
                  <input type="hidden" name="workType" value={work.key} />
                  <div>
                    <strong>{work.label}</strong>
                    <p className="table-secondary">
                      {work.count} current {work.count === 1 ? "item" : "items"}
                    </p>
                  </div>
                  <label>
                    <span>Reassign to</span>
                    <select
                      name="replacementUserId"
                      required
                      disabled={work.count === 0}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select active user
                      </option>
                      {revokedWorkload.assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <PendingSubmitButton
                    className="secondary-button"
                    pendingLabel="Reassigning…"
                    disabled={work.count === 0}
                  >
                    Reassign {work.label}
                  </PendingSubmitButton>
                </form>
              ))}
            </div>
          ) : (
            <div className="form-alert">
              No active organization users are currently available for reassignment.
            </div>
          )}

          {revokedWorkload.counts.cases === 0 &&
          revokedWorkload.counts.tasks === 0 &&
          revokedWorkload.counts.serviceRequests === 0 ? (
            <p className="muted">
              No current operational responsibility remains assigned to this user.
            </p>
          ) : null}
        </section>
      ) : null}

      {deletionEligibility ? (
        <section className="panel detail-section">
          <div className="section-head">
            <div>
              <h2>SUPER_ADMIN identity controls</h2>
              <p>
                Permanent deletion is available only when retained DM3Oi history
                does not require this identity.
              </p>
            </div>
          </div>
          <SuperAdminUserDelete
            userId={membership.user_id}
            membershipId={membership.id}
            organizationId={access.activeOrganization.id}
            displayName={name}
            email={profile?.email ?? ""}
            blockers={deletionEligibility.blockers}
            returnTo="/users"
          />
        </section>
      ) : null}

      <Link className="auth-link" href="/users">
        <ApplicationIcon name="back" />All users
      </Link>
    </>
  );
}
