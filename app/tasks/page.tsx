import { Suspense } from "react";
import {
  KpiGridSkeleton,
  TableSkeleton,
  WorkloadCardsSkeleton,
} from "@/components/loading/route-skeletons";
import {
  resolveTasksRegisterModel,
  TaskKpisServerSection,
  TaskRegisterServerSection,
  TaskWorkloadServerSection,
  type TaskPageParams,
} from "@/components/tasks/tasks-page-sections";
import { PageHeader } from "@/components/ui";
import {
  getTaskRegisterData,
  getTaskRouteSummary,
} from "@/lib/data/case-repository";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<TaskPageParams>;
}) {
  const dataPromise = getTaskRegisterData();
  const summaryPromise = getTaskRouteSummary();
  const modelPromise = resolveTasksRegisterModel(
    dataPromise,
    summaryPromise,
    searchParams,
  );

  return (
    <>
      <PageHeader eyebrow="Staff Work" title="Tasks" />
      <Suspense fallback={<KpiGridSkeleton count={4} label="Loading Task summary" />}>
        <TaskKpisServerSection
          summaryPromise={summaryPromise}
          searchParams={searchParams}
        />
      </Suspense>
      <Suspense fallback={<WorkloadCardsSkeleton label="Loading Task workload" />}>
        <TaskWorkloadServerSection summaryPromise={summaryPromise} />
      </Suspense>
      <Suspense fallback={<TableSkeleton label="Loading Task register" />}>
        <TaskRegisterServerSection modelPromise={modelPromise} />
      </Suspense>
    </>
  );
}
