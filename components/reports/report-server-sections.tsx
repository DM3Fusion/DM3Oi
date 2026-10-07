import {
  BusinessReach,
  OperationalReportsDashboard,
} from "@/components/reports/reports-dashboard";
import type {
  BusinessReachReport,
  OperationalReport,
  ReportSearchParams,
} from "@/lib/data/reports-repository";

type ReportsRouteParams = ReportSearchParams & { reach?: string };

export async function BusinessReachServerSection({
  businessReachPromise,
  searchParams,
}: {
  businessReachPromise: Promise<BusinessReachReport>;
  searchParams: Promise<ReportsRouteParams>;
}) {
  const [businessReach, params] = await Promise.all([
    businessReachPromise,
    searchParams,
  ]);

  return (
    <BusinessReach
      report={businessReach}
      routeState={params}
      status={params.reach}
    />
  );
}

export async function OperationalReportsServerSection({
  reportPromise,
}: {
  reportPromise: Promise<OperationalReport>;
}) {
  const report = await reportPromise;
  return <OperationalReportsDashboard report={report} />;
}
