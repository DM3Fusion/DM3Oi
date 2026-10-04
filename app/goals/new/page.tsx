import { GoalForm } from "@/components/goals/goal-form";
import { PageHeader } from "@/components/ui";
import { getGoalEditorData } from "@/lib/data/goals-repository";

export const metadata = { title: "New Goal" };

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [data, query] = await Promise.all([getGoalEditorData(), searchParams]);
  return <><PageHeader eyebrow="Performance Goals" title="New Goal" description="Define a measurable outcome and its period." />{query.error ? <div className="form-alert page-notice" role="alert">{query.error}</div> : null}<GoalForm goal={data.goal} owners={data.owners} /></>;
}
