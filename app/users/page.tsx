import { PageHeader, Badge } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";
import { ResendInviteButton } from "@/components/resend-invite-button";
import { requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getInvitationEligibility } from "@/lib/data/user-invitation-actions";
import { UrlSearch } from "@/components/question-search";
import { normalizeUserQuery, userMatchesSearch } from "@/lib/user-filters";
import { NavigableRow } from "@/components/navigable-row";
import Link from "next/link";
import { getPlatformAdminUserIds } from "@/lib/data/platform-privacy";
import { attachAvatarUrls } from "@/lib/data/avatar-urls";
const requireInternalContext = () => requirePermission("VIEW_USERS");
/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { activeOrganization: org } = await requireInternalContext();
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("organization_members")
    .select(
      "id,user_id,role,is_active,joined_at,profiles(id,email,display_name,avatar_path,avatar_updated_at)",
    )
    .eq("organization_id", org.id)
    .order("joined_at");
  const query = await searchParams;
  const platformAdminIds=await getPlatformAdminUserIds();
  const q = normalizeUserQuery(query.q);
  const rows = (members ?? []).filter((member) => !platformAdminIds.has(member.user_id)&&userMatchesSearch(member, q));
  const avatarProfiles = await attachAvatarUrls(
    supabase,
    rows.flatMap((member: any) => {
      const profile = Array.isArray(member.profiles)
        ? member.profiles[0]
        : member.profiles;
      return profile ? [profile] : [];
    }),
  );
  const profilesById = new Map(
    avatarProfiles.map((profile) => [profile.id, profile]),
  );
  const eligible = await Promise.all(
    rows.map(
      async (m) =>
        [m.user_id, await getInvitationEligibility(m.user_id, org.id)] as const,
    ),
  );
  return (
    <>
      <PageHeader
        eyebrow="Organization"
        title="Users"
        description="Manage the people who serve customers and complete case work."
      />
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
                </tr>
              </thead>
              <tbody>
                {rows.map((m: any) => {
                  const membershipProfile = Array.isArray(m.profiles)
                    ? m.profiles[0]
                    : m.profiles;
                  const profile = membershipProfile
                    ? profilesById.get(membershipProfile.id) ?? membershipProfile
                    : null;
                  const name =
                    profile?.display_name || profile?.email || "Unnamed user";
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
                            <small className="table-secondary">
                              {profile?.email}
                            </small>
                          </span>
                        </span>
                      </td>
                      <td>{m.role.replaceAll("_", " ")}</td>
                      <td>
                        <Badge value={m.is_active ? "ACTIVE" : "INACTIVE"} />
                      </td>
                      <td>
                        {eligible.find(([id]) => id === m.user_id)?.[1] ? (
                          <ResendInviteButton
                            userId={m.user_id}
                            organizationId={org.id}
                          />
                        ) : (
                          "—"
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
