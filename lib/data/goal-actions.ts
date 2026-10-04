"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import {
  goalDirections,
  goalPeriodKinds,
  goalScopes,
  goalUnits,
  isGoalCount,
  isGoalDecimal,
  isGoalPercent,
} from "@/lib/goals";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const selected = <T extends readonly string[]>(items: T, candidate: string) =>
  items.find((item) => item === candidate);
const fail = (path: string, message: string): never =>
  redirect(`${path}?error=${encodeURIComponent(message)}`);
const friendly = (message: string) =>
  message.includes("changed after") ? "This Goal changed after you opened it. Reload and try again."
  : message.includes("active organization user") ? "Select an active organization user."
  : message.includes("measurement cannot change") ? "Measurement settings cannot change after progress is recorded."
  : message.includes("early completion") ? "A Goal can be completed early only after its target is satisfied."
  : message.includes("cancellation reason") ? "Enter a cancellation reason."
  : message.includes("not authorized") ? "You are not authorized to perform that Goal action."
  : "The Goal change could not be saved.";

type GoalMutationRpc = {
  rpc(fn: "save_goal", args: Record<string, unknown>): PromiseLike<{
    data: { id?: string } | null;
    error: { code?: string; message: string } | null;
  }>;
  rpc(fn: "record_goal_progress" | "transition_goal", args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

export async function saveGoalAction(form: FormData) {
  const access = await requirePermission("MANAGE_GOALS");
  const goalId = value(form, "goalId") || null;
  const path = goalId ? `/goals/${goalId}/edit` : "/goals/new";
  const scope = selected(goalScopes, value(form, "ownershipScope"));
  const direction = selected(goalDirections, value(form, "measurementDirection"));
  const unit = selected(goalUnits, value(form, "unit"));
  const periodKind = selected(goalPeriodKinds, value(form, "periodKind"));
  const targetValue = value(form, "targetValue");
  const baselineValue = value(form, "baselineValue");
  const currencyCode = value(form, "currencyCode").toUpperCase();
  if (!scope || !direction || !unit || !periodKind)
    fail(path, "Select valid Goal settings.");
  if (!value(form, "title") || !value(form, "metricLabel"))
    fail(path, "Title and measure are required.");
  if (!isGoalDecimal(targetValue) || (baselineValue && !isGoalDecimal(baselineValue)))
    fail(path, "Enter valid target and baseline values with up to four decimal places.");
  if (unit === "COUNT" && (
    !isGoalCount(targetValue) || (baselineValue && !isGoalCount(baselineValue))
  )) fail(path, "Count values must be whole numbers.");
  if (unit === "PERCENT" && (
    !isGoalPercent(targetValue) || (baselineValue && !isGoalPercent(baselineValue))
  )) fail(path, "Percent values must be between 0 and 100.");
  if (unit === "CURRENCY" && !/^[A-Z]{3}$/.test(currencyCode))
    fail(path, "Enter a three-letter currency code.");
  if (scope === "INDIVIDUAL" && !value(form, "ownerUserId"))
    fail(path, "Select an owner for an individual Goal.");

  const supabase = await createClient();
  const rpc = supabase as unknown as GoalMutationRpc;
  const result = await rpc.rpc("save_goal", {
    target_organization_id: access.activeOrganization.id,
    target_goal_id: goalId,
    target_title: value(form, "title"),
    target_description: value(form, "description"),
    target_metric_label: value(form, "metricLabel"),
    target_ownership_scope: scope,
    target_owner_user_id: scope === "INDIVIDUAL" ? value(form, "ownerUserId") : null,
    target_measurement_direction: direction,
    target_unit: unit,
    target_currency_code: unit === "CURRENCY" ? currencyCode : null,
    target_target_value: targetValue,
    target_baseline_value: baselineValue || null,
    target_period_kind: periodKind,
    target_period_start: value(form, "periodStart"),
    target_period_end: value(form, "periodEnd"),
    expected_revision: goalId ? Number(value(form, "expectedRevision")) : null,
  });
  if (result.error) {
    console.error("Save Goal failed", { code: result.error.code ?? null, message: result.error.message });
    fail(path, friendly(result.error.message));
  }
  const savedId = result.data?.id ?? goalId;
  if (!savedId) fail(path, "The Goal change could not be saved.");
  revalidatePath("/goals");
  revalidatePath(`/goals/${savedId}`);
  redirect(`/goals/${savedId}?message=${encodeURIComponent(goalId ? "Goal updated." : "Goal created.")}`);
}

export async function recordGoalProgressAction(form: FormData) {
  const access = await requirePermission("VIEW_GOALS");
  const goalId = value(form, "goalId");
  const path = `/goals/${goalId}`;
  const actualValue = value(form, "actualValue");
  const unit = selected(goalUnits, value(form, "unit"));
  if (!goalId || !isGoalDecimal(actualValue))
    fail(path, "Enter a valid actual value with up to four decimal places.");
  if (unit === "COUNT" && !isGoalCount(actualValue))
    fail(path, "Count values must be whole numbers.");
  const supabase = await createClient();
  const rpc = supabase as unknown as GoalMutationRpc;
  const result = await rpc.rpc("record_goal_progress", {
    target_organization_id: access.activeOrganization.id,
    target_goal_id: goalId,
    target_actual_value: actualValue,
    target_as_of_date: value(form, "asOfDate"),
    target_note: value(form, "note") || null,
    target_supersedes_entry_id: value(form, "supersedesEntryId") || null,
    expected_revision: Number(value(form, "expectedRevision")),
  });
  if (result.error) {
    console.error("Record Goal progress failed", { code: result.error.code ?? null, message: result.error.message });
    fail(path, friendly(result.error.message));
  }
  revalidatePath("/goals");
  revalidatePath(path);
  redirect(`${path}?message=${encodeURIComponent("Progress recorded.")}`);
}

export async function transitionGoalAction(form: FormData) {
  const access = await requirePermission("MANAGE_GOALS");
  const goalId = value(form, "goalId");
  const path = `/goals/${goalId}`;
  const action = value(form, "action").toUpperCase();
  if (!goalId || !["ACTIVATE", "COMPLETE", "CANCEL"].includes(action))
    fail(path, "Select a valid Goal lifecycle action.");
  const supabase = await createClient();
  const rpc = supabase as unknown as GoalMutationRpc;
  const result = await rpc.rpc("transition_goal", {
    target_organization_id: access.activeOrganization.id,
    target_goal_id: goalId,
    target_action: action,
    target_note: value(form, "note") || null,
    expected_revision: Number(value(form, "expectedRevision")),
  });
  if (result.error) {
    console.error("Transition Goal failed", { code: result.error.code ?? null, message: result.error.message });
    fail(path, friendly(result.error.message));
  }
  revalidatePath("/goals");
  revalidatePath(path);
  redirect(`${path}?message=${encodeURIComponent(action === "ACTIVATE" ? "Goal activated." : action === "COMPLETE" ? "Goal completed." : "Goal cancelled.")}`);
}
