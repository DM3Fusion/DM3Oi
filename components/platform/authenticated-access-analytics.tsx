"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Summary = {
  internalVisits: number;
  internalUniquePages: number;
  internalPageViews: number;
  customerPortalVisits: number;
  customerPortalUniquePages: number;
  customerPortalPageViews: number;
  unclassifiedAuthenticatedVisits: number;
  unclassifiedAuthenticatedUniquePages: number;
  unclassifiedAuthenticatedPageViews: number;
  publicVisits: number;
  publicUniquePages: number;
  publicPageViews: number;
};

type RouteActivity = {
  path: string;
  visits: number;
  pageViews: number;
  lastActivity: string | null;
};

type AccessRow = {
  identityKey: string;
  user: string;
  email: string | null;
  accountIdentifier: string;
  accessType: string;
  role: string | null;
  organization: string;
  pageViews: number;
  sessions: number;
  uniquePages: number;
  lastActivity: string | null;
  topRoute: string | null;
  geography: string | null;
  activity: RouteActivity[];
};

type AuthenticatedAccessData = {
  summary: Summary;
  rows: AccessRow[];
};

function recordOf(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

function numberOf(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : 0;
}

function stringOf(
  value: unknown,
  fallback = "",
) {
  return typeof value === "string"
    ? value
    : fallback;
}

function nullableStringOf(value: unknown) {
  return typeof value === "string"
    ? value
    : null;
}

function parseActivity(value: unknown): RouteActivity[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    const row = recordOf(entry);

    return {
      path: stringOf(row.path, "/"),
      visits: numberOf(row.visits),
      pageViews: numberOf(row.pageViews),
      lastActivity: nullableStringOf(
        row.lastActivity,
      ),
    };
  });
}

function parseAuthenticatedAccess(
  value: unknown,
): AuthenticatedAccessData {
  const root = recordOf(value);
  const summary = recordOf(root.summary);

  const rows = Array.isArray(root.rows)
    ? root.rows.map((entry) => {
        const row = recordOf(entry);

        return {
          identityKey: stringOf(
            row.identityKey,
            "unavailable",
          ),
          user: stringOf(
            row.user,
            "Unavailable account",
          ),
          email: nullableStringOf(row.email),
          accountIdentifier: stringOf(
            row.accountIdentifier,
            "Unavailable account",
          ),
          accessType: stringOf(
            row.accessType,
            "AUTHENTICATED_HISTORICAL",
          ),
          role: nullableStringOf(row.role),
          organization: stringOf(
            row.organization,
            "Not captured",
          ),
          pageViews: numberOf(row.pageViews),
          sessions: numberOf(row.sessions),
          uniquePages: numberOf(
            row.uniquePages,
          ),
          lastActivity: nullableStringOf(
            row.lastActivity,
          ),
          topRoute: nullableStringOf(
            row.topRoute,
          ),
          geography: nullableStringOf(
            row.geography,
          ),
          activity: parseActivity(row.activity),
        };
      })
    : [];

  return {
    summary: {
      internalVisits: numberOf(
        summary.internalVisits,
      ),
      internalUniquePages: numberOf(
        summary.internalUniquePages,
      ),
      internalPageViews: numberOf(
        summary.internalPageViews,
      ),

      customerPortalVisits: numberOf(
        summary.customerPortalVisits,
      ),
      customerPortalUniquePages: numberOf(
        summary.customerPortalUniquePages,
      ),
      customerPortalPageViews: numberOf(
        summary.customerPortalPageViews,
      ),

      unclassifiedAuthenticatedVisits:
        numberOf(
          summary.unclassifiedAuthenticatedVisits,
        ),
      unclassifiedAuthenticatedUniquePages:
        numberOf(
          summary.unclassifiedAuthenticatedUniquePages,
        ),
      unclassifiedAuthenticatedPageViews:
        numberOf(
          summary.unclassifiedAuthenticatedPageViews,
        ),

      publicVisits: numberOf(
        summary.publicVisits,
      ),
      publicUniquePages: numberOf(
        summary.publicUniquePages,
      ),
      publicPageViews: numberOf(
        summary.publicPageViews,
      ),
    },
    rows,
  };
}

function humanize(value: string | null) {
  if (!value) {
    return "Not captured";
  }

  return value
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

function accessTypeLabel(value: string) {
  switch (value) {
    case "INTERNAL":
      return "Internal";
    case "CUSTOMER_PORTAL":
      return "Customer Portal";
    case "AUTHENTICATED_UNCLASSIFIED":
      return "Authenticated / Unclassified";
    case "AUTHENTICATED_HISTORICAL":
      return "Authenticated / Historical";
    default:
      return humanize(value);
  }
}

function formatActivityTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function rowKey(row: AccessRow) {
  return [
    row.identityKey,
    row.organization,
    row.accessType,
    row.role ?? "",
  ].join(":");
}

function Metric({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <span className="admin-authenticated-access-summary-metric">
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  );
}

export function AuthenticatedAccessAnalytics({
  data,
}: {
  data: unknown;
}) {
  const parsed = useMemo(
    () => parseAuthenticatedAccess(data),
    [data],
  );

  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] =
    useState<string | null>(null);

  const closeButtonRef =
    useRef<HTMLButtonElement>(null);

  const normalizedQuery = query
    .trim()
    .toLowerCase();

  const visibleRows = useMemo(() => {
    if (!normalizedQuery) {
      return parsed.rows;
    }

    return parsed.rows.filter((row) =>
      [
        row.user,
        row.email ?? "",
        row.accountIdentifier,
        accessTypeLabel(row.accessType),
        humanize(row.role),
        row.organization,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery, parsed.rows]);

  const selectedRow =
    selectedKey === null
      ? null
      : parsed.rows.find(
          (row) => rowKey(row) === selectedKey,
        ) ?? null;

  useEffect(() => {
    if (!selectedRow) {
      return;
    }

    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedKey(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
    };
  }, [selectedRow]);

  const summaryCards = [
    {
      label: "Authenticated Internal",
      visits: parsed.summary.internalVisits,
      pages: parsed.summary.internalUniquePages,
      pageViews:
        parsed.summary.internalPageViews,
    },
    {
      label: "Customer Portal",
      visits:
        parsed.summary.customerPortalVisits,
      pages:
        parsed.summary.customerPortalUniquePages,
      pageViews:
        parsed.summary.customerPortalPageViews,
    },
    {
      label: "Authenticated / Unclassified",
      visits:
        parsed.summary
          .unclassifiedAuthenticatedVisits,
      pages:
        parsed.summary
          .unclassifiedAuthenticatedUniquePages,
      pageViews:
        parsed.summary
          .unclassifiedAuthenticatedPageViews,
    },
    {
      label: "Public / Anonymous",
      visits: parsed.summary.publicVisits,
      pages:
        parsed.summary.publicUniquePages,
      pageViews:
        parsed.summary.publicPageViews,
    },
  ];

  return (
    <section
      aria-labelledby="authenticated-access-heading"
      className="admin-authenticated-access"
    >
      <div className="admin-authenticated-access-heading">
        <div>
          <h3 id="authenticated-access-heading">
            Authenticated Access
          </h3>
          <p>
            First-party authenticated identities for this
            reporting period. Network geography is supporting
            context only.
          </p>
        </div>

        <label className="admin-authenticated-access-search">
          <span className="sr-only">
            Filter authenticated access by user or organization
          </span>
          <input
            aria-label="Filter authenticated access by user or organization"
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Filter user or organization..."
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="admin-authenticated-access-summary">
        {summaryCards.map((card) => (
          <article key={card.label}>
            <span className="admin-authenticated-access-summary-label">
              {card.label}
            </span>

            <div className="admin-authenticated-access-summary-metrics">
              <Metric
                label={
                  card.visits === 1
                    ? "visit"
                    : "visits"
                }
                value={card.visits}
              />
              <Metric
                label={
                  card.pages === 1
                    ? "page"
                    : "pages"
                }
                value={card.pages}
              />
              <Metric
                label="page views"
                value={card.pageViews}
              />
            </div>
          </article>
        ))}
      </div>

      <div className="table-scroll">
        <table className="admin-authenticated-access-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Account</th>
              <th>Access Type / Role</th>
              <th>Organization</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((row) => (
              <tr
                aria-haspopup="dialog"
                aria-label={`View activity for ${row.user}`}
                className="admin-authenticated-access-row"
                key={rowKey(row)}
                onClick={() =>
                  setSelectedKey(rowKey(row))
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" ||
                    event.key === " "
                  ) {
                    event.preventDefault();
                    setSelectedKey(rowKey(row));
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <td>
                  <strong>{row.user}</strong>
                </td>
                <td>
                  <span>
                    {row.accountIdentifier}
                  </span>
                </td>
                <td>
                  <span className="admin-authenticated-access-type">
                    {accessTypeLabel(
                      row.accessType,
                    )}
                  </span>
                  <small>
                    {humanize(row.role)}
                  </small>
                </td>
                <td>{row.organization}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visibleRows.length === 0 ? (
        <p className="muted admin-authenticated-access-empty">
          No authenticated access groups match this filter.
        </p>
      ) : null}

      <p className="admin-authenticated-access-note">
        {visibleRows.length} authenticated access{" "}
        {visibleRows.length === 1
          ? "group"
          : "groups"}{" "}
        shown. Select a user row to review aggregate activity.
        Historical rows without a captured access category
        remain labeled historical; anonymous rows are never
        assigned to a user.
      </p>

      {selectedRow ? (
        <div
          aria-labelledby="authenticated-activity-title"
          aria-modal="true"
          className="admin-authenticated-access-modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setSelectedKey(null);
            }
          }}
          role="dialog"
        >
          <div className="admin-authenticated-access-modal">
            <div className="admin-authenticated-access-modal-heading">
              <div>
                <h4 id="authenticated-activity-title">
                  {selectedRow.user}
                </h4>
                <p>
                  {selectedRow.accountIdentifier}
                </p>
              </div>

              <button
                aria-label="Close activity details"
                className="admin-authenticated-access-modal-close"
                onClick={() =>
                  setSelectedKey(null)
                }
                ref={closeButtonRef}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="admin-authenticated-access-modal-context">
              <span>
                <strong>Access</strong>
                {accessTypeLabel(
                  selectedRow.accessType,
                )}
                {selectedRow.role
                  ? ` · ${humanize(
                      selectedRow.role,
                    )}`
                  : ""}
              </span>

              <span>
                <strong>Organization</strong>
                {selectedRow.organization}
              </span>
            </div>

            <div className="admin-authenticated-access-modal-metrics">
              <article>
                <strong>
                  {selectedRow.sessions}
                </strong>
                <span>
                  {selectedRow.sessions === 1
                    ? "Visit"
                    : "Visits"}
                </span>
              </article>

              <article>
                <strong>
                  {selectedRow.uniquePages}
                </strong>
                <span>
                  {selectedRow.uniquePages === 1
                    ? "Page"
                    : "Pages"}
                </span>
              </article>

              <article>
                <strong>
                  {selectedRow.pageViews}
                </strong>
                <span>Page Views</span>
              </article>
            </div>

            <div className="admin-authenticated-access-modal-context">
              <span>
                <strong>Last Activity</strong>
                {formatActivityTime(
                  selectedRow.lastActivity,
                )}
              </span>

              <span>
                <strong>
                  Approx. Network Geography
                </strong>
                {selectedRow.geography ??
                  "Not captured"}
              </span>
            </div>

            <div className="admin-authenticated-access-modal-activity">
              <h5>Page Activity</h5>

              {selectedRow.activity.length === 0 ? (
                <p className="muted">
                  No route activity is available for this
                  reporting period.
                </p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Page</th>
                        <th>Visits</th>
                        <th>Page Views</th>
                        <th>Last Activity</th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedRow.activity.map(
                        (activity) => (
                          <tr key={activity.path}>
                            <td>
                              <code>
                                {activity.path}
                              </code>
                            </td>
                            <td>
                              {activity.visits}
                            </td>
                            <td>
                              {activity.pageViews}
                            </td>
                            <td>
                              {formatActivityTime(
                                activity.lastActivity,
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
