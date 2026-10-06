import { PageHeader } from "@/components/ui";
import { ReportsDashboard } from "@/components/reports/reports-dashboard";
import { getBusinessReach, getOperationalReport, type ReportSearchParams } from "@/lib/data/reports-repository";
import { measureServerPerformance } from "@/lib/server-performance";

export const metadata = { title: "Reports" };

export default async function Page({ searchParams }: { searchParams: Promise<ReportSearchParams & { reach?: string }> }) {
  return measureServerPerformance("/reports", "page.total", async () => {
  const params = await measureServerPerformance(
    "/reports",
    "page.searchParams",
    () => searchParams,
  );
  const report = await measureServerPerformance(
    "/reports",
    "page.getOperationalReport",
    () => getOperationalReport(params),
  );
  const businessReach = await measureServerPerformance(
    "/reports",
    "page.getBusinessReach",
    () => getBusinessReach(),
  );
  return <>
    <PageHeader eyebrow="Insights" title="Reports" />
    <ReportsDashboard report={report} businessReach={businessReach} reachStatus={params.reach} />
  </>;
  });
}
