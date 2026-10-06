import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { getCustomerRegisterData } from "@/lib/data/case-repository";
import { NavigableRow } from "@/components/navigable-row";
import { formatPhone } from "@/lib/format-phone";
import { CustomerFilters } from "@/components/customer-filters";
import { customerMatchesFilters, normalizeCustomerQuery, normalizeCustomerStatus } from "@/lib/customer-filters";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { ApplicationIcon } from "@/components/application-icon";
import { isIncompleteCompatibilityCaseStatus } from "@/lib/case-lifecycle";
import { canSubmitCustomerData } from "@/lib/customer-data-submission-access";
export const metadata = { title: "Customers" };
export default async function Page({ searchParams }: { searchParams: Promise<{ message?: string; q?: string; status?: string }> }) {
  const [data, query, access] = await Promise.all([getCustomerRegisterData(), searchParams, getAccessContext()]);
  const q = normalizeCustomerQuery(query.q);
  const status = normalizeCustomerStatus(query.status);
  const customers = data.customers.filter((customer) => customerMatchesFilters(customer, q, status));
  const filtered = Boolean(q) || status !== "all";
  return (
    <>
      <PageHeader
        eyebrow="Relationships"
        title="Customers"
        action={
          canSubmitCustomerData(access) ? (
            <div className="page-header-actions">
              {/* A document navigation avoids the (.)[customerId] modal treating "import" as a Customer ID. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="secondary-button" href="/customers/import">
                Submit Customer Data
              </a>
              {hasPermission(access, "CREATE_CUSTOMER") ? (
                <Link className="primary-button" href="/customers/new">
                  <ApplicationIcon name="add" />New Customer
                </Link>
              ) : null}
            </div>
          ) : hasPermission(access, "CREATE_CUSTOMER") ? (
            <Link className="primary-button" href="/customers/new">
              <ApplicationIcon name="add" />New Customer
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
                  <NavigableRow key={customer.id} href={`/customers/${customer.id}`} label={`Open customer ${customer.customer_number}`} scroll={false}>
                    <td>
                      <Link className="entity-row-link case-link" href={`/customers/${customer.id}`} scroll={false} prefetch={false}>{customer.customer_number}</Link>
                    </td>
                    <td>
                      <Link className="entity-row-link" href={`/customers/${customer.id}`} scroll={false} prefetch={false}>{customer.name}</Link>
                    </td>
                    <td>{customer.type}</td>
                    <td>{customer.email ?? "—"}</td>
                    <td>{formatPhone(customer.phone)}</td>
                    <td>
                      <Badge value={customer.status} />
                    </td>
                    <td>{data.cases.filter((item) => item.customer_id === customer.id && isIncompleteCompatibilityCaseStatus(item.status)).length}</td>
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
              <ApplicationIcon name="add" />Create Customer
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
