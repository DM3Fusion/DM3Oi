import Link from "next/link";
import { Badge } from "@/components/ui";
import { NavigableRow } from "@/components/navigable-row";
import { getLiveOrganizationData, displayName } from "@/lib/data/case-repository";
import { formatServiceRequestUpdatedAt, serviceRequestLabel, serviceRequestPriorities, serviceRequestStatuses } from "@/lib/service-request-format";

export const metadata = { title: "Service Requests" };

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const data = await getLiveOrganizationData();
  const q = await searchParams;
  const term = (q?.q ?? "").toLowerCase();
  const status = q?.status === "open" || q?.status === "resolved" || serviceRequestStatuses.includes(q?.status as (typeof serviceRequestStatuses)[number]) ? q?.status : undefined;
  const priority = serviceRequestPriorities.includes(q?.priority as (typeof serviceRequestPriorities)[number]) ? q?.priority : undefined;
  const assignment = q?.assignment;
  const customer = q?.customer;
  const range = q?.range;
  const cutoff = range && range !== "all" ? new Date().getTime() - Number(range.replace("d", "")) * 86400000 : 0;
  const rows = data.serviceRequests.filter((item) =>
    (!term || item.request_number.toLowerCase().includes(term) || item.subject.toLowerCase().includes(term) || item.customer?.name.toLowerCase().includes(term) || item.customer?.customer_number.toLowerCase().includes(term)) &&
    (!customer || item.customer_id === customer) &&
    (!status || (status === "open" ? ["NEW", "OPEN", "PENDING_CUSTOMER", "PENDING_STAFF", "ON_HOLD"].includes(item.status) : status === "resolved" ? ["RESOLVED", "CLOSED"].includes(item.status) : item.status === status)) &&
    (!priority || item.priority === priority) &&
    (!assignment || (assignment === "unassigned" && !item.assigned_user_id) || (assignment !== "unassigned" && item.assigned_user_id === assignment)) &&
    (!cutoff || new Date(item.updated_at).getTime() >= cutoff)
  );
  const hasFilters = Boolean(term || status || priority || assignment || customer || range);

  return <>
    <div className="page-header"><div><span className="eyebrow">Customer Service</span><h1>Service Requests</h1><p>{rows.length} matching requests</p></div><Link className="primary-button" href="/service-desk/new">＋ New Service Request</Link></div>
    <section className="panel">
      <form className="filters" method="get">
        <input className="search" name="q" placeholder="Search requests" defaultValue={q?.q ?? ""} />
        <select name="customer" defaultValue={customer ?? ""}><option value="">All customers</option>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select name="status" defaultValue={status ?? ""}><option value="">All statuses</option>{serviceRequestStatuses.map((value) => <option key={value} value={value}>{serviceRequestLabel(value)}</option>)}<option value="open">Open</option><option value="resolved">Resolved</option></select>
        <select name="priority" defaultValue={priority ?? ""}><option value="">All priorities</option>{serviceRequestPriorities.map((value) => <option key={value} value={value}>{serviceRequestLabel(value)}</option>)}</select>
        <select name="assignment" defaultValue={assignment ?? ""}><option value="">All assignments</option><option value="unassigned">Unassigned</option>{data.staff.map((item) => <option key={item.membership.user_id} value={item.membership.user_id}>{displayName(item.profile)}</option>)}</select>
        <select name="range" defaultValue={range ?? "all"}><option value="all">All time</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select>
        {hasFilters && <Link href="/service-desk/requests">Clear filters</Link>}
      </form>
      {rows.length ? <div className="table-scroll"><table><thead><tr><th>Request</th><th>Customer</th><th>Subject</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Updated</th></tr></thead><tbody>{rows.map((request) => <NavigableRow key={request.id} href={`/service-desk/${request.id}`} label={`Open service request ${request.request_number}`}><td><b className="case-link">{request.request_number}</b></td><td>{request.customer?.name ?? "—"}</td><td><b>{request.subject}</b></td><td><Badge value={request.priority} /></td><td><Badge value={request.status} /></td><td>{displayName(request.assigned)}</td><td>{formatServiceRequestUpdatedAt(request.updated_at, data.timezone)}</td></NavigableRow>)}</tbody></table></div> : <div className="empty compact-empty"><h2>{hasFilters ? "No service requests match these filters." : "No service requests yet"}</h2><p>{hasFilters ? "Try clearing one or more filters." : "Create the first service request to begin tracking customer support work."}</p></div>}
    </section>
  </>;
}
