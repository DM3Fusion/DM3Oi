"use client";

import { useMemo, useState } from "react";

type TopPage = {
  path: string;
  pageViews: number;
};

export function AdminTopPages({
  pages,
}: {
  pages: TopPage[];
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const normalizedQuery = query
    .trim()
    .toLowerCase();

  const filteredPages = useMemo(() => {
    if (!normalizedQuery) {
      return pages;
    }

    return pages.filter((page) =>
      page.path
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery, pages]);

  const visiblePages =
    showAll || normalizedQuery
      ? filteredPages
      : filteredPages.slice(0, 6);

  const canToggle =
    !normalizedQuery && pages.length > 6;

  return (
    <article className="admin-analytics-panel">
      <div className="admin-analytics-panel-heading admin-top-pages-heading">
        <div>
          <h3>Top Pages</h3>
          <p className="muted">
            Normalized routes by page views.
          </p>
        </div>

        <div className="admin-top-pages-controls">
          <label className="admin-top-pages-search">
            <span className="sr-only">
              Filter pages
            </span>

            <input
              aria-label="Filter pages"
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Filter pages..."
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
        {visiblePages.length === 0 ? (
          <p className="muted admin-top-pages-empty">
            No pages match this filter.
          </p>
        ) : (
          visiblePages.map((page) => (
            <div key={page.path}>
              <code>{page.path}</code>
              <strong>
                {page.pageViews}
              </strong>
            </div>
          ))
        )}
      </div>

      {pages.length > 6 &&
      !normalizedQuery &&
      !showAll ? (
        <p className="admin-top-pages-summary muted">
          Showing 6 of {pages.length} routes
        </p>
      ) : null}

      {normalizedQuery ? (
        <p className="admin-top-pages-summary muted">
          {filteredPages.length}{" "}
          {filteredPages.length === 1
            ? "route"
            : "routes"}{" "}
          matched
        </p>
      ) : null}
    </article>
  );
}
