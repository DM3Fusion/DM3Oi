import { Suspense } from "react";
import { ReportSectionSkeleton } from "@/components/loading/route-skeletons";
import {
  BusinessReachServerSection,
  OperationalReportsServerSection,
} from "@/components/reports/report-server-sections";
import { PageHeader } from "@/components/ui";
import {
  getBusinessReach,
  getOperationalReport,
  type ReportSearchParams,
} from "@/lib/data/reports-repository";

export const metadata = { title: "Reports" };

type ReportsRouteParams = ReportSearchParams & { reach?: string };

export default function Page({
  searchParams,
}: {
  searchParams: Promise<ReportsRouteParams>;
}) {
  const reportPromise = searchParams.then((params) =>
    getOperationalReport(params),
  );
  const businessReachPromise = getBusinessReach();

  return (
    <>
      <PageHeader eyebrow="Insights" title="Reports" />
      <div className="reports-dashboard">
        <Suspense
          fallback={
            <ReportSectionSkeleton label="Loading Business Reach" compact />
          }
        >
          <BusinessReachServerSection
            businessReachPromise={businessReachPromise}
            searchParams={searchParams}
          />
        </Suspense>
        <Suspense
          fallback={
            <ReportSectionSkeleton label="Loading operational reports" />
          }
        >
          <OperationalReportsServerSection reportPromise={reportPromise} />
        </Suspense>
      </div>
    </>
  );
}
