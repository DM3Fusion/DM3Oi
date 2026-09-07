"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type CommunicationsFilterValues = {
  status: "all" | "unread" | "read" | "archived";
  source: "all" | "service-request" | "case" | "task" | "other";
  range: "all" | "today" | "7d" | "30d";
  q: string;
};

export function CommunicationsFilters({ values, recipientStatus = false }: { values: CommunicationsFilterValues; recipientStatus?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState(values.q);
  const [previousQuery, setPreviousQuery] = useState(values.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (values.q !== previousQuery) {
    setPreviousQuery(values.q);
    setSearch(values.q);
  }

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);
  const update = (name: keyof CommunicationsFilterValues, value: string) => {
    const params = new URLSearchParams(window.location.search);
    const normalized = name === "q" ? value.trim() : value;
    if (normalized === "all" || !normalized) params.delete(name);
    else params.set(name, normalized);
    if (name !== "q" && search.trim()) params.set("q", search.trim());
    const destination = `${pathname}${params.size ? `?${params.toString()}` : ""}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (destination !== current) router.push(destination);
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => update("q", value), 300);
  };
  const clearSearch = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch("");
    update("q", "");
  };

  return <form key={`${values.status}:${values.source}:${values.range}`} className="communications-filters" aria-label="Filter communications" onSubmit={(event) => event.preventDefault()}>
    <label className="communications-search"><span>Search</span><span className="communications-search-control"><input type="search" name="q" value={search} onChange={(event) => changeSearch(event.currentTarget.value)} placeholder="Search communications..." autoComplete="off" />{search ? <button type="button" onClick={clearSearch} aria-label="Clear communications search">×</button> : null}</span></label>
    <label><span>Status</span><select name="status" defaultValue={values.status} onChange={(event) => update("status", event.currentTarget.value)}><option value="all">All</option><option value="unread">{recipientStatus ? "Recipient unread" : "Unread"}</option><option value="read">{recipientStatus ? "Recipient read" : "Read"}</option><option value="archived">Archived</option></select></label>
    <label><span>Source</span><select name="source" defaultValue={values.source} onChange={(event) => update("source", event.currentTarget.value)}><option value="all">All sources</option><option value="service-request">Service Requests</option><option value="case">Cases</option><option value="task">Tasks</option><option value="other">Other</option></select></label>
    <label><span>Date</span><select name="range" defaultValue={values.range} onChange={(event) => update("range", event.currentTarget.value)}><option value="all">All time</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
  </form>;
}
