import { UnmappedCustomerLocations } from "@/components/reports/unmapped-customer-locations";
import { buildReportRouteHref, type ReportRouteState } from "@/lib/report-route-state";

export const metadata = { title: "Unmapped Customer Locations" };

export default async function UnmappedCustomerLocationsPage({
  searchParams,
}: {
  searchParams: Promise<ReportRouteState>;
}) {
  const state = await searchParams;
  return (
    <UnmappedCustomerLocations
      presentation="page"
      returnHref={buildReportRouteHref("/reports", state)}
    />
  );
}
