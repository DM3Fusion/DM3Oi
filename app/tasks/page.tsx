import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { getLiveOrganizationData } from "@/lib/data/case-repository";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";
import { matchesTaskFilter, normalizeTaskStatus, taskStatuses } from "@/lib/operational-filters";

type Params = { status?: string; due?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const [data, query] = await Promise.all([getLiveOrganizationData(), searchParams]);
  const status = normalizeTaskStatus(query.status);
  const due = query.due === "today" ? "today" : undefined;
  const rows = data.cases.flatMap((item) => item.tasks.map((task) => ({ task, item }))).filter(({ task }) => matchesTaskFilter(task, status, due, data.timezone));
  const hasFilters = Boolean(status || due);
  return <><PageHeader eyebrow="Staff Work" title="Tasks" description="Coordinate assignments and work across the team."/><section className="panel"><form className="filters" action="/tasks" method="get"><select name="status" aria-label="Filter tasks by status" defaultValue={status ?? "all"}><option value="all">All statuses</option>{taskStatuses.map(value => <option key={value} value={value}>{value.replace("-", " ")}</option>)}</select><select name="due" aria-label="Filter tasks by due date" defaultValue={due ?? "all"}><option value="all">Any due date</option><option value="today">Due today</option></select><button className="filter-button" type="submit">Apply</button>{hasFilters && <Link href="/tasks">Clear filters</Link>}</form><div className="table-meta"><span><b>{rows.length}</b> tasks</span><span>{status ? `Status: ${status.replace("-", " ")}` : due ? "Due: Today" : "Authorized organization tasks"}</span></div>{rows.length ? <div className="table-scroll"><table><thead><tr><th>Task</th><th>Case</th><th>Status</th><th>Due</th></tr></thead><tbody>{rows.map(({ task, item }) => <tr key={task.id}><td><b>{task.title}</b></td><td><Link className="case-link" href={`/cases/${item.id}`}>{item.case_number}</Link></td><td><Badge value={task.status}/></td><td>{formatOrganizationDateTime(task.due_at, data.timezone)}</td></tr>)}</tbody></table></div> : <div className="no-results">No tasks match these filters.</div>}</section></>;
}
