import Link from "next/link";
import { caseViewHref } from "@/lib/case-dashboard";
import type { CaseDashboardCounts, CaseRegisterFilters, CaseView } from "@/lib/case-dashboard";

interface CaseKpi { label: string; accessibleLabel: string; count: number; view?: CaseView }

export function CaseKpis({ counts, filters, selectedView }: { counts: CaseDashboardCounts; filters: CaseRegisterFilters; selectedView?: CaseView }) {
  const kpis: CaseKpi[] = [
    { label: "Total Cases", accessibleLabel: "all", count: counts.total },
    { label: "In Progress", accessibleLabel: "in progress", count: counts.inProgress, view: "in-progress" },
    { label: "Waiting", accessibleLabel: "waiting", count: counts.waiting, view: "waiting" },
    { label: "Overdue", accessibleLabel: "overdue", count: counts.overdue, view: "overdue" },
    { label: "Unassigned", accessibleLabel: "unassigned", count: counts.unassigned, view: "unassigned" },
    { label: "Completed", accessibleLabel: "completed", count: counts.completed, view: "completed" },
  ];

  return (
    <nav className="case-kpis" aria-label="Case operational views">
      {kpis.map((kpi) => {
        const selected = kpi.view === selectedView;
        return (
          <Link
            key={kpi.label}
            className={`case-kpi${selected ? " selected" : ""}${kpi.view === "overdue" ? " case-kpi-overdue" : ""}`}
            href={caseViewHref(filters, kpi.view)}
            aria-current={selected ? "page" : undefined}
            aria-label={`Show ${kpi.accessibleLabel} cases, ${kpi.count} cases`}
          >
            <span>{kpi.label}</span>
            <strong>{kpi.count}</strong>
          </Link>
        );
      })}
    </nav>
  );
}
