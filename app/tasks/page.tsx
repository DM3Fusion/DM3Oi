import { Suspense } from "react";
import { TasksBodySkeleton } from "@/components/loading/route-skeletons";
import {
  resolveTasksPageModel,
  TaskKpisServerSection,
  TaskRegisterServerSection,
  TaskWorkloadServerSection,
  type TaskPageParams,
} from "@/components/tasks/tasks-page-sections";
import { PageHeader } from "@/components/ui";
import { getTaskRegisterData } from "@/lib/data/case-repository";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<TaskPageParams>;
}) {
  const dataPromise = getTaskRegisterData();
  const modelPromise = resolveTasksPageModel(dataPromise, searchParams);

  return (
    <>
      <PageHeader eyebrow="Staff Work" title="Tasks" />
      <Suspense fallback={<TasksBodySkeleton />}>
        <TaskKpisServerSection modelPromise={modelPromise} />
        <TaskWorkloadServerSection modelPromise={modelPromise} />
        <TaskRegisterServerSection modelPromise={modelPromise} />
      </Suspense>
    </>
  );
}
