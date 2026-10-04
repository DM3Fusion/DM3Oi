import Link from "next/link";
import { ApplicationIcon } from "@/components/application-icon";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Badge, PageHeader } from "@/components/ui";
import { recordGoalProgressAction, transitionGoalAction } from "@/lib/data/goal-actions";
import { getGoalDetailData } from "@/lib/data/goals-repository";
import {
  formatGoalValue,
  goalHistoryChangeDetails,
  goalPerformance,
  goalPeriodLabel,
  goalProgressPercentage,
  goalTargetSatisfied,
  organizationDateKey,
} from "@/lib/goals";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";

const words = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export default async function Page({ params, searchParams }: { params: Promise<{ goalId: string }>; searchParams: Promise<{ message?: string; error?: string }> }) {
  const [{ goalId }, query] = await Promise.all([params, searchParams]);
  const data = await getGoalDetailData(goalId);
  const { goal } = data;
  const performance = goalPerformance(goal, data.timezone);
  const progressPercentage = goalProgressPercentage(goal);
  const today = organizationDateKey(new Date(), data.timezone);
  const defaultAsOfDate = today > goal.period_end ? goal.period_end : today;
  const targetSatisfied = goal.current_actual !== null && goalTargetSatisfied(goal.measurement_direction, goal.current_actual, goal.target_value);
  const canComplete = goal.lifecycle_status === "ACTIVE" && (today > goal.period_end || targetSatisfied);
  const correctionOptions = data.progress.filter((entry) => !entry.is_superseded);
  return <>
    <PageHeader eyebrow="Performance Goal" title={goal.title} description={`${goal.goal_number} · ${goal.metric_label}`} action={data.canManage && !["COMPLETED","CANCELLED"].includes(goal.lifecycle_status) ? <Link className="primary-button" href={`/goals/${goal.id}/edit`}>Edit Goal</Link> : undefined} />
    {query.message ? <div className="success-alert page-notice">{query.message}</div> : null}
    {query.error ? <div className="form-alert page-notice" role="alert">{query.error}</div> : null}
    <section className="panel detail-section goal-overview">
      <div className="section-head"><div><h2>Goal Definition</h2><p>{goal.description || "No description provided."}</p></div><div className="detail-badges">{performance ? <Badge value={performance} /> : null}<Badge value={goal.lifecycle_status} /></div></div>
      <dl className="detail-facts goal-detail-facts">
        <div><dt>Scope / Owner</dt><dd>{goal.ownership_scope === "ORGANIZATION" ? "Organization" : goal.owner_display_name}</dd></div>
        <div><dt>Period</dt><dd>{goalPeriodLabel(goal)} · {words(goal.period_kind)}</dd></div>
        <div><dt>Direction</dt><dd>{words(goal.measurement_direction)}</dd></div>
        <div><dt>Unit</dt><dd>{words(goal.unit)}{goal.currency_code ? ` · ${goal.currency_code}` : ""}</dd></div>
        <div><dt>Baseline</dt><dd>{formatGoalValue(goal.baseline_value, goal.unit, goal.currency_code)}</dd></div>
        <div><dt>Current actual</dt><dd>{formatGoalValue(goal.current_actual, goal.unit, goal.currency_code)}</dd></div>
        <div><dt>Target</dt><dd>{formatGoalValue(goal.target_value, goal.unit, goal.currency_code)}</dd></div>
        <div><dt>Progress</dt><dd>{progressPercentage === null ? "Not mathematically available" : `${progressPercentage.toFixed(1)}%`}</dd></div>
        <div><dt>Performance</dt><dd>{performance ? words(performance) : "Excluded — cancelled"}</dd></div>
        <div><dt>Revision</dt><dd>{goal.revision}</dd></div>
      </dl>
      {progressPercentage !== null ? <div className="goal-progress-visual" aria-label={`${progressPercentage.toFixed(1)} percent progress`}><span style={{ width: `${progressPercentage}%` }} /></div> : null}
    </section>

    {data.canUpdateProgress && goal.lifecycle_status === "ACTIVE" && today >= goal.period_start ? <section className="panel detail-section"><div className="section-head"><div><h2>Record Progress</h2><p>Add an immutable manual actual or correct an existing entry.</p></div></div><form action={recordGoalProgressAction} className="mini-form goal-progress-form"><input type="hidden" name="goalId" value={goal.id} /><input type="hidden" name="expectedRevision" value={goal.revision} /><input type="hidden" name="unit" value={goal.unit} /><label><span>Actual value</span><input name="actualValue" inputMode="decimal" pattern={goal.unit === "COUNT" ? "-?[0-9]+" : "-?[0-9]+(?:\\.[0-9]{1,4})?"} required /></label><label><span>As of</span><input type="date" name="asOfDate" min={goal.period_start} max={defaultAsOfDate} defaultValue={defaultAsOfDate} required /></label><label><span>Correct entry <small>Optional</small></span><select name="supersedesEntryId" defaultValue=""><option value="">New progress entry</option>{correctionOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.as_of_date} · {formatGoalValue(entry.actual_value, goal.unit, goal.currency_code)}</option>)}</select></label><label className="full"><span>Note <small>Optional</small></span><input name="note" maxLength={1000} /></label><PendingSubmitButton className="primary-button" pendingLabel="Recording…">Record Progress</PendingSubmitButton></form></section> : null}

    {data.canManage && ["DRAFT","ACTIVE"].includes(goal.lifecycle_status) ? <section className="panel detail-section goal-lifecycle-actions"><div className="section-head"><div><h2>Lifecycle</h2><p>Lifecycle changes are terminal where noted and are retained in history.</p></div></div><div className="goal-action-grid">{goal.lifecycle_status === "DRAFT" ? <form action={transitionGoalAction}><input type="hidden" name="goalId" value={goal.id} /><input type="hidden" name="expectedRevision" value={goal.revision} /><input type="hidden" name="action" value="ACTIVATE" /><PendingSubmitButton className="primary-button" pendingLabel="Activating…">Activate Goal</PendingSubmitButton></form> : null}{canComplete ? <form action={transitionGoalAction}><input type="hidden" name="goalId" value={goal.id} /><input type="hidden" name="expectedRevision" value={goal.revision} /><input type="hidden" name="action" value="COMPLETE" /><PendingSubmitButton className="secondary-button" pendingLabel="Completing…">Complete Goal</PendingSubmitButton></form> : null}<form action={transitionGoalAction} className="goal-cancel-form"><input type="hidden" name="goalId" value={goal.id} /><input type="hidden" name="expectedRevision" value={goal.revision} /><input type="hidden" name="action" value="CANCEL" /><label><span>Cancellation reason</span><input name="note" maxLength={1000} required /></label><PendingSubmitButton className="secondary-button" pendingLabel="Cancelling…">Cancel Goal</PendingSubmitButton></form></div></section> : null}

    <div className="detail-grid goal-history-grid"><section className="panel detail-section"><div className="section-head"><div><h2>Progress History</h2><p>Entries are append-only; corrections retain the original.</p></div></div>{data.progress.length ? <div className="timeline goal-timeline">{data.progress.map((entry) => <article key={entry.id} className={entry.is_superseded ? "goal-entry-superseded" : undefined}><span /><div><b>{formatGoalValue(entry.actual_value, goal.unit, goal.currency_code)} as of {entry.as_of_date}</b><p>{entry.actor_display_name} · {formatOrganizationDateTime(entry.created_at, data.timezone)}</p>{entry.supersedes_entry_id ? <small>Correction of a prior entry</small> : null}{entry.is_superseded ? <small>Superseded by a correction</small> : null}{entry.note ? <p>{entry.note}</p> : null}</div></article>)}</div> : <div className="no-results">No progress has been recorded.</div>}</section>
    <section className="panel detail-section"><div className="section-head"><div><h2>Definition & Lifecycle History</h2><p>Durable snapshots of authorized changes.</p></div></div><div className="timeline goal-timeline">{data.history.map((entry) => {
      const changes = goalHistoryChangeDetails(entry);
      return <article key={entry.id}><span /><div><b>{words(entry.event_type)}</b><p>{entry.actor_display_name} · {formatOrganizationDateTime(entry.created_at, data.timezone)}</p>{entry.prior_owner_display_name || entry.new_owner_display_name ? <small>{entry.prior_owner_display_name ?? "Organization"} → {entry.new_owner_display_name ?? "Organization"}</small> : null}{changes.map((change) => <small key={change}>{change}</small>)}{entry.note ? <p>{entry.note}</p> : null}</div></article>;
    })}</div></section></div>
    <Link className="auth-link" href="/goals"><ApplicationIcon name="back" />All Goals</Link>
  </>;
}
