"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CaseTable } from "./case-table";
import type { LiveCase } from "@/lib/data/case-repository";
import { ApplicationIcon } from "@/components/application-icon";

export interface CaseFilters {
  query?: string;
  status?: string;
  priority?: string;
  assignment?: string;
  view?: string;
}

export function CasesRegister({
  items,
  filters,
}: {
  items: LiveCase[];
  filters: CaseFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.query ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateSearchUrl = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = value.trim().slice(0, 200);

    if (trimmed) {
      params.set("query", trimmed);
    } else {
      params.delete("query");
    }

    params.delete("page");

    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, {
      scroll: false,
    });
  };

  const changeSearch = (value: string) => {
    const next = value.slice(0, 200);
    setSearch(next);

    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      updateSearchUrl(next);
    }, 300);
  };

  const clearSearch = () => {
    if (timer.current) clearTimeout(timer.current);
    setSearch("");
    updateSearchUrl("");
  };

  return (
    <section className="panel">
      <form className="filters" action="/cases" method="get">
        {filters.view ? (
          <input type="hidden" name="view" value={filters.view} />
        ) : null}

        <label className="search">
          <ApplicationIcon name="search" />
          <input
            type="search"
            name={search.trim() ? "query" : undefined}
            value={search}
            maxLength={200}
            placeholder="Search cases, customers, or titles…"
            autoComplete="off"
            onChange={(event) => changeSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />
          {search ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear case search"
            >
              <ApplicationIcon name="close" />
            </button>
          ) : null}
        </label>

        <select
          aria-label="Filter by status"
          name="status"
          defaultValue={filters.status ?? "ALL"}
        >
          <option value="ALL">All statuses</option>
          {[
            ["active", "Active"],
            ["new", "New"],
            ["assigned", "Assigned"],
            ["in-progress", "In Progress"],
            ["waiting", "Waiting"],
            ["completed", "Completed"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by priority"
          name="priority"
          defaultValue={filters.priority ?? "ALL"}
        >
          <option value="ALL">All priorities</option>
          {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>

        <select
          aria-label="Filter by assignment"
          name="assignment"
          defaultValue={filters.assignment ?? "ALL"}
        >
          <option value="ALL">All assignments</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="UNASSIGNED">Unassigned</option>
        </select>

        <button className="filter-button" type="submit">
          <ApplicationIcon name="filter" />
          Apply
        </button>
      </form>

      <div className="table-meta">
        <span>
          <b>{items.length}</b> cases
        </span>
        <span>
          {filters.status && filters.status !== "ALL"
            ? `Status: ${filters.status.replaceAll("-", " ")}`
            : "Live organization data"}
        </span>
      </div>

      {items.length ? (
        <CaseTable items={items} />
      ) : (
        <div className="no-results">No cases match these filters.</div>
      )}
    </section>
  );
}
