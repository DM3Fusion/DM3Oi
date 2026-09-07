import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { canInviteOrganizationUsers } from "@/lib/auth/permissions";
import {
  inviteOrganizationUserAction,
} from "@/lib/data/user-invitation-actions";
import {
  assignableOrganizationUserRoles,
  organizationRoleLimit,
  type OrganizationUserRole,
} from "@/lib/data/user-provisioning";
import { createClient } from "@/lib/supabase/server";

export default async function NewOrganizationUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [access, query] = await Promise.all([getAccessContext(), searchParams]);
  const organization = access?.activeOrganization;
  if (
    !organization ||
    !canInviteOrganizationUsers(access)
  )
    notFound();

  const assignableRoles = assignableOrganizationUserRoles(
    organization.role as OrganizationUserRole,
  );
  const supabase = await createClient();
  const { data: activeMembers } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization.id)
    .eq("is_active", true);
  const roleCounts = new Map<OrganizationUserRole, number>();
  for (const member of activeMembers ?? []) {
    if (
      member.role === "BUSINESS_OWNER" ||
      member.role === "BUSINESS_ADMIN" ||
      member.role === "STAFF_MANAGER" ||
      member.role === "STAFF_USER"
    )
      roleCounts.set(member.role, (roleCounts.get(member.role) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        eyebrow="Organization"
        title="Add user"
        description={`Invite a user to ${organization.name}.`}
      />
      <section className="panel form-panel admin-form-panel">
        {query.error ? (
          <div className="form-alert" role="alert">
            {query.error}
          </div>
        ) : null}
        <form action={inviteOrganizationUserAction} className="entity-form">
          <div className="form-grid">
            <label>
              <span>First Name</span>
              <input name="firstName" autoComplete="given-name" maxLength={80} required />
            </label>
            <label>
              <span>Last Name</span>
              <input name="lastName" autoComplete="family-name" maxLength={80} required />
            </label>
            <label className="full">
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" maxLength={320} required />
            </label>
            <label className="full">
              <span>Role</span>
              <select name="role" defaultValue="STAFF_USER" required>
                {assignableRoles.map((role) => {
                  const limit = organizationRoleLimit(role);
                  const atCapacity = limit !== null && (roleCounts.get(role) ?? 0) >= limit;
                  return (
                    <option key={role} value={role} disabled={atCapacity}>
                      {role.replaceAll("_", " ")}
                      {atCapacity ? ` — limit of ${limit} reached` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
          <p className="form-help">
            DM3Oi will send an invitation to establish access. Organization role
            limits are enforced when the invitation is provisioned.
          </p>
          <div className="form-actions">
            <Link href="/users">Cancel</Link>
            <PendingSubmitButton className="primary-button" pendingLabel="Sending…">
              Send Invitation
            </PendingSubmitButton>
          </div>
        </form>
      </section>
    </>
  );
}
