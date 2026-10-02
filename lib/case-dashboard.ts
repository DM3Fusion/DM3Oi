import type { CaseRegisterRow } from "./data/case-repository.ts";
import {
  ALL_CASE_LIFECYCLE_STATUSES,
  isIncompleteCompatibilityCaseStatus,
} from "./case-lifecycle.ts";
import { matchesCaseFilter, normalizeCaseStatus } from "./operational-filters.ts";
import { startOfOrganizationDay } from "./organization-timezone.ts";

export const caseViews = ["in-progress", "waiting", "overdue", "unassigned", "completed"] as const;
export type CaseView = (typeof caseViews)[number];

export interface CaseRegisterFilters {
  query?: string;
  status?: string;
  priority?: string;
  assignment?: string;
  view?: string;
}

export interface CaseDashboardCounts {
  total: number;
  inProgress: number;
  waiting: number;
  overdue: number;
  unassigned: number;
  completed: number;
}

export const normalizeCaseView = (value?: string): CaseView | undefined =>
  caseViews.includes(value as CaseView) ? (value as CaseView) : undefined;

export const normalizeRawCaseStatus = (value?: string): CaseRegisterRow["status"] | undefined =>
  ALL_CASE_LIFECYCLE_STATUSES.includes(value as CaseRegisterRow["status"])
    ? (value as CaseRegisterRow["status"])
    : undefined;

export const isCaseUnassigned = (item: CaseRegisterRow) =>
  !item.manager_user_id && item.assignedStaff.length === 0;

export function isCaseOverdue(item: LiveCase, timezone: string, now = new Date()) {
  if (!item.due_at || !isIncompleteCompatibilityCaseStatus(item.status)) return false;
  const dueAt = new Date(item.due_at);
  return !Number.isNaN(dueAt.getTime()) && dueAt < startOfOrganizationDay(now, timezone);
}

export function matchesCaseView(item: LiveCase, view: CaseView | undefined, timezone: string, now = new Date()) {
  if (!view) return true;
  if (view === "in-progress") return matchesCaseFilter(item, "in-progress");
  if (view === "waiting") return matchesCaseFilter(item, "waiting");
  if (view === "overdue") return isCaseOverdue(item, timezone, now);
  if (view === "unassigned") return isCaseUnassigned(item);
  return matchesCaseFilter(item, "completed");
}

export function getCaseDashboardCounts(items: CaseRegisterRow[], timezone: string, now = new Date()): CaseDashboardCounts {
  return {
    total: items.length,
    inProgress: items.filter((item) => matchesCaseView(item, "in-progress", timezone, now)).length,
    waiting: items.filter((item) => matchesCaseView(item, "waiting", timezone, now)).length,
    overdue: items.filter((item) => matchesCaseView(item, "overdue", timezone, now)).length,
    unassigned: items.filter((item) => matchesCaseView(item, "unassigned", timezone, now)).length,
    completed: items.filter((item) => matchesCaseView(item, "completed", timezone, now)).length,
  };
}

export function matchesCaseRegisterFilters(item: LiveCase, filters: CaseRegisterFilters, timezone: string, now = new Date()) {
  const query = (filters.query ?? "").toLowerCase();
  const dashboardStatus = normalizeCaseStatus(filters.status);
  const rawStatus = normalizeRawCaseStatus(filters.status);
  const view = normalizeCaseView(filters.view);

  return matchesCaseView(item, view, timezone, now)
    && `${item.case_number} ${item.title} ${item.customer?.name ?? ""}`.toLowerCase().includes(query)
    && (dashboardStatus ? matchesCaseFilter(item, dashboardStatus) : rawStatus ? item.status === rawStatus : true)
    && (filters.priority && filters.priority !== "ALL" ? item.priority === filters.priority : true)
    && (filters.assignment === "ASSIGNED" ? !isCaseUnassigned(item) : filters.assignment === "UNASSIGNED" ? isCaseUnassigned(item) : true);
}

export function caseViewHref(filters: CaseRegisterFilters, view?: CaseView) {
  const params = new URLSearchParams();
  for (const key of ["query", "status", "priority", "assignment"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  if (view) params.set("view", view);
  const query = params.toString();
  return query ? `/cases?${query}` : "/cases";
}
