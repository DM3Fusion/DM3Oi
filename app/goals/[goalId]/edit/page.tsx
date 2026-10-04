import { GoalForm } from "@/components/goals/goal-form";
import { PageHeader } from "@/components/ui";
import { getGoalEditorData } from "@/lib/data/goals-repository";

export const metadata = { title: "Edit Goal" };

export default async function Page({ params, searchParams }: { params: Promise<{ goalId: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ goalId }, query] = await Promise.all([params, searchParams]);
  const data = await getGoalEditorData(goalId);
  return <><PageHeader eyebrow="Performance Goals" title={`Edit ${data.goal!.goal_number}`} description="Changes are revision-checked and retained in Goal history." />{query.error ? <div className="form-alert page-notice" role="alert">{query.error}</div> : null}<GoalForm goal={data.goal} owners={data.owners} /></>;
}
