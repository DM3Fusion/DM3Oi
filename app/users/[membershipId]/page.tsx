import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { ResendInviteButton } from "@/components/resend-invite-button";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { updateOrganizationMembershipAction } from "@/lib/data/organization-user-actions";
import { getInvitationEligibility } from "@/lib/data/user-invitation-actions";
import { ORGANIZATION_USER_ROLES } from "@/lib/data/user-provisioning";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getPlatformAdminUserIds } from "@/lib/data/platform-privacy";

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
      "id,user_id,role,is_active,joined_at,updated_at,profiles(id,email,display_name,avatar_path)",
    )
    .eq("id", membershipId)
    .eq("organization_id", access.activeOrganization.id)
    .maybeSingle();
  if (!membership) notFound();
  if((await getPlatformAdminUserIds()).has(membership.user_id))notFound();

  const profile = Array.isArray(membership.profiles)
    ? membership.profiles[0]
    : membership.profiles;
  const name = profile?.display_name || profile?.email || "Unnamed user";
  const canManage = hasPermission(access, "MANAGE_USERS");
  const canViewUserAccess=
    hasPermission(access,"VIEW_SETTINGS") &&
    hasPermission(access,"MANAGE_ROLE_PERMISSIONS");
  const invitationEligible = canManage
    ? await getInvitationEligibility(
        membership.user_id,
        access.activeOrganization.id,
      )
    : false;

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
              size="lg"
            />
            <span>
              <h2>Organization membership</h2>
              <p>Access applies only to the active organization.</p>
            </span>
          </span>
          <Badge value={membership.is_active ? "ACTIVE" : "INACTIVE"} />
        </div>
        <dl className="detail-facts">
          <div>
            <dt>Display name</dt>
            <dd>{name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{profile?.email ?? "—"}</dd>
          </div>
          <div>
            <dt>Organization role</dt>
            <dd>{membership.role.replaceAll("_", " ")}{canViewUserAccess?<small className="table-secondary"><Link href={`/settings/user-access?role=${membership.role}`}>View {membership.role.replaceAll("_"," ")} access →</Link></small>:null}</dd>
          </div>
          <div>
            <dt>Membership status</dt>
            <dd>{membership.is_active ? "Active" : "Inactive"}</dd>
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
                {invitationEligible
                  ? "Pending invitation"
                  : "No invitation action required"}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
      {canManage ? (
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
            <label>
              <span>Status</span>
              <select name="active" defaultValue={String(membership.is_active)}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
            <button className="primary-button">Save access</button>
          </form>
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
      <Link className="auth-link" href="/users">
        ← All users
      </Link>
    </>
  );
}
