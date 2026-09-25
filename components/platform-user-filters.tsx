"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApplicationIcon } from "@/components/application-icon";
import {
  platformRoleLabels,
  platformStatusLabels,
  platformUserRoles,
  platformUserStatuses,
  type PlatformUserRoleFilter,
  type PlatformUserStatusFilter,
} from "@/lib/platform-user-filters";

export function PlatformUserFilters({
  query,
  role,
  status,
}: {
  query: string;
  role: PlatformUserRoleFilter;
  status: PlatformUserStatusFilter;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(query);
  const [previousQuery, setPreviousQuery] = useState(query);
  const firstSearchRender = useRef(true);

  if (query !== previousQuery) {
    setPreviousQuery(query);
    setSearch(query);
  }

  const replaceParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if (firstSearchRender.current) {
      firstSearchRender.current = false;
      return;
    }
    const timeout = window.setTimeout(
      () => replaceParams({ q: search.trim() || null }),
      300,
    );
    return () => window.clearTimeout(timeout);
    // Search intentionally updates the current URL after a debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(search.trim()) || role !== "ALL" || status !== "ALL";

  return (
    <form
      className="platform-user-filters"
      aria-label="Filter platform users"
      onSubmit={(event) => event.preventDefault()}
    >
      <label className="platform-user-search">
        <span>Search users</span>
        <span className="customer-search-control">
          <ApplicationIcon name="search" className="search-field-icon" />
          <input
            type="search"
            name="q"
            value={search}
            maxLength={200}
            placeholder="Name, email, organization, role…"
            autoComplete="off"
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                replaceParams({ q: null });
              }}
              aria-label="Clear user search"
            >
              <ApplicationIcon name="close" />
            </button>
          ) : null}
        </span>
      </label>

      <label>
        <span>Role</span>
        <select
          name="role"
          value={role}
          onChange={(event) =>
            replaceParams({ role: event.currentTarget.value === "ALL" ? null : event.currentTarget.value })
          }
        >
          <option value="ALL">All roles</option>
          {platformUserRoles.map((value) => (
            <option key={value} value={value}>{platformRoleLabels[value]}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Status</span>
        <select
          name="status"
          value={status}
          onChange={(event) =>
            replaceParams({ status: event.currentTarget.value === "ALL" ? null : event.currentTarget.value })
          }
        >
          <option value="ALL">All statuses</option>
          {platformUserStatuses.map((value) => (
            <option key={value} value={value}>{platformStatusLabels[value]}</option>
          ))}
        </select>
      </label>

      {hasFilters ? (
        <button
          type="button"
          className="secondary-button platform-user-clear"
          onClick={() => {
            setSearch("");
            router.replace(pathname, { scroll: false });
          }}
        >
          Clear Filters
        </button>
      ) : null}
    </form>
  );
}
