import Link from "next/link";
import { caseViewHref } from "@/lib/case-dashboard";
import type { CaseDashboardCounts, CaseRegisterFilters, CaseView } from "@/lib/case-dashboard";

interface CaseKpi {
  label: string;
  accessibleLabel: string;
  count: number;
  view?: CaseView;
  tone?: "overdue" | "in-progress" | "waiting" | "unassigned" | "completed";
}

const caseKpiPercentage = (count: number, total: number) =>
  total > 0 ? (count / total) * 100 : 0;

const formatCaseKpiPercentage = (value: number) => {
  if (value === 0) return "0%";
  if (Number.isInteger(value)) return `${value}%`;
  return `${value.toFixed(1)}%`;
};

export function CaseKpis({ counts, filters, selectedView }: { counts: CaseDashboardCounts; filters: CaseRegisterFilters; selectedView?: CaseView }) {
  const kpis: CaseKpi[] = [
    { label: "Total Cases", accessibleLabel: "all", count: counts.total },
    { label: "Overdue", accessibleLabel: "overdue", count: counts.overdue, view: "overdue", tone: "overdue" },
    { label: "In Progress", accessibleLabel: "in progress", count: counts.inProgress, view: "in-progress", tone: "in-progress" },
    { label: "Waiting", accessibleLabel: "waiting", count: counts.waiting, view: "waiting", tone: "waiting" },
    { label: "Unassigned", accessibleLabel: "unassigned", count: counts.unassigned, view: "unassigned", tone: "unassigned" },
    { label: "Completed", accessibleLabel: "completed", count: counts.completed, view: "completed", tone: "completed" },
  ];

  return (
    <nav className="case-kpis" aria-label="Case operational views">
      {kpis.map((kpi) => {
        const selected = kpi.view === selectedView;
        const percentage = caseKpiPercentage(kpi.count, counts.total);
        const percentageLabel = formatCaseKpiPercentage(percentage);
        const donutStyle = kpi.tone
          ? ({
              "--case-kpi-progress": `${Math.min(100, Math.max(0, percentage)) * 3.6}deg`,
            } as React.CSSProperties)
          : undefined;

        return (
          <Link
            key={kpi.label}
            className={`case-kpi${selected ? " selected" : ""}${kpi.tone ? ` case-kpi-${kpi.tone}` : " case-kpi-total"}`}
            href={caseViewHref(filters, kpi.view)}
            aria-current={selected ? "page" : undefined}
            aria-label={
              kpi.tone
                ? `Show ${kpi.accessibleLabel} cases, ${kpi.count} cases, ${percentageLabel} of total cases`
                : `Show ${kpi.accessibleLabel} cases, ${kpi.count} cases`
            }
          >
            <span>{kpi.label}</span>
            {kpi.tone ? (
              <span className="case-kpi-donut" style={donutStyle} aria-hidden="true">
                <span className="case-kpi-donut-center">
                  <strong>{kpi.count}</strong>
                  <small>{percentageLabel}</small>
                </span>
              </span>
            ) : (
              <strong className="case-kpi-total-count">{kpi.count}</strong>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
