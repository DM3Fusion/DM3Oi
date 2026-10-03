import { PageHeader } from "@/components/ui";
import { SuperAdminCaseDelete } from "@/components/super-admin-case-delete";
import { getCustomerDataOrganizations } from "@/lib/data/customer-data-management-repository";
import { getOrganizationAdministration } from "@/lib/data/platform-repository";

export const metadata = { title: "Case Cleanup" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const params = await searchParams;
  const organizations = await getCustomerDataOrganizations();

  const selectedOrganization =
    organizations.find(
      (organization) => organization.id === params.organizationId,
    ) ?? null;

  let selected:
    | Awaited<ReturnType<typeof getOrganizationAdministration>>
    | null = null;

  if (selectedOrganization) {
    selected = await getOrganizationAdministration(selectedOrganization.id);
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform Operationsistration"
        title="Case Cleanup"
        description="SUPER_ADMIN-only permanent cleanup of selected test Cases."
      />

      <section className="panel detail-section">
        <div className="section-head">
          <div>
            <h2>Select Organization</h2>
            <p>
              Choose the organization whose test Cases you want to review.
            </p>
          </div>
        </div>

        <form method="get" className="filters">
          <select
            name="organizationId"
            defaultValue={selectedOrganization?.id ?? ""}
            aria-label="Organization"
          >
            <option value="">Select organization</option>

            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>

          <button className="filter-button">Load Cases</button>
        </form>
      </section>

      {selected ? (
        <section className="panel admin-danger-zone">
          <div className="section-head">
            <div>
              <span className="admin-danger-zone-label">Danger Zone</span>
              <h2>{selected.organization.name}</h2>
              <p>
                Permanently delete selected test Cases without deleting
                Customers, users, organization configuration, licensing,
                Questions &amp; Rules, or Case-number counters.
              </p>
            </div>
          </div>

          <SuperAdminCaseDelete
            organizationId={selected.organization.id}
            organizationName={selected.organization.name}
            cases={selected.cases.map((item) => ({
              id: item.id,
              caseNumber: item.case_number,
              title: item.title,
              status: item.status,
              customerName:
                selected.customers.find(
                  (customer) => customer.id === item.customer_id,
                )?.name ?? "Unknown customer",
            }))}
          />
        </section>
      ) : (
        <section className="panel detail-section">
          <div className="no-results">
            Select an organization to review its Cases.
          </div>
        </section>
      )}
    </>
  );
}
