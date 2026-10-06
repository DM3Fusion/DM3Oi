import { PageHeader } from "@/components/ui";
import { ReportsDashboard } from "@/components/reports/reports-dashboard";
import { getBusinessReach, getOperationalReport, type ReportSearchParams } from "@/lib/data/reports-repository";

export const metadata = { title: "Reports" };

export default async function Page({ searchParams }: { searchParams: Promise<ReportSearchParams & { reach?: string }> }) {
  const params = await searchParams;
  const report = await getOperationalReport(params);
  const businessReach = await getBusinessReach();
  return <>
    <PageHeader eyebrow="Insights" title="Reports" />
    <ReportsDashboard report={report} businessReach={businessReach} reachStatus={params.reach} />
  </>;
}
