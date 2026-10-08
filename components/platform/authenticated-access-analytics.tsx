"use client";

import { useMemo, useState } from "react";

import type {
  PlatformAuthenticatedAccess,
  PlatformAuthenticatedAccessRow,
} from "@/lib/data/platform-analytics-repository";

const accessTypeLabels: Record<
  PlatformAuthenticatedAccessRow["accessType"],
  string
> = {
  INTERNAL: "Internal",
  CUSTOMER_PORTAL: "Customer Portal",
  AUTHENTICATED_UNCLASSIFIED: "Authenticated / Unclassified",
  AUTHENTICATED_HISTORICAL: "Authenticated / Historical",
};

function readableRole(role: string | null) {
  if (!role) return "Not recorded";

  return role
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

function formattedActivity(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date) + " UTC";
}

export function AuthenticatedAccessAnalytics({
  data,
}: {
  data: PlatformAuthenticatedAccess;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query
    .trim()
    .toLowerCase();

  const rows = useMemo(() => {
    if (!normalizedQuery) return data.rows;

    return data.rows.filter((row) =>
      [
        row.user,
        row.email,
        row.accountIdentifier,
        row.organization,
        accessTypeLabels[row.accessType],
        row.role,
      ].some((value) =>
        value
          ?.toLowerCase()
          .includes(normalizedQuery),
      ),
    );
  }, [data.rows, normalizedQuery]);

  const summary = [
    {
      label: "Authenticated Internal",
      value: data.summary.internalPageViews,
    },
    {
      label: "Customer Portal",
      value: data.summary.customerPortalPageViews,
    },
    {
      label: "Authenticated / Unclassified",
      value:
        data.summary
          .unclassifiedAuthenticatedPageViews,
    },
    {
      label: "Public / Anonymous",
      value: data.summary.publicPageViews,
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
            First-party authenticated identities for
            this reporting period. Network geography is
            supporting context only.
          </p>
        </div>

        <label className="admin-authenticated-access-search">
          <span className="sr-only">
            Filter authenticated access by user or
            organization
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
        {summary.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>
              {item.value.toLocaleString("en-US")}
            </strong>
            <small>page views</small>
          </article>
        ))}
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Account</th>
              <th>Access Type / Role</th>
              <th>Organization</th>
              <th>Page Views</th>
              <th>Sessions</th>
              <th>Last Activity</th>
              <th>Top Route</th>
              <th>Approx. Network Geography</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={[
                  row.identityKey,
                  row.organization,
                  row.accessType,
                  row.role,
                ].join(":")}
              >
                <td>
                  <b>{row.user}</b>
                </td>
                <td>
                  {row.email ??
                    row.accountIdentifier}
                </td>
                <td>
                  <span className="admin-authenticated-access-type">
                    {accessTypeLabels[row.accessType]}
                  </span>
                  <small>
                    {readableRole(row.role)}
                  </small>
                </td>
                <td>{row.organization}</td>
                <td>{row.pageViews}</td>
                <td>{row.sessions}</td>
                <td>
                  <time dateTime={row.lastActivity}>
                    {formattedActivity(
                      row.lastActivity,
                    )}
                  </time>
                </td>
                <td>
                  <code>{row.topRoute}</code>
                </td>
                <td>{row.geography}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="muted admin-authenticated-access-empty">
          {normalizedQuery
            ? "No authenticated users match this filter."
            : "No authenticated access was recorded in this reporting period."}
        </p>
      ) : (
        <p className="admin-authenticated-access-note">
          {rows.length} authenticated access{" "}
          {rows.length === 1 ? "group" : "groups"} shown.
          Historical rows without a captured access category
          remain labeled historical; anonymous rows are never
          assigned to a user.
        </p>
      )}
    </section>
  );
}
