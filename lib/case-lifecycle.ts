import type { Database } from "../types/database";

export type CaseLifecycleStatus =
  Database["public"]["Enums"]["case_status"];

export const ALL_CASE_LIFECYCLE_STATUSES = [
  "NEW",
  "UNASSIGNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING",
  "REVIEW",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
] as const satisfies readonly CaseLifecycleStatus[];

export const CANONICAL_ACTIVE_CASE_STATUSES = [
  "IN_PROGRESS",
  "WAITING",
] as const satisfies readonly CaseLifecycleStatus[];

export const CANONICAL_COMPLETED_CASE_STATUSES = [
  "COMPLETED",
] as const satisfies readonly CaseLifecycleStatus[];

export const LEGACY_INCOMPLETE_CASE_STATUSES = [
  "NEW",
  "UNASSIGNED",
  "ASSIGNED",
  "REVIEW",
] as const satisfies readonly CaseLifecycleStatus[];

export const INCOMPLETE_COMPATIBILITY_CASE_STATUSES = [
  ...LEGACY_INCOMPLETE_CASE_STATUSES,
  ...CANONICAL_ACTIVE_CASE_STATUSES,
] as const satisfies readonly CaseLifecycleStatus[];

export const HISTORICAL_NON_CANONICAL_CASE_STATUSES = [
  "CLOSED",
  "CANCELLED",
] as const satisfies readonly CaseLifecycleStatus[];

const canonicalActive = new Set<CaseLifecycleStatus>(
  CANONICAL_ACTIVE_CASE_STATUSES,
);
const canonicalCompleted = new Set<CaseLifecycleStatus>(
  CANONICAL_COMPLETED_CASE_STATUSES,
);
const legacyIncomplete = new Set<CaseLifecycleStatus>(
  LEGACY_INCOMPLETE_CASE_STATUSES,
);
const incompleteCompatibility = new Set<CaseLifecycleStatus>(
  INCOMPLETE_COMPATIBILITY_CASE_STATUSES,
);
const historicalNonCanonical = new Set<CaseLifecycleStatus>(
  HISTORICAL_NON_CANONICAL_CASE_STATUSES,
);

export const isCanonicalActiveCaseStatus = (status: CaseLifecycleStatus) =>
  canonicalActive.has(status);

export const isCanonicalCompletedCaseStatus = (status: CaseLifecycleStatus) =>
  canonicalCompleted.has(status);

export const isLegacyIncompleteCaseStatus = (status: CaseLifecycleStatus) =>
  legacyIncomplete.has(status);

export const isIncompleteCompatibilityCaseStatus = (
  status: CaseLifecycleStatus,
) => incompleteCompatibility.has(status);

export const isHistoricalNonCanonicalCaseStatus = (
  status: CaseLifecycleStatus,
) => historicalNonCanonical.has(status);

export const isGenericCaseTransitionAllowed = (
  currentStatus: CaseLifecycleStatus,
  targetStatus: CaseLifecycleStatus,
) =>
  incompleteCompatibility.has(currentStatus) && canonicalActive.has(targetStatus);
