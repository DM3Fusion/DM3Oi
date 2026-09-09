import type { LiveCase, TaskRow } from "./data/case-repository.ts";
import { startOfOrganizationDay } from "./organization-timezone.ts";

export const taskStatuses = ["not-started", "in-progress", "blocked", "completed", "not-applicable"] as const;
export type StoredTaskStatusFilter = (typeof taskStatuses)[number];
export type TaskStatusFilter = StoredTaskStatusFilter | "open";
export const taskStatusLabels: Record<StoredTaskStatusFilter, string> = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  blocked: "Blocked",
  completed: "Completed",
  "not-applicable": "Not Applicable",
};
export const taskDueFilters = ["today", "overdue"] as const;
export type TaskDueFilter = (typeof taskDueFilters)[number];
export const caseStatuses = ["active", "new", "assigned", "in-progress", "waiting", "completed"] as const;
export type CaseStatusFilter = (typeof caseStatuses)[number];

export const normalizeTaskStatus = (value?: string): TaskStatusFilter | undefined =>
  value === "open" || taskStatuses.includes(value as StoredTaskStatusFilter) ? (value as TaskStatusFilter) : undefined;
export const normalizeTaskDue = (value?: string): TaskDueFilter | undefined =>
  taskDueFilters.includes(value as TaskDueFilter) ? (value as TaskDueFilter) : undefined;
export const normalizeTaskQuery = (value?: string) => value?.trim().slice(0, 200) ?? "";
export const normalizeCaseStatus = (value?: string): CaseStatusFilter | undefined =>
  caseStatuses.includes(value as CaseStatusFilter) ? (value as CaseStatusFilter) : undefined;
export const isOpenTask = (task: TaskRow) => !["COMPLETED", "NOT_APPLICABLE"].includes(task.status);

export function organizationDayBounds(timezone: string, now = new Date()) {
  const start = startOfOrganizationDay(now, timezone);
  return { start, end: startOfOrganizationDay(new Date(start.getTime() + 36 * 60 * 60 * 1000), timezone) };
}

export function matchesTaskFilter(task: TaskRow, status: TaskStatusFilter | undefined, due: TaskDueFilter | undefined, timezone: string, now = new Date()) {
  const { start, end } = organizationDayBounds(timezone, now);
  if (due === "today" && (!task.due_at || !isOpenTask(task) || new Date(task.due_at) < start || new Date(task.due_at) >= end)) return false;
  if (due === "overdue" && (!task.due_at || !isOpenTask(task) || new Date(task.due_at) >= start)) return false;
  if (status === "open" && !isOpenTask(task)) return false;
  if (status === "not-started" && task.status !== "NOT_STARTED") return false;
  if (status === "in-progress" && task.status !== "IN_PROGRESS") return false;
  if (status === "completed" && task.status !== "COMPLETED") return false;
  if (status === "blocked" && task.status !== "BLOCKED") return false;
  if (status === "not-applicable" && task.status !== "NOT_APPLICABLE") return false;
  return true;
}

export function matchesTaskSearch(task: TaskRow, caseNumber: string, query: string) {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase();
  return task.title.toLocaleLowerCase().includes(normalized) || caseNumber.toLocaleLowerCase().includes(normalized);
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
