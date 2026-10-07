import Link from "next/link";
import { NavigableRow } from "@/components/navigable-row";
import { TaskAssignedUserWorkloads } from "@/components/task-assigned-user-workloads";
import { TaskFilters } from "@/components/task-filters";
import { TaskKpis } from "@/components/task-kpis";
import { Badge } from "@/components/ui";
import type { getTaskRegisterData } from "@/lib/data/case-repository";
import {
  matchesTaskFilter,
  matchesTaskSearch,
  normalizeTaskDue,
  normalizeTaskQuery,
  normalizeTaskStatus,
  taskStatusLabels,
} from "@/lib/operational-filters";
import { formatOrganizationDate } from "@/lib/organization-timezone";
import { getTaskDashboardCounts } from "@/lib/task-assignee-workload";

export type TaskPageParams = {
  q?: string;
  status?: string;
  due?: string;
  assignee?: string;
};

type TaskDataPromise = ReturnType<typeof getTaskRegisterData>;

export async function resolveTasksPageModel(
  dataPromise: TaskDataPromise,
  searchParams: Promise<TaskPageParams>,
) {
  const [data, query] = await Promise.all([dataPromise, searchParams]);
  const q = normalizeTaskQuery(query.q);
  const status = normalizeTaskStatus(query.status);
  const due = normalizeTaskDue(query.due);
  const eligibleAssigneeIds = new Set(
    data.workloads.map((item) => item.profile.id),
  );
  const assignee =
    query.assignee && eligibleAssigneeIds.has(query.assignee)
      ? query.assignee
      : undefined;
  const casesById = new Map(data.cases.map((item) => [item.id, item]));
  const allRows = data.tasks.flatMap((task) => {
    const item = casesById.get(task.case_id);
    return item ? [{ task, item }] : [];
  });
  const rows = allRows.filter(
    ({ task, item }) =>
      matchesTaskFilter(task, status, due, data.timezone) &&
      matchesTaskSearch(task, item.case_number, q) &&
      (!assignee || task.assigned_user_id === assignee),
  );
  const counts = getTaskDashboardCounts(data.tasks, data.timezone);
  const assignees = data.workloads.map((item) => ({
    id: item.profile.id,
    name: item.profile.display_name ?? item.profile.email ?? "Organization user",
  }));
  const hasFilters = Boolean(q || status || due || assignee);
  const selectedAssignee = assignee
    ? assignees.find((item) => item.id === assignee)?.name
    : undefined;
  const statusLabel =
    status === "open"
      ? "Open"
      : status
        ? taskStatusLabels[status]
        : undefined;
  const dueLabel =
    due === "today"
      ? "Due Today"
      : due === "overdue"
        ? "Overdue"
        : undefined;
  const metaLabel = q
    ? `Search: ${q}`
    : selectedAssignee
      ? `Assigned: ${selectedAssignee}`
      : statusLabel
        ? `Status: ${statusLabel}`
        : dueLabel
          ? `Due: ${dueLabel}`
          : "Authorized organization tasks";

  return {
    assignee,
    assignees,
    counts,
    due,
    hasFilters,
    metaLabel,
    q,
    rows,
    status,
    timezone: data.timezone,
    workloads: data.workloads,
  };
}

export type TasksPageModelPromise = ReturnType<typeof resolveTasksPageModel>;

export async function TaskKpisServerSection({
  modelPromise,
}: {
  modelPromise: TasksPageModelPromise;
}) {
  const model = await modelPromise;
  return <TaskKpis counts={model.counts} status={model.status} due={model.due} />;
}

export async function TaskWorkloadServerSection({
  modelPromise,
}: {
  modelPromise: TasksPageModelPromise;
}) {
  const model = await modelPromise;
  return <TaskAssignedUserWorkloads workloads={model.workloads} />;
}

export async function TaskRegisterServerSection({
  modelPromise,
}: {
  modelPromise: TasksPageModelPromise;
}) {
  const model = await modelPromise;

  return (
    <section className="panel">
      <TaskFilters
        q={model.q}
        status={model.status}
        due={model.due}
        assignee={model.assignee}
        assignees={model.assignees}
      />

      <div className="table-meta">
        <span>
          <b>{model.rows.length}</b> tasks
        </span>
        <span>{model.metaLabel}</span>
      </div>

      {model.rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Case</th>
                <th>Status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map(({ task, item }) => (
                <NavigableRow
                  key={task.id}
                  href={`/cases/${item.id}`}
                  label={`Open case ${item.case_number}`}
                >
                  <td>
                    <b>{task.title}</b>
                  </td>
                  <td>
                    <Link className="case-link" href={`/cases/${item.id}`}>
                      {item.case_number}
                    </Link>
                  </td>
                  <td>
                    <Badge value={task.status} />
                  </td>
                  <td>{formatOrganizationDate(task.due_at, model.timezone)}</td>
                </NavigableRow>
              ))}
            </tbody>
          </table>
        </div>
      ) : model.hasFilters ? (
        <div className="no-results">No tasks match these filters.</div>
      ) : (
        <div className="no-results">No tasks are available.</div>
      )}
    </section>
  );
}
