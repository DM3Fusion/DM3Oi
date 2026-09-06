import type { LiveCase, TaskRow } from "./data/case-repository.ts";
import { startOfOrganizationDay } from "./organization-timezone.ts";

export const taskStatuses = ["open", "completed", "blocked", "overdue"] as const;
export type TaskStatusFilter = (typeof taskStatuses)[number];
export const caseStatuses = ["active", "new", "assigned", "in-progress", "waiting", "completed"] as const;
export type CaseStatusFilter = (typeof caseStatuses)[number];

export const normalizeTaskStatus = (value?: string): TaskStatusFilter | undefined =>
  taskStatuses.includes(value as TaskStatusFilter) ? (value as TaskStatusFilter) : undefined;
export const normalizeCaseStatus = (value?: string): CaseStatusFilter | undefined =>
  caseStatuses.includes(value as CaseStatusFilter) ? (value as CaseStatusFilter) : undefined;
export const isOpenTask = (task: TaskRow) => !["COMPLETED", "NOT_APPLICABLE"].includes(task.status);

export function organizationDayBounds(timezone: string, now = new Date()) {
  const start = startOfOrganizationDay(now, timezone);
  return { start, end: startOfOrganizationDay(new Date(start.getTime() + 36 * 60 * 60 * 1000), timezone) };
}

export function matchesTaskFilter(task: TaskRow, status: TaskStatusFilter | undefined, due: string | undefined, timezone: string, now = new Date()) {
  const { start, end } = organizationDayBounds(timezone, now);
  if (due === "today" && (!task.due_at || !isOpenTask(task) || new Date(task.due_at) < start || new Date(task.due_at) >= end)) return false;
  if (status === "open" && !isOpenTask(task)) return false;
  if (status === "completed" && task.status !== "COMPLETED") return false;
  if (status === "blocked" && task.status !== "BLOCKED") return false;
  if (status === "overdue" && (!task.due_at || !isOpenTask(task) || new Date(task.due_at) >= start)) return false;
  return true;
}

export function matchesCaseFilter(item: LiveCase, status?: CaseStatusFilter) {
  if (!status) return true;
  if (status === "active") return !["COMPLETED", "CLOSED", "CANCELLED"].includes(item.status);
  if (status === "new") return item.status === "NEW";
  if (status === "assigned") return ["UNASSIGNED", "ASSIGNED"].includes(item.status);
  if (status === "in-progress") return ["IN_PROGRESS", "REVIEW"].includes(item.status);
  if (status === "waiting") return item.status === "WAITING";
  return ["COMPLETED", "CLOSED"].includes(item.status);
}
