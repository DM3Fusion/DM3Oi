import type { Case } from "@/domain/models";
import { isCanonicalCompletedCaseStatus } from "./case-lifecycle";
import { isCaseDueSoon, isCaseOverdue } from "./case-selectors";
export function getDashboardMetrics(cases: readonly Case[], now = new Date()) { return [
  { label: "Total Cases", value: cases.length, tone: "blue" }, { label: "In Progress", value: cases.filter((c) => c.status === "IN_PROGRESS").length, tone: "cyan" },
  { label: "Completed", value: cases.filter((c) => isCanonicalCompletedCaseStatus(c.status)).length, tone: "green" }, { label: "Unassigned", value: cases.filter((c) => c.status === "UNASSIGNED" || !c.assignedUserIds.length).length, tone: "amber" },
  { label: "Overdue", value: cases.filter((c) => isCaseOverdue(c, now)).length, tone: "red" }, { label: "In Review", value: cases.filter((c) => c.status === "REVIEW").length, tone: "violet" },
  { label: "Waiting", value: cases.filter((c) => c.status === "WAITING").length, tone: "slate" }, { label: "Due Soon", value: cases.filter((c) => isCaseDueSoon(c, now)).length, tone: "orange" },
] as const; }
