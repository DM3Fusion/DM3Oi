import { Suspense } from "react";
import {
  CaseKpisServerSection,
  CaseRegisterServerSection,
  CasesHeaderServerSection,
  CaseWorkloadServerSection,
  resolveCasesRegisterModel,
  type CasePageParams,
} from "@/components/cases/cases-page-sections";
import {
  KpiGridSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
  WorkloadCardsSkeleton,
} from "@/components/loading/route-skeletons";
import { getAccessContext } from "@/lib/auth/context";
import {
  getCaseRouteSummary,
  getCasesRegisterData,
} from "@/lib/data/case-repository";

export const metadata = { title: "Cases" };

export default function Page({
  searchParams,
}: {
  searchParams: Promise<CasePageParams>;
}) {
  const dataPromise = getCasesRegisterData(searchParams);
  const summaryPromise = getCaseRouteSummary();
  const modelPromise = resolveCasesRegisterModel(dataPromise, searchParams);
  const accessPromise = getAccessContext();

  return (
    <>
      <Suspense fallback={<PageHeaderSkeleton label="Loading Cases heading" />}>
        <CasesHeaderServerSection
          summaryPromise={summaryPromise}
          accessPromise={accessPromise}
        />
      </Suspense>
      <Suspense fallback={<KpiGridSkeleton label="Loading Case summary" />}>
        <CaseKpisServerSection
          summaryPromise={summaryPromise}
          searchParams={searchParams}
        />
      </Suspense>
      <Suspense fallback={<WorkloadCardsSkeleton label="Loading Case workload" />}>
        <CaseWorkloadServerSection summaryPromise={summaryPromise} />
      </Suspense>
      <Suspense fallback={<TableSkeleton label="Loading Case register" />}>
        <CaseRegisterServerSection modelPromise={modelPromise} />
      </Suspense>
    </>
  );
}
