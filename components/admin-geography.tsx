"use client";

import { useMemo, useState } from "react";

type GeographyRow = {
  label: string;
  pageViews: number;
};

export function AdminGeography({
  rows,
}: {
  rows: GeographyRow[];
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const normalizedQuery = query
    .trim()
    .toLowerCase();

  const filteredRows = useMemo(() => {
    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter((row) =>
      row.label
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery, rows]);

  const visibleRows =
    showAll || normalizedQuery
      ? filteredRows
      : filteredRows.slice(0, 6);

  const canToggle =
    !normalizedQuery && rows.length > 6;

  return (
    <article className="admin-analytics-panel admin-geography-panel">
      <div className="admin-analytics-panel-heading admin-top-pages-heading">
        <div>
          <h3>Geography</h3>
          <p className="muted">
            Approximate network-derived location.
          </p>
        </div>

        <div className="admin-top-pages-controls">
          <label className="admin-top-pages-search">
            <span className="sr-only">
              Filter geography
            </span>

            <input
              aria-label="Filter geography"
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Filter geography..."
              type="search"
              value={query}
            />
          </label>

          {canToggle ? (
            <button
              className="admin-top-pages-toggle"
              onClick={() =>
                setShowAll((current) => !current)
              }
              type="button"
            >
              {showAll
                ? "Show Top 6"
                : "View All"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-analytics-breakdown">
        {visibleRows.length === 0 ? (
          <p className="muted admin-top-pages-empty">
            No locations match this filter.
          </p>
        ) : (
          visibleRows.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <strong>{row.pageViews}</strong>
            </div>
          ))
        )}
      </div>

      {rows.length > 6 &&
      !normalizedQuery &&
      !showAll ? (
        <p className="admin-top-pages-summary muted">
          Showing 6 of {rows.length} locations
        </p>
      ) : null}

      {normalizedQuery ? (
        <p className="admin-top-pages-summary muted">
          {filteredRows.length}{" "}
          {filteredRows.length === 1
            ? "location"
            : "locations"}{" "}
          matched
        </p>
      ) : null}
    </article>
  );
}
