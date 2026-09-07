import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { getLiveOrganizationData } from "@/lib/data/case-repository";
import { NavigableRow } from "@/components/navigable-row";
import { formatPhone } from "@/lib/format-phone";
import { CustomerFilters } from "@/components/customer-filters";
import { customerMatchesFilters, normalizeCustomerQuery, normalizeCustomerStatus } from "@/lib/customer-filters";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
export const metadata = { title: "Customers" };
export default async function Page({ searchParams }: { searchParams: Promise<{ message?: string; q?: string; status?: string }> }) {
  const [data, query, access] = await Promise.all([getLiveOrganizationData(), searchParams, getAccessContext()]);
  const q = normalizeCustomerQuery(query.q);
  const status = normalizeCustomerStatus(query.status);
  const customers = data.customers.filter((customer) => customerMatchesFilters(customer, q, status));
  const filtered = Boolean(q) || status !== "all";
  return (
    <>
      <PageHeader
        eyebrow="Relationships"
        title="Customers"
        description="Live customer records for the active organization."
        action={
          hasPermission(access, "CREATE_CUSTOMER") ? (
            <Link className="primary-button" href="/customers/new">
              ＋ New Customer
            </Link>
          ) : undefined
        }
      />
      {query.message ? <div className="success-alert page-notice">{query.message}</div> : null}
      <CustomerFilters q={q} status={status} />
      <section className="panel">
        {customers.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Customer Number</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Open Cases</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <NavigableRow key={customer.id} href={`/customers/${customer.id}`} label={`Open customer ${customer.customer_number}`}>
                    <td>
                      <b className="case-link">{customer.customer_number}</b>
                    </td>
                    <td>
                      <b>{customer.name}</b>
                    </td>
                    <td>{customer.type}</td>
                    <td>{customer.email ?? "—"}</td>
                    <td>{formatPhone(customer.phone)}</td>
                    <td>
                      <Badge value={customer.status} />
                    </td>
                    <td>{data.cases.filter((item) => item.customer_id === customer.id && !["COMPLETED", "CLOSED", "CANCELLED"].includes(item.status)).length}</td>
                  </NavigableRow>
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered ? (
          <div className="no-results">No customers match the current filters.</div>
        ) : (
          <div className="empty compact-empty">
            <h2>No customers yet</h2>
            <p>Create the first customer before opening case work.</p>
            <Link className="primary-button" href="/customers/new">
              Create Customer
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
