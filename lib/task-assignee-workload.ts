import type { TaskRow } from "./data/case-repository.ts";
import { matchesTaskFilter } from "./operational-filters.ts";

export type TaskWorkloadProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type TaskWorkloadUser = {
  role: string;
  profile: TaskWorkloadProfile;
};

export type TaskAssigneeWorkload = TaskWorkloadUser & {
  notStarted: number;
  inProgress: number;
  overdue: number;
  completed: number;
  lifetime: number;
};

export type TaskDashboardCounts = {
  total: number;
  overdue: number;
  notStarted: number;
  inProgress: number;
  completed: number;
};

export function getTaskDashboardCounts(
  tasks: TaskRow[],
  timezone: string,
  now = new Date(),
): TaskDashboardCounts {
  return {
    total: tasks.length,
    overdue: tasks.filter((task) =>
      matchesTaskFilter(task, undefined, "overdue", timezone, now),
    ).length,
    notStarted: tasks.filter((task) => task.status === "NOT_STARTED").length,
    inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
    completed: tasks.filter((task) => task.status === "COMPLETED").length,
  };
}

export function getTaskAssigneeWorkloads(
  users: TaskWorkloadUser[],
  tasks: TaskRow[],
  timezone: string,
  now = new Date(),
): TaskAssigneeWorkload[] {
  return users.map((user) => {
    const userId = user.profile.id;

    // Current workload follows the Task's authoritative current assignee.
    const assigned = tasks.filter(
      (task) => task.assigned_user_id === userId,
    );

    // The Task schema does not preserve a full reassignment history.
    // Lifetime therefore means every distinct Task still durably attributable
    // through either current assignment or preserved completion attribution.
    const associated = tasks.filter(
      (task) =>
        task.assigned_user_id === userId ||
        task.completed_by_user_id === userId,
    );

    const completed = tasks.filter(
      (task) =>
        task.status === "COMPLETED" &&
        (task.completed_by_user_id === userId ||
          (!task.completed_by_user_id && task.assigned_user_id === userId)),
    );

    return {
      ...user,
      notStarted: assigned.filter((task) => task.status === "NOT_STARTED")
        .length,
      inProgress: assigned.filter((task) => task.status === "IN_PROGRESS")
        .length,
      overdue: assigned.filter((task) =>
        matchesTaskFilter(task, undefined, "overdue", timezone, now),
      ).length,
      completed: completed.length,
      lifetime: associated.length,
    };
  });
}
