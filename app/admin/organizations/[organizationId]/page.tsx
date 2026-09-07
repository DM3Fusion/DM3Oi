import Link from "next/link";
import { NavigableRow } from "@/components/navigable-row";
import { UserAvatar } from "@/components/user-avatar";
import { OrganizationAvatar } from "@/components/organization-avatar";
import { OrganizationAvatarUploadForm } from "@/components/organization-avatar-upload-form";
import { PageHeader, Badge } from "@/components/ui";
import {
  enterOrganizationWorkspaceAction,
  provisionMemberAction,
  updateMembershipAction,
} from "@/lib/data/platform-actions";
import { getOrganizationAdministration } from "@/lib/data/platform-repository";
import { LicenseForm } from "@/components/license-form";
import { effectiveLicense } from "@/lib/licensing";
import { OrganizationSummaryRow } from "@/components/organization-summary-row";
import { PlatformOrganizationDetailsForm } from "@/components/platform-organization-details-form";
const roles = [
  "BUSINESS_OWNER",
  "BUSINESS_ADMIN",
  "STAFF_MANAGER",
  "STAFF_USER",
] as const;
const runtimeYear = () => new Date().getUTCFullYear();
const runtimeNow = () => Date.now();
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const [{ organizationId }, query] = await Promise.all([params, searchParams]);
  const { organization, members, cases, customers } =
    await getOrganizationAdministration(organizationId);
  const license = organization.license;
  const effective = effectiveLicense(license && { status: license.license_status, commercialState: license.commercial_state, startsAt: license.starts_at, expiresAt: license.expires_at, graceEndsAt: license.grace_ends_at, noticeDays: license.notice_days });
  const drilldown = (query as { drilldown?: string }).drilldown;
  const year = Number((query as { year?: string }).year) || runtimeYear();
  const activity = (query as { activity?: string }).activity ?? "all";
  const terminal = ["COMPLETED", "CLOSED", "CANCELLED"];
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1);
  const activityStart = activity === "7" ? runtimeNow() - 7 * 86400000 : activity === "30" ? runtimeNow() - 30 * 86400000 : activity === "90" ? runtimeNow() - 90 * 86400000 : activity === "year" ? yearStart : 0;
  const inRange = (value: string) => (query as { year?: string }).year === "all" || (Date.parse(value) >= yearStart && Date.parse(value) < yearEnd);
  const activeCases = cases.filter((item) => !terminal.includes(item.status) && inRange(item.created_at) && (!activityStart || Date.parse(item.updated_at) >= activityStart));
  const filteredCustomers = customers.filter((item) => inRange(item.created_at) && (!activityStart || Date.parse(item.updated_at) >= activityStart));
  const years = [...new Set([...cases, ...customers].map((item) => new Date(item.created_at).getUTCFullYear()))].sort((a, b) => b - a);
  const openStatuses = [...new Set(cases.filter((item) => !terminal.includes(item.status)).map((item) => item.status))];
  const selectedStatus = (query as { status?: string }).status ?? "all";
  const displayedCases = selectedStatus === "all" ? activeCases : activeCases.filter((item) => item.status === selectedStatus);
  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title={<span className="organization-header-title"><a href="#organization-avatar" className="organization-avatar-link" aria-label="Manage organization avatar"><OrganizationAvatar name={organization.name} src={organization.avatarUrl} size="lg" /></a><span>{organization.name}</span></span>}
        description={`Organization administration · ${organization.slug}`}
        action={
          organization.status === "ACTIVE" ? (
            <form action={enterOrganizationWorkspaceAction}>
              <input
                type="hidden"
                name="organizationId"
                value={organization.id}
              />
              <button className="primary-button">Enter Workspace →</button>
            </form>
          ) : undefined
        }
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
              <h2>Organization details</h2>
              <p>ID: {organization.id}</p>
            </div>
            <Badge value={organization.status} />
          </div>
          <PlatformOrganizationDetailsForm
            organizationId={organization.id}
            initial={{
              name: organization.name,
              slug: organization.slug,
              status: organization.status,
            }}
            createdAt={new Date(organization.created_at).toLocaleString()}
            avatarAction={
              <OrganizationAvatarUploadForm
                organizationId={organization.id}
                hasAvatar={Boolean(organization.avatar_path)}
                showRemove={false}
              />
            }
          />
          <div id="organization-avatar" className="organization-avatar-panel">
            <OrganizationAvatar name={organization.name} src={organization.avatarUrl} size="md" />
            <div><strong>Organization avatar</strong><p>Private identity shown in the workspace.</p></div>
            <OrganizationAvatarUploadForm organizationId={organization.id} hasAvatar={Boolean(organization.avatar_path)} showUpload={false} />
          </div>
        </section>
        <aside className="panel detail-section admin-summary">
          <h2>Live summary</h2>
          <dl>
            <div>
              <dt>Active users</dt>
              <dd>{organization.activeUsers}</dd>
            </div>
            <div>
              <dt>Business owners</dt>
              <dd>{organization.businessOwners} / 2</dd>
            </div>
            <div>
              <dt>Business admins</dt>
              <dd>{organization.businessAdmins} / 2</dd>
            </div>
            <div><dt><OrganizationSummaryRow label="Customers" count={organization.customers} target="customers" selected={drilldown === "customers"} /></dt></div>
            <div><dt><OrganizationSummaryRow label="Open cases" count={organization.openCases} target="cases" selected={drilldown === "cases"} /></dt></div>
            <div><dt>Last activity</dt><dd>{organization.lastActivity ? new Date(organization.lastActivity).toLocaleString() : "No activity yet"}</dd></div>
          </dl>
          {drilldown ? <section id="organization-drilldown" className="organization-drilldown">
            <div className="section-head"><div><h3>{drilldown === "cases" ? "Open cases" : "Customers"}</h3><p>{drilldown === "cases" ? `${displayedCases.length} matching cases` : `${filteredCustomers.length} matching customers`}</p></div><Link href={`?`}>Close</Link></div>
            <form className="filters" method="get"><input type="hidden" name="drilldown" value={drilldown}/><select name="year" defaultValue={String((query as { year?: string }).year ?? year)}><option value={String(runtimeYear())}>This year</option>{years.filter((item) => item !== runtimeYear()).map((item) => <option key={item} value={item}>{item}</option>)}<option value="all">All years</option></select><select name="activity" defaultValue={activity}><option value="all">All activity</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="year">This calendar year</option></select>{drilldown === "cases" ? <select name="status" defaultValue={selectedStatus}><option value="all">All open statuses</option>{openStatuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select> : null}<button className="filter-button">Apply</button></form>
            <div className="table-scroll"><table><thead><tr>{drilldown === "cases" ? <><th>Case</th><th>Customer</th><th>Status</th><th>Last activity</th><th>Created</th></> : <><th>Customer</th><th>Contact</th><th>Last activity</th><th>Created</th></>}</tr></thead><tbody>{drilldown === "cases" ? displayedCases.map((item) => <tr key={item.id}><td>{item.case_number} · {item.title}</td><td>{customers.find((customer) => customer.id === item.customer_id)?.name ?? "—"}</td><td><Badge value={item.status}/></td><td>{new Date(item.updated_at).toLocaleString()}</td><td>{new Date(item.created_at).toLocaleDateString()}</td></tr>) : filteredCustomers.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.email || item.phone || "—"}</td><td>{new Date(item.updated_at).toLocaleString()}</td><td>{new Date(item.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>
            {((drilldown === "cases" && !displayedCases.length) || (drilldown !== "cases" && !filteredCustomers.length)) ? <div className="no-results">No matching {drilldown === "cases" ? "open cases" : "customers"} for this filter.</div> : null}
          </section> : null}
        </aside>
      </div>
      <section className="panel detail-section">
        <div className="section-head"><div><h2>License / Subscription</h2><p>Platform-managed entitlement and commercial state.</p></div><Badge value={effective.status} /></div>
        <LicenseForm organizationId={organization.id} license={license} />
      </section>
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Users / Access</h2>
            <p>
              Internal organization memberships. Public portal access is managed
              separately.
            </p>
          </div>
        </div>
        <details className="admin-provision">
          <summary>＋ Add User</summary>
          <form action={provisionMemberAction} className="mini-form">
            <input
              type="hidden"
              name="organizationId"
              value={organization.id}
            />
            <label>
              <span>Registered user email</span>
              <input type="email" name="email" required />
            </label>
            <label>
              <span>Organization role</span>
              <select name="role">
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <div className="mini-actions">
              <button>Provision User</button>
            </div>
          </form>
          <p>
            Provision an existing profile here, or{" "}
            <Link href="/admin/users/new">create and invite a new user</Link>.
          </p>
        </details>
        {members.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th>Change access</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <NavigableRow
                    key={m.id}
                    href={`/admin/users/${m.user_id}`}
                    label={`Open user ${m.profile.display_name || m.profile.email || "record"}`}
                  >
                    <td>
                      <span className="user-identity-cell"><UserAvatar displayName={m.profile.display_name} email={m.profile.email} src={m.profile.avatarUrl} size="sm"/><span><Link className="entity-row-link" href={`/admin/users/${m.user_id}`}>{m.profile.display_name || m.profile.email || "Unnamed user"}</Link><small className="table-secondary">{m.profile.email}</small></span></span>
                    </td>
                    <td>{m.role.replaceAll("_", " ")}</td>
                    <td>
                      <Badge value={m.is_active ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    <td>{new Date(m.joined_at).toLocaleDateString()}</td>
                    <td>
                      <form
                        action={updateMembershipAction}
                        className="membership-form"
                      >
                        <input
                          type="hidden"
                          name="organizationId"
                          value={organization.id}
                        />
                        <input type="hidden" name="membershipId" value={m.id} />
                        <select name="role" defaultValue={m.role}>
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {role.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                        <select
                          name="active"
                          defaultValue={String(m.is_active)}
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
            No organization users have been provisioned.
          </div>
        )}
      </section>
      <Link className="auth-link" href="/admin/organizations">
        ← All organizations
      </Link>
    </>
  );
}
