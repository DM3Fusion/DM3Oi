import {
  isCanonicalCompletedCaseStatus,
  isIncompleteCompatibilityCaseStatus,
} from "./case-lifecycle.ts";
import { isCaseOverdue } from "./case-dashboard.ts";
import { isValidTaxYear } from "./customer-tenure.ts";
import { matchesCaseFilter } from "./operational-filters.ts";

export type WorkloadCase = {
  id: string;
  status: Parameters<typeof isIncompleteCompatibilityCaseStatus>[0];
  due_at: string | null;
  tax_year: number | null;
  manager_user_id: string | null;
  assignedStaff: Array<{ id: string }>;
  historicalAssigneeIds?: string[];
};

export type WorkloadUser<TProfile extends { id: string }> = {
  role: string;
  profile: TProfile;
};

export type CaseAssigneeWorkload<TProfile extends { id: string }> =
  WorkloadUser<TProfile> & {
    inProgress: number;
    overdue: number;
    completed: number;
    lifetime: number;
  };

const isAssignedTo = (item: WorkloadCase, userId: string) =>
  item.manager_user_id === userId ||
  item.assignedStaff.some((profile) => profile.id === userId);

const wasAssociatedWith = (item: WorkloadCase, userId: string) =>
  isAssignedTo(item, userId) || item.historicalAssigneeIds?.includes(userId);

export function getCaseAssigneeWorkloads<TProfile extends { id: string }>(
  users: Array<WorkloadUser<TProfile>>,
  cases: WorkloadCase[],
  timezone: string,
  now = new Date(),
): Array<CaseAssigneeWorkload<TProfile>> {
  const representedYears = cases
    .map((item) => item.tax_year)
    .filter(isValidTaxYear);
  const currentTaxYear = representedYears.length
    ? Math.max(...representedYears)
    : null;

  return users.map((user) => {
    // One Case can name the same person as manager and STAFF. Filter by Case first
    // so every metric counts that Case only once for that person.
    const currentlyAssignedCases = cases.filter((item) =>
      isAssignedTo(item, user.profile.id),
    );
    const associatedCases = cases.filter((item) =>
      wasAssociatedWith(item, user.profile.id),
    );

    return {
      ...user,
      inProgress: currentlyAssignedCases.filter(
        (item) =>
          isIncompleteCompatibilityCaseStatus(item.status) &&
          matchesCaseFilter(item, "in-progress"),
      ).length,
      overdue: currentlyAssignedCases.filter((item) =>
        isCaseOverdue(item, timezone, now),
      ).length,
      completed: currentlyAssignedCases.filter(
        (item) =>
          isCanonicalCompletedCaseStatus(item.status) &&
          currentTaxYear !== null &&
          item.tax_year === currentTaxYear,
      ).length,
      lifetime: associatedCases.length,
    };
  });
}
