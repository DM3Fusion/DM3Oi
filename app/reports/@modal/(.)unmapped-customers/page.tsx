import { UnmappedCustomerLocations } from "@/components/reports/unmapped-customer-locations";
import { buildReportRouteHref, type ReportRouteState } from "@/lib/report-route-state";

export default async function UnmappedCustomerLocationsModalPage({
  searchParams,
}: {
  searchParams: Promise<ReportRouteState>;
}) {
  const state = await searchParams;
  return (
    <UnmappedCustomerLocations
      presentation="modal"
      returnHref={buildReportRouteHref("/reports", state)}
    />
  );
}
