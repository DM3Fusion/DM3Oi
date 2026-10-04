"use client";

import { useState } from "react";
import Link from "next/link";
import { saveGoalAction } from "@/lib/data/goal-actions";
import type { GoalOwnerOption } from "@/lib/data/goals-repository";
import type { GoalRecord, GoalScope, GoalUnit } from "@/lib/goals";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export function GoalForm({ goal, owners }: { goal: GoalRecord | null; owners: GoalOwnerOption[] }) {
  const [scope, setScope] = useState<GoalScope>(goal?.ownership_scope ?? "ORGANIZATION");
  const [unit, setUnit] = useState<GoalUnit>(goal?.unit ?? "COUNT");
  return (
    <form action={saveGoalAction} className="panel form-panel entity-form goal-form">
      <input type="hidden" name="goalId" value={goal?.id ?? ""} />
      <input type="hidden" name="expectedRevision" value={goal?.revision ?? ""} />
      <div className="form-grid">
        <label><span>Title</span><input name="title" maxLength={160} defaultValue={goal?.title ?? ""} required /></label>
        <label><span>Measure</span><input name="metricLabel" maxLength={120} defaultValue={goal?.metric_label ?? ""} placeholder="Examples: Cases completed, retention rate" required /></label>
        <label className="full"><span>Description</span><textarea name="description" maxLength={4000} defaultValue={goal?.description ?? ""} rows={4} /></label>
        <label><span>Scope</span><select name="ownershipScope" value={scope} onChange={(event) => setScope(event.target.value as GoalScope)}><option value="ORGANIZATION">Organization</option><option value="INDIVIDUAL">Individual</option></select></label>
        {scope === "INDIVIDUAL" ? <label><span>Owner</span><select name="ownerUserId" defaultValue={goal?.owner_user_id ?? ""} required><option value="">Select owner</option>{owners.map((owner) => <option key={owner.userId} value={owner.userId}>{owner.displayName}</option>)}</select></label> : <input type="hidden" name="ownerUserId" value="" />}
        <label><span>Direction</span><select name="measurementDirection" defaultValue={goal?.measurement_direction ?? "AT_LEAST"}><option value="AT_LEAST">At least</option><option value="AT_MOST">At most</option><option value="EXACT">Exactly</option></select></label>
        <label><span>Unit</span><select name="unit" value={unit} onChange={(event) => setUnit(event.target.value as GoalUnit)}><option value="COUNT">Count</option><option value="PERCENT">Percent</option><option value="CURRENCY">Currency</option><option value="NUMBER">Number</option></select></label>
        {unit === "CURRENCY" ? <label><span>Currency code</span><input name="currencyCode" defaultValue={goal?.currency_code ?? "USD"} maxLength={3} pattern="[A-Za-z]{3}" required /></label> : <input type="hidden" name="currencyCode" value="" />}
        <label><span>Target value</span><input name="targetValue" inputMode="decimal" pattern={unit === "COUNT" ? "-?[0-9]+" : "-?[0-9]+(?:\\.[0-9]{1,4})?"} defaultValue={goal?.target_value ?? ""} required /></label>
        <label><span>Baseline value <small>Optional</small></span><input name="baselineValue" inputMode="decimal" pattern={unit === "COUNT" ? "-?[0-9]+" : "-?[0-9]+(?:\\.[0-9]{1,4})?"} defaultValue={goal?.baseline_value ?? ""} /></label>
        <label><span>Period</span><select name="periodKind" defaultValue={goal?.period_kind ?? "CUSTOM"}><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annual</option><option value="CUSTOM">Custom</option></select></label>
        <label><span>Period start</span><input type="date" name="periodStart" defaultValue={goal?.period_start ?? ""} required /></label>
        <label><span>Period end</span><input type="date" name="periodEnd" defaultValue={goal?.period_end ?? ""} required /></label>
      </div>
      <p className="form-help">Monthly, quarterly, and annual periods must use their complete calendar boundaries. Progress is entered manually in this release.</p>
      <div className="form-actions"><PendingSubmitButton className="primary-button" pendingLabel="Saving Goal…">{goal ? "Save Goal" : "Create Goal"}</PendingSubmitButton><Link href={goal ? `/goals/${goal.id}` : "/goals"}>Cancel</Link></div>
    </form>
  );
}
