import { PageHeader } from "@/components/ui";
import { ReportsDashboard } from "@/components/reports/reports-dashboard";
import { getOperationalReport, type ReportSearchParams } from "@/lib/data/reports-repository";

export const metadata = { title: "Reports" };

export default async function Page({ searchParams }: { searchParams: Promise<ReportSearchParams> }) {
  const report = await getOperationalReport(await searchParams);
  return <>
    <PageHeader eyebrow="Insights" title="Reports" description="Historical operational performance, trends, and comparisons." />
    <ReportsDashboard report={report} />
  </>;
}
