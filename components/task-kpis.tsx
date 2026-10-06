import Link from "next/link";
import type { TaskDashboardCounts } from "@/lib/task-assignee-workload";
import type {
  TaskDueFilter,
  TaskStatusFilter,
} from "@/lib/operational-filters";

type Props = {
  counts: TaskDashboardCounts;
  status?: TaskStatusFilter;
  due?: TaskDueFilter;
};

export function TaskKpis({ counts, status, due }: Props) {
  const cards = [
    {
      label: "Total Tasks",
      value: counts.total,
      href: "/tasks",
      selected: !status && !due,
      overdue: false,
    },
    {
      label: "Overdue",
      value: counts.overdue,
      href: "/tasks?due=overdue",
      selected: due === "overdue" && !status,
      overdue: true,
    },
    {
      label: "Not Started",
      value: counts.notStarted,
      href: "/tasks?status=not-started",
      selected: status === "not-started" && !due,
      overdue: false,
    },
    {
      label: "In Progress",
      value: counts.inProgress,
      href: "/tasks?status=in-progress",
      selected: status === "in-progress" && !due,
      overdue: false,
    },
    {
      label: "Completed",
      value: counts.completed,
      href: "/tasks?status=completed",
      selected: status === "completed" && !due,
      overdue: false,
    },
  ];

  return (
    <nav className="task-kpis" aria-label="Task dashboard">
      {cards.map((card) => (
        <Link
          className={[
            "case-kpi",
            card.selected ? "selected" : "",
            card.overdue ? "case-kpi-overdue" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          href={card.href}
          key={card.label}
        >
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </Link>
      ))}
    </nav>
  );
}
