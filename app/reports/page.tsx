/* eslint-disable react-hooks/purity -- Temporary server-only latency diagnostics require wall-clock measurements. */
import { PageHeader } from "@/components/ui";
import { ReportsDashboard } from "@/components/reports/reports-dashboard";
import { getBusinessReach, getOperationalReport, type ReportSearchParams } from "@/lib/data/reports-repository";

export const metadata = { title: "Reports" };

export default async function Page({ searchParams }: { searchParams: Promise<ReportSearchParams & { reach?: string }> }) {
  const pageStartedAt = performance.now();
  const searchParamsStartedAt = performance.now();
  const params = await searchParams;
  console.info("DM3Oi PERF", {
    route: "/reports",
    stage: "searchParams",
    durationMs: Math.round(performance.now() - searchParamsStartedAt),
  });
  const operationalReportStartedAt = performance.now();
  const report = await getOperationalReport(params);
  console.info("DM3Oi PERF", {
    route: "/reports",
    stage: "operationalReport",
    durationMs: Math.round(performance.now() - operationalReportStartedAt),
  });
  const businessReachStartedAt = performance.now();
  const businessReach = await getBusinessReach();
  console.info("DM3Oi PERF", {
    route: "/reports",
    stage: "businessReach",
    durationMs: Math.round(performance.now() - businessReachStartedAt),
  });
  console.info("DM3Oi PERF", {
    route: "/reports",
    stage: "total",
    durationMs: Math.round(performance.now() - pageStartedAt),
  });
  return <>
    <PageHeader eyebrow="Insights" title="Reports" />
    <ReportsDashboard report={report} businessReach={businessReach} reachStatus={params.reach} />
  </>;
}
