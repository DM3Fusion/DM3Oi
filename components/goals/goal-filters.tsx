import type { GoalFilters as Values, GoalLifecycle, GoalPerformance, GoalScope, GoalPeriodKind } from "@/lib/goals";
import type { GoalOwnerOption } from "@/lib/data/goals-repository";

export function GoalFilters({ values, owners }: { values: Values; owners: GoalOwnerOption[] }) {
  return <form className="filters goal-filters" method="get">
    <label className="search"><span className="sr-only">Search Goals</span><input name="q" defaultValue={values.q} placeholder="Search Goals" /></label>
    <select aria-label="Lifecycle" name="lifecycle" defaultValue={values.lifecycle}><option value="">All lifecycle states</option>{(["DRAFT","ACTIVE","COMPLETED","CANCELLED"] satisfies GoalLifecycle[]).map((item) => <option key={item}>{item}</option>)}</select>
    <select aria-label="Performance" name="performance" defaultValue={values.performance}><option value="">All performance states</option>{(["NOT_STARTED","ON_TRACK","AT_RISK","ACHIEVED","MISSED"] satisfies GoalPerformance[]).map((item) => <option key={item}>{item}</option>)}</select>
    <select aria-label="Scope" name="scope" defaultValue={values.scope}><option value="">All scopes</option>{(["ORGANIZATION","INDIVIDUAL"] satisfies GoalScope[]).map((item) => <option key={item}>{item}</option>)}</select>
    {owners.length ? <select aria-label="Owner" name="owner" defaultValue={values.owner}><option value="">All owners</option>{owners.map((owner) => <option key={owner.userId} value={owner.userId}>{owner.displayName}</option>)}</select> : null}
    <select aria-label="Period" name="period" defaultValue={values.period}><option value="">All periods</option>{(["MONTHLY","QUARTERLY","ANNUAL","CUSTOM"] satisfies GoalPeriodKind[]).map((item) => <option key={item}>{item}</option>)}</select>
    <button className="secondary-button" type="submit">Apply</button>
  </form>;
}
