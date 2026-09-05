"use client";

import { usePathname, useRouter } from "next/navigation";

export type CommunicationsFilterValues = {
  status: "all" | "unread" | "read" | "archived";
  source: "all" | "service-request" | "case" | "task" | "other";
  range: "all" | "today" | "7d" | "30d";
};

export function CommunicationsFilters({ values }: { values: CommunicationsFilterValues }) {
  const pathname = usePathname();
  const router = useRouter();
  const update = (name: keyof CommunicationsFilterValues, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value === "all") params.delete(name);
    else params.set(name, value);
    const destination = `${pathname}${params.size ? `?${params.toString()}` : ""}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (destination !== current) router.push(destination);
  };

  return <form key={`${values.status}:${values.source}:${values.range}`} className="communications-filters" aria-label="Filter communications" onSubmit={(event) => event.preventDefault()}>
    <label><span>Status</span><select name="status" defaultValue={values.status} onChange={(event) => update("status", event.currentTarget.value)}><option value="all">All</option><option value="unread">Unread</option><option value="read">Read</option><option value="archived">Archived</option></select></label>
    <label><span>Source</span><select name="source" defaultValue={values.source} onChange={(event) => update("source", event.currentTarget.value)}><option value="all">All sources</option><option value="service-request">Service Requests</option><option value="case">Cases</option><option value="task">Tasks</option><option value="other">Other</option></select></label>
    <label><span>Date</span><select name="range" defaultValue={values.range} onChange={(event) => update("range", event.currentTarget.value)}><option value="all">All time</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
  </form>;
}
