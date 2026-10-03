import Link from "next/link";
import { ApplicationIcon } from "@/components/application-icon";
import { ReportRouteModal } from "@/components/reports/report-route-modal";
import { PageHeader } from "@/components/ui";
import { getBusinessReachUnmappedCustomers } from "@/lib/data/reports-repository";

const title = "Unmapped Customer Locations";
const description = "Active customer service addresses that are awaiting mapping or could not be matched.";

const locality = (city: string | null, state: string | null, postalCode: string | null) => {
  const cityState = [city, state].filter(Boolean).join(", ");
  return [cityState, postalCode].filter(Boolean).join(" ") || "—";
};

export async function UnmappedCustomerLocations({
  presentation,
  returnHref,
}: {
  presentation: "modal" | "page";
  returnHref: string;
}) {
  const result = await getBusinessReachUnmappedCustomers();
  const content = result.loadError ? (
    <div className="no-results">Unmapped customer locations are temporarily unavailable.</div>
  ) : result.customers.length ? (
    <div className="business-reach-unmapped-list" role="table" aria-label="Active customers without mapped locations">
      <div className="business-reach-unmapped-head" role="row">
        <span role="columnheader">Customer</span>
        <span role="columnheader">Service Address</span>
        <span role="columnheader">Mapping Status</span>
      </div>
      {result.customers.map((customer) => (
        <div className="business-reach-unmapped-row" role="row" key={customer.customerId}>
          <div role="cell" data-label="Customer">
            <Link href={`/customers/${customer.customerId}`} prefetch={false}>
              <strong>{customer.customerNumber}</strong>
              <span>{customer.customerName}</span>
            </Link>
          </div>
          <div role="cell" data-label="Service Address">
            <strong>{customer.streetAddress || "—"}</strong>
            <span>{locality(customer.city, customer.state, customer.postalCode)}</span>
          </div>
          <div role="cell" data-label="Mapping Status">
            <span className={`badge business-reach-mapping-${customer.mappingStatus.toLowerCase()}`}>
              {customer.mappingStatus === "PENDING" ? "Awaiting mapping" : "Address not matched"}
            </span>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="no-results">All active customer locations are currently mapped.</div>
  );

  if (presentation === "modal") {
    return <ReportRouteModal title={title} description={description}>{content}</ReportRouteModal>;
  }

  return (
    <>
      <PageHeader eyebrow="Business Reach" title={title} description={description} />
      <section className="panel business-reach-unmapped-page">{content}</section>
      <Link className="auth-link" href={returnHref}>
        <ApplicationIcon name="back" />Back to Reports
      </Link>
    </>
  );
}
