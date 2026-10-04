import "server-only";
import { notFound, redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  goalPerformance,
  type GoalHistoryEntry,
  type GoalProgressEntry,
  type GoalRecord,
} from "@/lib/goals";

type GoalRpcClient = {
  rpc(
    fn: "get_goals",
    args: { target_organization_id: string; target_goal_id: string | null },
  ): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
  rpc(
    fn: "get_goal_progress_entries" | "get_goal_history",
    args: { target_organization_id: string; target_goal_id: string },
  ): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

export type GoalOwnerOption = { userId: string; displayName: string };

function arrayPayload<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

async function goalContext() {
  const access = await getAccessContext();
  if (!access?.activeOrganization || !hasPermission(access, "VIEW_GOALS")) redirect("/");
  return access;
}

async function organizationTimezone(organizationId: string) {
  const supabase = await createClient();
  const settings = await supabase
    .from("organization_settings")
    .select("timezone")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (settings.error) throw new Error("Goals are temporarily unavailable.");
  return settings.data?.timezone ?? "UTC";
}



export type GoalDashboardSummary = {
  activeGoals: number;
  achieved: number;
  atRisk: number;
  missed: number;
};

export async function getGoalDashboardSummary():
  Promise<GoalDashboardSummary | null> {
  const access = await getAccessContext();

  if (
    !access?.activeOrganization ||
    !hasPermission(access, "VIEW_GOALS")
  ) {
    return null;
  }

  const organizationId =
    access.activeOrganization.id;
  const supabase = await createClient();
  const rpc =
    supabase as unknown as GoalRpcClient;

  const [goalsResult, timezone] =
    await Promise.all([
      rpc.rpc("get_goals", {
        target_organization_id:
          organizationId,
        target_goal_id: null,
      }),
      organizationTimezone(organizationId),
    ]);

  if (goalsResult.error) {
    console.error(
      "Goal Dashboard summary query failed",
      {
        code:
          goalsResult.error.code ?? null,
        message:
          goalsResult.error.message,
      },
    );

    throw new Error(
      "Goal performance is temporarily unavailable.",
    );
  }

  const goals =
    arrayPayload<GoalRecord>(
      goalsResult.data,
    );

  const summary: GoalDashboardSummary = {
    activeGoals: 0,
    achieved: 0,
    atRisk: 0,
    missed: 0,
  };

  for (const goal of goals) {
    if (
      goal.lifecycle_status === "ACTIVE"
    ) {
      summary.activeGoals += 1;
    }

    const performance =
      goalPerformance(goal, timezone);

    if (performance === "ACHIEVED") {
      summary.achieved += 1;
    } else if (
      performance === "AT_RISK"
    ) {
      summary.atRisk += 1;
    } else if (
      performance === "MISSED"
    ) {
      summary.missed += 1;
    }
  }

  return summary;
}

export async function getGoalsRegisterData() {
  const access = await goalContext();
  const organizationId = access.activeOrganization!.id;
  const supabase = await createClient();
  const rpc = supabase as unknown as GoalRpcClient;
  const [goalsResult, timezone] = await Promise.all([
    rpc.rpc("get_goals", {
      target_organization_id: organizationId,
      target_goal_id: null,
    }),
    organizationTimezone(organizationId),
  ]);
  if (goalsResult.error) {
    console.error("Goals register query failed", {
      code: goalsResult.error.code ?? null,
      message: goalsResult.error.message,
    });
    throw new Error("Goals are temporarily unavailable.");
  }
  return {
    goals: arrayPayload<GoalRecord>(goalsResult.data),
    timezone,
    canManage: hasPermission(access, "MANAGE_GOALS"),
    canUpdateProgress: hasPermission(access, "UPDATE_GOAL_PROGRESS"),
    actorUserId: access.user.id,
  };
}

export async function getGoalDetailData(goalId: string) {
  const access = await goalContext();
  const organizationId = access.activeOrganization!.id;
  const supabase = await createClient();
  const rpc = supabase as unknown as GoalRpcClient;
  const [goalResult, progressResult, historyResult, timezone] = await Promise.all([
    rpc.rpc("get_goals", {
      target_organization_id: organizationId,
      target_goal_id: goalId,
    }),
    rpc.rpc("get_goal_progress_entries", {
      target_organization_id: organizationId,
      target_goal_id: goalId,
    }),
    rpc.rpc("get_goal_history", {
      target_organization_id: organizationId,
      target_goal_id: goalId,
    }),
    organizationTimezone(organizationId),
  ]);
  const error = goalResult.error ?? progressResult.error ?? historyResult.error;
  if (error) {
    if (error.code === "42501") notFound();
    console.error("Goal detail query failed", {
      code: error.code ?? null,
      message: error.message,
    });
    throw new Error("Goal details are temporarily unavailable.");
  }
  const goal = arrayPayload<GoalRecord>(goalResult.data)[0];
  if (!goal) notFound();
  const canManage = hasPermission(access, "MANAGE_GOALS");
  const canUpdateProgress = canManage || (
    hasPermission(access, "UPDATE_GOAL_PROGRESS")
    && (goal.ownership_scope === "ORGANIZATION" || goal.owner_user_id === access.user.id)
  );
  return {
    goal,
    progress: arrayPayload<GoalProgressEntry>(progressResult.data),
    history: arrayPayload<GoalHistoryEntry>(historyResult.data),
    timezone,
    canManage,
    canUpdateProgress,
  };
}

export async function getGoalEditorData(goalId?: string) {
  const access = await getAccessContext();
  if (!access?.activeOrganization || !hasPermission(access, "MANAGE_GOALS")) notFound();
  const organizationId = access.activeOrganization.id;
  const supabase = await createClient();
  const members = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .eq("is_active", true);
  if (members.error) throw new Error("Goal owners are temporarily unavailable.");
  const userIds = (members.data ?? []).map((member) => member.user_id);
  const profiles = userIds.length
    ? await supabase
        .from("profiles")
        .select("id,display_name,email")
        .in("id", userIds)
        .eq("is_active", true)
    : { data: [], error: null };
  if (profiles.error) throw new Error("Goal owners are temporarily unavailable.");
  const owners: GoalOwnerOption[] = (profiles.data ?? [])
    .map((profile) => ({
      userId: profile.id,
      displayName: profile.display_name || profile.email || "Organization User",
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const timezone = await organizationTimezone(organizationId);

  if (!goalId) return { goal: null, owners, timezone };
  const rpc = supabase as unknown as GoalRpcClient;
  const result = await rpc.rpc("get_goals", {
    target_organization_id: organizationId,
    target_goal_id: goalId,
  });
  if (result.error) notFound();
  const goal = arrayPayload<GoalRecord>(result.data)[0];
  if (!goal) notFound();
  return { goal, owners, timezone };
}
