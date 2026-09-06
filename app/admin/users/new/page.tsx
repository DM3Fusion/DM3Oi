import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getPlatformAdministration } from "@/lib/data/platform-repository";
import { inviteUserAction } from "@/lib/data/user-invitation-actions";

const roles = [
  "BUSINESS_OWNER",
  "BUSINESS_ADMIN",
  "STAFF_MANAGER",
  "STAFF_USER",
] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ organizations }, query] = await Promise.all([
    getPlatformAdministration(),
    searchParams,
  ]);
  const activeOrganizations = organizations.filter(
    (organization) => organization.status === "ACTIVE",
  );
  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title="Create user"
        description="Invite a DM3Oi user and optionally provision initial organization access."
      />
      <section className="panel form-panel admin-form-panel">
        {query.error ? <div className="form-alert">{query.error}</div> : null}
        <form action={inviteUserAction} className="entity-form">
          <div className="form-grid">
            <label>
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              <span>Display name</span>
              <input
                name="displayName"
                autoComplete="name"
                required
                maxLength={160}
              />
            </label>
            <label>
              <span>
                Initial organization <small>Optional</small>
              </span>
              <select name="organizationId" defaultValue="">
                <option value="">None — Pending Access</option>
                {activeOrganizations.map((organization) => (
                  <option value={organization.id} key={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Initial organization role</span>
              <select name="role" defaultValue="STAFF_USER">
                {roles.map((role) => (
                  <option value={role} key={role}>
                    {role.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <small>Used only when an organization is selected.</small>
            </label>
            <label>
              <span>Profile state</span>
              <select name="active" defaultValue="true">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input name="sendInvitation" type="checkbox" defaultChecked />
              <span>Send invitation / activation email</span>
            </label>
          </div>
          <p className="form-help">
            Existing users are not duplicated. Select an organization to add
            access to an existing profile. Role caps remain enforced by the
            database.
          </p>
          <div className="form-actions">
            <Link href="/admin/users">Cancel</Link>
            <button className="primary-button">Create User</button>
          </div>
        </form>
      </section>
    </>
  );
}
