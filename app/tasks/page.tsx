import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { TaskFilters } from "@/components/task-filters";
import { TaskKpis } from "@/components/task-kpis";
import { TaskAssignedUserWorkloads } from "@/components/task-assigned-user-workloads";
import { NavigableRow } from "@/components/navigable-row";
import { getTaskRegisterData } from "@/lib/data/case-repository";
import { formatOrganizationDate } from "@/lib/organization-timezone";
import {
  matchesTaskFilter,
  matchesTaskSearch,
  normalizeTaskDue,
  normalizeTaskQuery,
  normalizeTaskStatus,
  taskStatusLabels,
} from "@/lib/operational-filters";
import { getTaskDashboardCounts } from "@/lib/task-assignee-workload";

type Params = {
  q?: string;
  status?: string;
  due?: string;
  assignee?: string;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const [data, query] = await Promise.all([
    getTaskRegisterData(),
    searchParams,
  ]);

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

  return (
    <>
      <PageHeader eyebrow="Staff Work" title="Tasks" />

      <TaskKpis counts={counts} status={status} due={due} />

      <TaskAssignedUserWorkloads workloads={data.workloads} />

      <section className="panel">
        <TaskFilters
          q={q}
          status={status}
          due={due}
          assignee={assignee}
          assignees={assignees}
        />

        <div className="table-meta">
          <span>
            <b>{rows.length}</b> tasks
          </span>
          <span>{metaLabel}</span>
        </div>

        {rows.length ? (
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
                {rows.map(({ task, item }) => (
                  <NavigableRow
                    key={task.id}
                    href={`/cases/${item.id}`}
                    label={`Open case ${item.case_number}`}
                  >
                    <td>
                      <b>{task.title}</b>
                    </td>
                    <td>
                      <Link
                        className="case-link"
                        href={`/cases/${item.id}`}
                      >
                        {item.case_number}
                      </Link>
                    </td>
                    <td>
                      <Badge value={task.status} />
                    </td>
                    <td>
                      {formatOrganizationDate(
                        task.due_at,
                        data.timezone,
                      )}
                    </td>
                  </NavigableRow>
                ))}
              </tbody>
            </table>
          </div>
        ) : hasFilters ? (
          <div className="no-results">
            No tasks match these filters.
          </div>
        ) : (
          <div className="no-results">No tasks are available.</div>
        )}
      </section>
    </>
  );
}
