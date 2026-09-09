import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { TaskFilters } from "@/components/task-filters";
import { getLiveOrganizationData } from "@/lib/data/case-repository";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";
import { matchesTaskFilter, matchesTaskSearch, normalizeTaskDue, normalizeTaskQuery, normalizeTaskStatus, taskStatusLabels } from "@/lib/operational-filters";

type Params = { q?: string; status?: string; due?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const [data, query] = await Promise.all([getLiveOrganizationData(), searchParams]);
  const q = normalizeTaskQuery(query.q);
  const status = normalizeTaskStatus(query.status);
  const due = normalizeTaskDue(query.due);
  const allRows = data.cases.flatMap((item) => item.tasks.map((task) => ({ task, item })));
  const rows = allRows.filter(({ task, item }) => matchesTaskFilter(task, status, due, data.timezone) && matchesTaskSearch(task, item.case_number, q));
  const hasFilters = Boolean(q || status || due);
  const statusLabel = status === "open" ? "Open" : status ? taskStatusLabels[status] : undefined;
  const dueLabel = due === "today" ? "Due Today" : due === "overdue" ? "Overdue" : undefined;
  return <><PageHeader eyebrow="Staff Work" title="Tasks" description="Coordinate assignments and work across the team."/><section className="panel"><TaskFilters q={q} status={status} due={due}/><div className="table-meta"><span><b>{rows.length}</b> tasks</span><span>{q ? `Search: ${q}` : statusLabel ? `Status: ${statusLabel}` : dueLabel ? `Due: ${dueLabel}` : "Authorized organization tasks"}</span></div>{rows.length ? <div className="table-scroll"><table><thead><tr><th>Task</th><th>Case</th><th>Status</th><th>Due</th></tr></thead><tbody>{rows.map(({ task, item }) => <tr key={task.id}><td><b>{task.title}</b></td><td><Link className="case-link" href={`/cases/${item.id}`}>{item.case_number}</Link></td><td><Badge value={task.status}/></td><td>{formatOrganizationDateTime(task.due_at, data.timezone)}</td></tr>)}</tbody></table></div> : hasFilters ? <div className="no-results">No tasks match these filters.</div> : <div className="no-results">No tasks are available.</div>}</section></>;
}
