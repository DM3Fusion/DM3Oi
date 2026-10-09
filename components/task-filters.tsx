"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  taskStatusLabels,
  taskStatuses,
  type TaskDueFilter,
  type TaskStatusFilter,
} from "@/lib/operational-filters";
import { taskSearchUrl } from "@/lib/task-search-url";
import { ApplicationIcon } from "@/components/application-icon";

type AssigneeOption = {
  id: string;
  name: string;
};

export function TaskFilters({
  q,
  status,
  due,
  assignee,
  assignees,
}: {
  q: string;
  status?: TaskStatusFilter;
  due?: TaskDueFilter;
  assignee?: string;
  assignees: AssigneeOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastServerQuery = useRef(q);
  const pendingQuery = useRef<string | null>(null);

  useEffect(() => {
    if (q === lastServerQuery.current) return;
    lastServerQuery.current = q;
    if (pendingQuery.current !== null) {
      if (q === pendingQuery.current) pendingQuery.current = null;
      return;
    }
    setSearch(q);
  }, [q]);

  useEffect(() => {
    const resyncFromHistory = () => {
      if (timer.current) clearTimeout(timer.current);
      pendingQuery.current = null;
      const nextQuery =
        new URLSearchParams(window.location.search)
          .get("q")
          ?.trim()
          .slice(0, 200) ?? "";
      lastServerQuery.current = nextQuery;
      setSearch(nextQuery);
    };

    window.addEventListener("popstate", resyncFromHistory);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("popstate", resyncFromHistory);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentQuery = params.get("q");

    if (currentQuery !== null && !currentQuery.trim()) {
      pendingQuery.current = "";
      router.replace(taskSearchUrl(pathname, window.location.search, ""), {
        scroll: false,
      });
    }
  }, [pathname, router]);

  const updateSearchUrl = (value: string) => {
    const normalized = value.trim();
    const destination = taskSearchUrl(pathname, window.location.search, value);

    if (
      destination !==
      `${window.location.pathname}${window.location.search}`
    ) {
      pendingQuery.current = normalized;
      router.replace(destination, { scroll: false });
    }
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => updateSearchUrl(value), 300);
  };

  const clearSearch = () => {
    if (timer.current) clearTimeout(timer.current);
    setSearch("");
    updateSearchUrl("");
  };

  const updateFilterUrl = (
    key: "status" | "due" | "assignee",
    value: string,
  ) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    const params = new URLSearchParams(window.location.search);

    if (search.trim()) {
      params.set("q", search.trim());
    } else {
      params.delete("q");
    }

    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    const query = params.toString();
    const destination = query ? `${pathname}?${query}` : pathname;

    if (
      destination !==
      `${window.location.pathname}${window.location.search}`
    ) {
      pendingQuery.current = search.trim();
      router.replace(destination, { scroll: false });
    }
  };

  const prepareClearFilters = () => {
    if (timer.current) clearTimeout(timer.current);
    pendingQuery.current = "";
    setSearch("");
  };

  const hasFilters = Boolean(q || status || due || assignee);

  return (
    <form className="filters task-filters" action="/tasks" method="get">
      <label className="task-search">
        <span className="sr-only">Search tasks</span>
        <span className="customer-search-control">
          <ApplicationIcon name="search" className="search-field-icon" />
          <input type="search" name={search.trim() ? "q" : undefined} value={search}
            maxLength={200}
            onChange={(event) => changeSearch(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
            placeholder="Search tasks, cases, or customers..."
            autoComplete="off"
          />
          {search ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear task search"
            >
              <ApplicationIcon name="close" />
            </button>
          ) : null}
        </span>
      </label>

      <select
        name="status"
        aria-label="Filter tasks by status"
        value={status ?? "all"}
        onChange={(event) =>
          updateFilterUrl("status", event.currentTarget.value)
        }
      >
        <option value="all">All statuses</option>
        {taskStatuses.map((value) => (
          <option key={value} value={value}>
            {taskStatusLabels[value]}
          </option>
        ))}
      </select>

      <select
        name="due"
        aria-label="Filter tasks by due date"
        value={due ?? "all"}
        onChange={(event) =>
          updateFilterUrl("due", event.currentTarget.value)
        }
      >
        <option value="all">Any due date</option>
        <option value="today">Due today</option>
        <option value="overdue">Overdue</option>
      </select>

      <select
        name="assignee"
        aria-label="Filter tasks by assigned user"
        value={assignee ?? "all"}
        onChange={(event) =>
          updateFilterUrl("assignee", event.currentTarget.value)
        }
      >
        <option value="all">All assignments</option>
        {assignees.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>

      {hasFilters ? (
        <Link href="/tasks" onClick={prepareClearFilters}>
          Clear filters
        </Link>
      ) : null}
    </form>
  );
}
