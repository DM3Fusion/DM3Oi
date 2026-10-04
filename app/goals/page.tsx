import Link from "next/link";
import { ApplicationIcon } from "@/components/application-icon";
import { GoalFilters } from "@/components/goals/goal-filters";
import { NavigableRow } from "@/components/navigable-row";
import { Badge, PageHeader } from "@/components/ui";
import { getGoalsRegisterData } from "@/lib/data/goals-repository";
import {
  filterGoals,
  formatGoalValue,
  goalLifecycleStatuses,
  goalPerformance,
  goalPerformanceStates,
  goalPeriodKinds,
  goalPeriodLabel,
  goalScopes,
  type GoalFilters as FilterValues,
} from "@/lib/goals";

export const metadata = { title: "Goals" };

type Params = Partial<Record<"q" | "lifecycle" | "performance" | "scope" | "owner" | "period", string>>;
const allowed = (items: readonly string[], value?: string) => items.includes(value ?? "") ? value! : "";

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const [data, query] = await Promise.all([getGoalsRegisterData(), searchParams]);
  const filters: FilterValues = {
    q: (query.q ?? "").slice(0, 160),
    lifecycle: allowed(goalLifecycleStatuses, query.lifecycle),
    performance: allowed(goalPerformanceStates, query.performance),
    scope: allowed(goalScopes, query.scope),
    owner: data.canManage ? (query.owner ?? "") : "",
    period: allowed(goalPeriodKinds, query.period),
  };
  const goals = filterGoals(data.goals, filters, data.timezone);
  const owners = data.canManage
    ? [...new Map(data.goals.flatMap((goal) => goal.owner_user_id && goal.owner_display_name ? [[goal.owner_user_id, goal.owner_display_name] as const] : [])).entries()]
        .map(([userId, displayName]) => ({ userId, displayName }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName))
    : [];
  return <>
    <PageHeader eyebrow="Performance" title="Goals" description="Track measurable organization and individual outcomes." action={data.canManage ? <Link className="primary-button" href="/goals/new"><ApplicationIcon name="add" />New Goal</Link> : undefined} />
    <section className="panel goals-register">
      <GoalFilters values={filters} owners={owners} />
      <div className="table-meta"><span><b>{goals.length}</b> Goals</span><span>Manual performance outcomes</span></div>
      {goals.length ? <div className="table-scroll"><table><thead><tr><th>Goal</th><th>Scope / Owner</th><th>Period</th><th>Actual / Target</th><th>Performance</th><th>Lifecycle</th></tr></thead><tbody>{goals.map((goal) => {
        const performance = goalPerformance(goal, data.timezone);
        return <NavigableRow key={goal.id} href={`/goals/${goal.id}`} label={`Open Goal ${goal.goal_number}`}>
          <td><Link className="entity-row-link" href={`/goals/${goal.id}`}><b>{goal.goal_number}</b><span className="table-secondary">{goal.title}</span></Link></td>
          <td><b>{goal.ownership_scope === "ORGANIZATION" ? "Organization" : goal.owner_display_name}</b><span className="table-secondary">{goal.ownership_scope === "INDIVIDUAL" ? "Individual" : goal.metric_label}</span></td>
          <td>{goalPeriodLabel(goal)}<span className="table-secondary">{goal.period_kind}</span></td>
          <td><b>{formatGoalValue(goal.current_actual, goal.unit, goal.currency_code)} / {formatGoalValue(goal.target_value, goal.unit, goal.currency_code)}</b><span className="table-secondary">{goal.metric_label}</span></td>
          <td>{performance ? <Badge value={performance} /> : "—"}</td>
          <td><Badge value={goal.lifecycle_status} /></td>
        </NavigableRow>;
      })}</tbody></table></div> : <div className="no-results">{data.goals.length ? "No Goals match the current filters." : "No Goals have been created."}</div>}
    </section>
  </>;
}
