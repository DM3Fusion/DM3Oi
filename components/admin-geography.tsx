"use client";

import { useMemo, useState } from "react";
import { formatGeographyLastAccessed } from "@/lib/platform-analytics-geography";

type GeographyRow = {
  label: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  visits: number;
  uniquePages: number;
  lastAccessedAt: string | null;
};

type GeographySort =
  | "latest"
  | "oldest"
  | "most-visits"
  | "fewest-visits"
  | "most-pages"
  | "fewest-pages"
  | "location-asc"
  | "location-desc";

function geographyTimestamp(value: string | null): number | null {
  if (!value) return null;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareGeographyRows(
  left: GeographyRow,
  right: GeographyRow,
  sort: GeographySort,
): number {
  const alphabetical = left.label.localeCompare(right.label);

  if (sort === "location-asc") return alphabetical;
  if (sort === "location-desc") return -alphabetical;

  if (sort === "most-visits") {
    return right.visits - left.visits || alphabetical;
  }

  if (sort === "fewest-visits") {
    return left.visits - right.visits || alphabetical;
  }

  if (sort === "most-pages") {
    return right.uniquePages - left.uniquePages || alphabetical;
  }

  if (sort === "fewest-pages") {
    return left.uniquePages - right.uniquePages || alphabetical;
  }

  const leftTimestamp = geographyTimestamp(left.lastAccessedAt);
  const rightTimestamp = geographyTimestamp(right.lastAccessedAt);

  // Missing or invalid timestamps always appear last.
  if (leftTimestamp === null && rightTimestamp !== null) return 1;
  if (rightTimestamp === null && leftTimestamp !== null) return -1;
  if (leftTimestamp === null && rightTimestamp === null) {
    return alphabetical;
  }

  return (
    sort === "latest"
      ? rightTimestamp! - leftTimestamp!
      : leftTimestamp! - rightTimestamp!
  ) || alphabetical;
}

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

function secondaryLocationLabel(row: GeographyRow) {
  const coordinates = coordinateLabel(row);
  const lastAccessed = formatGeographyLastAccessed(
    row.lastAccessedAt,
  );

  return [
    coordinates ? `Approx. network: ${coordinates}` : null,
    lastAccessed ? `Last accessed: ${lastAccessed}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AdminGeography({
  rows,
}: {
  rows: GeographyRow[];
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState<GeographySort>("latest");

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

  const sortedRows = useMemo(
    () =>
      [...filteredRows].sort((left, right) =>
        compareGeographyRows(left, right, sortBy),
      ),
    [filteredRows, sortBy],
  );

  const visibleRows =
    showAll || normalizedQuery
      ? sortedRows
      : sortedRows.slice(0, 6);

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

          <label className="admin-geography-sort">
            <span className="sr-only">Sort geography by</span>
            <select
              aria-label="Sort geography by"
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value as GeographySort)
              }
            >
              <option value="latest">Latest Activity</option>
              <option value="oldest">Oldest Activity</option>
              <option value="most-visits">Most Visits</option>
              <option value="fewest-visits">Fewest Visits</option>
              <option value="most-pages">Most Pages</option>
              <option value="fewest-pages">Fewest Pages</option>
              <option value="location-asc">Location A–Z</option>
              <option value="location-desc">Location Z–A</option>
            </select>
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
          visibleRows.map((row) => {
            const secondaryLabel = secondaryLocationLabel(row);

            return (
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
                  {secondaryLabel ? (
                    <small className="admin-geography-coordinate">
                      {secondaryLabel}
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
            );
          })
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
