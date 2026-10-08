import { PageHeader, Badge } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { ResendInviteButton } from "@/components/resend-invite-button";
import { requirePermission } from "@/lib/auth/context";
import { canInviteOrganizationUsers } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateInvitationEligibility } from "@/lib/data/invitation-eligibility";
import { UrlSearch } from "@/components/question-search";
import { normalizeUserQuery, userMatchesSearch } from "@/lib/user-filters";
import { NavigableRow } from "@/components/navigable-row";
import Link from "next/link";
import { getPlatformAdminUserIds } from "@/lib/data/platform-privacy";
import { attachAuthorizedAvatarUrls } from "@/lib/data/avatar-urls";
import { hasPermission } from "@/lib/auth/permissions";
import { canConfigureOrganizationRole } from "@/lib/auth/organization-permissions";
import { transitionOrganizationMembershipAction } from "@/lib/data/organization-user-actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { organizationUserDisplayName } from "@/lib/data/pending-invite-identity";
const requireInternalContext = () => requirePermission("VIEW_USERS");
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; message?: string; error?: string }>;
}) {
  const context = await requireInternalContext();
  const { activeOrganization: org } = context;
  const canAddUser = canInviteOrganizationUsers(context);
  const canManageUsers = hasPermission(context, "MANAGE_USERS");
  const supabase = await createClient();
  const { data: organizationSettings } = await supabase
    .from("organization_settings")
    .select("timezone")
    .eq("organization_id", org.id)
    .maybeSingle();
  const organizationTimezone = organizationSettings?.timezone || "UTC";

  const formatTimestamp = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: organizationTimezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));

  const { data: members } = await supabase
    .from("organization_members")
    .select(
      "id,user_id,role,is_active,status,joined_at,invited_at,verified_at,profiles(id,email,first_name,last_name,display_name,title,avatar_path,avatar_updated_at)",
    )
    .eq("organization_id", org.id)
    .order("joined_at");
  const query = await searchParams;
  const platformAdminIds=await getPlatformAdminUserIds();
  const q = normalizeUserQuery(query.q);
  const rows = (members ?? []).filter((member) => !platformAdminIds.has(member.user_id)&&userMatchesSearch(member, q));
  const avatarProfiles = await attachAuthorizedAvatarUrls(
    rows.flatMap((member) => {
      const profile = Array.isArray(member.profiles)
        ? member.profiles[0]
        : member.profiles;
      return profile ? [profile] : [];
    }),
  );
  const profilesById = new Map(
    avatarProfiles.map((profile) => [profile.id, profile]),
  );

  const admin = createAdminClient();
  const authUsers = await Promise.all(
    rows.map(async (member) => {
      const { data, error } = await admin.auth.admin.getUserById(member.user_id);
      return [
        member.user_id,
        error || !data.user
          ? null
          : {
              email: data.user.email ?? null,
              emailConfirmedAt: data.user.email_confirmed_at ?? null,
              lastSignInAt: data.user.last_sign_in_at ?? null,
            },
      ] as const;
    }),
  );
  const authByUserId = new Map(authUsers);

  const eligible = new Map(
    rows.map((member) => {
      const authUser = authByUserId.get(member.user_id);
      return [
        member.user_id,
        evaluateInvitationEligibility({
          organizationId: org.id,
          membershipStatus: member.status,
          targetHasActiveSuperAdminRole: platformAdminIds.has(member.user_id),
          authEmail: authUser?.email,
          authEmailConfirmedAt: authUser?.emailConfirmedAt,
          authLastSignInAt: authUser?.lastSignInAt,
          actorIsSuperAdmin: context.isSuperAdmin,
          actorCanManageOrganization: canManageUsers,
        }),
      ] as const;
    }),
  );
  return (
    <>
      <PageHeader
        eyebrow="Organization"
        title="Users"
        action={
          canAddUser ? (
            <Link className="primary-button" href="/users/new">
              + Add User
            </Link>
          ) : undefined
        }
      />
      {query.message ? (
        <div className="success-alert page-notice">{query.message}</div>
      ) : null}
      {query.error ? (
        <div className="form-alert page-notice" role="alert">{query.error}</div>
      ) : null}
      <UrlSearch
        q={q}
        label="Search organization users"
        placeholder="Search users..."
        clearLabel="Clear user search"
      />
      <section className="panel">
        {q && !rows.length ? (
          <div className="no-results">No users match the current search.</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Invitation</th>
                  <th>Last Login</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const membershipProfile = Array.isArray(m.profiles)
                    ? m.profiles[0]
                    : m.profiles;
                  const profile = membershipProfile
                    ? profilesById.get(membershipProfile.id) ?? membershipProfile
                    : null;
                  const name = organizationUserDisplayName(profile ?? {});
                  const canActivate =
                    m.status === "VERIFIED" &&
                    canManageUsers &&
                    m.role !== "SUPER_ADMIN" &&
                    canConfigureOrganizationRole(
                      org.role,
                      m.role,
                      context.isSuperAdmin,
                    );

                  const invitationState = m.verified_at
                    ? {
                        label: "Invitation Verified",
                        timestamp: m.verified_at,
                      }
                    : m.invited_at
                      ? {
                          label: "Invitation Sent",
                          timestamp: m.invited_at,
                        }
                      : null;

                  const lastLogin =
                    authByUserId.get(m.user_id)?.lastSignInAt ?? null;

                  return (
                    <NavigableRow
                      key={m.id}
                      href={`/users/${m.id}`}
                      label={`Open organization user ${name}`}
                    >
                      <td>
                        <span className="user-identity-cell">
                          <UserAvatar
                            displayName={profile?.display_name}
                            email={profile?.email}
                            src={profile?.avatarUrl}
                            size="sm"
                          />
                          <span>
                            <Link
                              className="entity-row-link"
                              href={`/users/${m.id}`}
                            >
                              {name}
                            </Link>
                            {profile?.title ? (
                              <small className="table-secondary">
                                {profile.title}
                              </small>
                            ) : null}
                            <small className="table-secondary">
                              {profile?.email}
                            </small>
                          </span>
                        </span>
                      </td>
                      <td>{m.role.replaceAll("_", " ")}</td>
                      <td>
                        <Badge value={m.status ?? (m.is_active ? "ACTIVE" : "SUSPENDED")} />
                      </td>
                      <td>
                        <span className="user-invitation-state">
                          {invitationState ? (
                            <>
                              <strong>{invitationState.label}</strong>
                              <small className="table-secondary">
                                {formatTimestamp(invitationState.timestamp)}
                              </small>
                            </>
                          ) : (
                            <span>—</span>
                          )}

                          {m.status === "INVITED" &&
                          eligible.get(m.user_id) ? (
                            <ResendInviteButton
                              userId={m.user_id}
                              organizationId={org.id}
                            />
                          ) : canActivate ? (
                            <form action={transitionOrganizationMembershipAction}>
                              <input type="hidden" name="membershipId" value={m.id} />
                              <input type="hidden" name="action" value="ACTIVATE" />
                              <input type="hidden" name="returnTo" value="/users" />
                              <PendingSubmitButton
                                className="primary-button"
                                pendingLabel="Activating…"
                                aria-label={`Activate ${name}`}
                              >
                                Activate
                              </PendingSubmitButton>
                            </form>
                          ) : null}
                        </span>
                      </td>
                      <td>
                        {lastLogin ? (
                          <span className="table-secondary user-last-login">
                            {formatTimestamp(lastLogin)}
                          </span>
                        ) : (
                          "Never"
                        )}
                      </td>
                    </NavigableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
