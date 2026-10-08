"use client";

import { useMemo, useState } from "react";

type GeographyRow = {
  label: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  visits: number;
  uniquePages: number;
};

function coordinateLabel(row: GeographyRow) {
  if (
    typeof row.latitude !== "number" ||
    !Number.isFinite(row.latitude) ||
    typeof row.longitude !== "number" ||
    !Number.isFinite(row.longitude)
  ) {
    return null;
  }

  return `${row.latitude.toFixed(2)}, ${row.longitude.toFixed(2)}`;
}

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
            Unique visits grouped by approximate network
            location, with the number of distinct pages viewed
            from each location.
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

      <div className="admin-geography-table">
        <div
          className="admin-geography-table-header"
          aria-hidden="true"
        >
          <span>Location</span>
          <span>Visits</span>
          <span>Pages</span>
        </div>

        {visibleRows.length === 0 ? (
          <p className="muted admin-top-pages-empty">
            No locations match this filter.
          </p>
        ) : (
          visibleRows.map((row) => (
            <div
              className="admin-geography-row"
              key={[
                row.label,
                row.postalCode,
                row.latitude,
                row.longitude,
              ].join(":")}
            >
              <span className="admin-geography-location">
                {row.label}
                {coordinateLabel(row) ? (
                  <small className="admin-geography-coordinate">
                    Approx. network: {coordinateLabel(row)}
                  </small>
                ) : null}
              </span>

              <strong
                className="admin-geography-value"
                aria-label={`${row.visits} ${
                  row.visits === 1 ? "visit" : "visits"
                }`}
              >
                {row.visits}
              </strong>

              <strong
                className="admin-geography-value"
                aria-label={`${row.uniquePages} unique ${
                  row.uniquePages === 1 ? "page" : "pages"
                }`}
              >
                {row.uniquePages}
              </strong>
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
