import Link from "next/link";
import { NavigableRow } from "@/components/navigable-row";
import { TrialRequestFilters } from "@/components/trial-request-filters";
import { Badge, PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import {
  trialRequestUseCaseLabels,
  type TrialRequestUseCase,
} from "@/lib/trial-requests";
import type { Database } from "@/types/database.generated";

const statuses = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "DECLINED",
  "CONVERTED",
] as const;

const ranges = [
  "today",
  "7d",
  "custom",
] as const;

type Range = (typeof ranges)[number];

type TrialRequestStatus =
  (typeof statuses)[number];

type TrialRequestRow = {
  id: string;
  request_number: number;
  business_name: string;
  contact_name: string;
  business_email: string;
  primary_use_case: TrialRequestUseCase;
  estimated_users: number;
  status: TrialRequestStatus;
  created_at: string;
};

type TrialRequestDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      trial_requests: {
        Row: TrialRequestRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
};

function validDate(value?: string) {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(
        new Date(`${value}T00:00:00Z`).getTime(),
      ),
  );
}

function dateBounds(
  range: Range,
  from: string,
  through: string,
) {
  const now = new Date();

  if (
    range === "custom" &&
    validDate(from) &&
    validDate(through)
  ) {
    return {
      start: `${from}T00:00:00.000Z`,
      end: `${through}T23:59:59.999Z`,
    };
  }

  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);

  if (range === "7d") {
    start.setUTCDate(start.getUTCDate() - 6);
  }

  return {
    start: start.toISOString(),
    end: now.toISOString(),
  };
}

function previousDateBounds(
  start: string,
  end: string,
) {
  const currentStart = new Date(start);
  const currentEnd = new Date(end);

  const duration =
    currentEnd.getTime() -
    currentStart.getTime();

  const previousEnd = new Date(
    currentStart.getTime() - 1,
  );

  const previousStart = new Date(
    previousEnd.getTime() - duration,
  );

  return {
    start: previousStart.toISOString(),
    end: previousEnd.toISOString(),
  };
}

function percentChange(
  current: number,
  previous: number,
) {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return Math.round(
    ((current - previous) / previous) * 100,
  );
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>(
    (counts, value) => {
      counts[value] =
        (counts[value] ?? 0) + 1;

      return counts;
    },
    {},
  );
}

function userRange(value: number) {
  if (value <= 10) return "1–10";
  if (value <= 15) return "11–15";
  if (value <= 25) return "16–25";
  if (value <= 50) return "26–50";
  if (value <= 100) return "51–100";

  return "More than 100";
}

function trendBuckets(
  rows: TrialRequestRow[],
  start: string,
  end: string,
) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const durationDays = Math.max(
    1,
    Math.ceil(
      (endDate.getTime() -
        startDate.getTime()) /
        86_400_000,
    ),
  );

  const bucketCount = Math.min(
    7,
    Math.max(1, durationDays),
  );

  const bucketDuration =
    (endDate.getTime() -
      startDate.getTime() +
      1) /
    bucketCount;

  return Array.from(
    { length: bucketCount },
    (_, index) => {
      const bucketStart = new Date(
        startDate.getTime() +
          bucketDuration * index,
      );

      const bucketEnd =
        index === bucketCount - 1
          ? endDate
          : new Date(
              startDate.getTime() +
                bucketDuration *
                  (index + 1) -
                1,
            );

      const value = rows.filter(
        (row) => {
          const created = new Date(
            row.created_at,
          ).getTime();

          return (
            created >=
              bucketStart.getTime() &&
            created <=
              bucketEnd.getTime()
          );
        },
      ).length;

      return {
        label:
          new Intl.DateTimeFormat(
            "en-US",
            {
              month: "short",
              day: "numeric",
            },
          ).format(bucketStart),
        value,
      };
    },
  );
}

export default async function TrialRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    range?: string;
    q?: string;
    from?: string;
    through?: string;
  }>;
}) {
  await requireSuperAdmin();

  const params = await searchParams;

  const selectedStatus =
    params.status &&
    statuses.some(
      (status) =>
        status === params.status,
    )
      ? params.status
      : "ALL";

  const selectedRange: Range =
    params.range &&
    ranges.some(
      (range) =>
        range === params.range,
    )
      ? (params.range as Range)
      : "7d";

  const query = (params.q ?? "")
    .trim()
    .slice(0, 200);

  const from = validDate(params.from)
    ? params.from!
    : "";

  const through = validDate(
    params.through,
  )
    ? params.through!
    : "";

  const bounds = dateBounds(
    selectedRange,
    from,
    through,
  );

  const previousBounds =
    previousDateBounds(
      bounds.start,
      bounds.end,
    );

  const supabase = (await createClient()) as ReturnType<
    typeof import("@supabase/ssr").createServerClient<TrialRequestDatabase>
  >;

  const {
    data: periodRequests,
    error,
  } = await supabase
    .from("trial_requests")
    .select(
      "id,request_number,business_name,contact_name,business_email,primary_use_case,estimated_users,status,created_at",
    )
    .gte("created_at", bounds.start)
    .lte("created_at", bounds.end)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(
      "Trial request lookup failed:",
      error,
    );
  }

  const rows =
    (periodRequests ??
      []) as TrialRequestRow[];

  const {
    count: previousRequestCount,
    error: previousPeriodError,
  } = await supabase
    .from("trial_requests")
    .select("id", {
      count: "exact",
      head: true,
    })
    .gte(
      "created_at",
      previousBounds.start,
    )
    .lte(
      "created_at",
      previousBounds.end,
    );

  if (previousPeriodError) {
    console.error(
      "Previous trial request period lookup failed:",
      previousPeriodError,
    );
  }

  const normalizedQuery =
    query.toLowerCase();

  const filteredRows = rows.filter(
    (request) => {
      if (
        selectedStatus !== "ALL" &&
        request.status !==
          selectedStatus
      ) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const useCase =
        trialRequestUseCaseLabels[
          request.primary_use_case
        ];

      return [
        String(
          request.request_number,
        ),
        request.business_name,
        request.contact_name,
        request.business_email,
        useCase,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    },
  );

  const statusCounts = countBy(
    rows.map(
      (request) =>
        request.status,
    ),
  );

  const useCaseCounts = countBy(
    rows.map(
      (request) =>
        request.primary_use_case,
    ),
  );

  const userCounts = countBy(
    rows.map((request) =>
      userRange(
        request.estimated_users,
      ),
    ),
  );

  const statusData = statuses.map(
    (status) => ({
      label:
        status.charAt(0) +
        status
          .slice(1)
          .toLowerCase(),
      value:
        statusCounts[status] ?? 0,
    }),
  );

  const useCaseData =
    Object.entries(
      useCaseCounts,
    ).map(([key, value]) => ({
      label:
        trialRequestUseCaseLabels[
          key as TrialRequestUseCase
        ] ?? key,
      value,
    }));

  const userOrder = [
    "1–10",
    "11–15",
    "16–25",
    "26–50",
    "51–100",
    "More than 100",
  ];

  const userData = userOrder.map(
    (label) => ({
      label,
      value:
        userCounts[label] ?? 0,
    }),
  );

  const trend = trendBuckets(
    rows,
    bounds.start,
    bounds.end,
  );

  const maxTrend = Math.max(
    1,
    ...trend.map(
      (item) => item.value,
    ),
  );

  const change = percentChange(
    rows.length,
    previousRequestCount ?? 0,
  );

  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title="Trial Requests"
        description="Review organizations requesting access to a DM3Oi trial workspace."
      />

      {error ? (
        <div
          className="form-alert"
          role="alert"
        >
          Trial Request data could not
          be loaded.
        </div>
      ) : null}

      <section className="trial-request-dashboard">
        <article className="panel trial-request-analytics-card">
          <div className="trial-request-analytics-heading">
            <h2>Total Requests</h2>
            <p>
              All trial requests received in the selected period
            </p>
          </div>

          <div className="trial-request-kpi">
            <strong>{rows.length}</strong>
            <span>
              {change === null
                ? "New activity vs. previous period"
                : `${change >= 0 ? "+" : ""}${change}% vs. previous period`}
            </span>
          </div>
        </article>

        <article className="panel trial-request-analytics-card">
          <div className="trial-request-analytics-heading">
            <h2>Request Status</h2>
            <p>Current status breakdown</p>
          </div>

          <div className="trial-request-kpi-breakdown">
            {statusData
              .filter((item) => item.value > 0)
              .map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}

            {rows.length === 0 ? (
              <p className="muted">No activity yet.</p>
            ) : null}
          </div>
        </article>

        <article className="panel trial-request-analytics-card">
          <div className="trial-request-analytics-heading">
            <h2>Primary Operational Need</h2>
            <p>What organizations plan to use DM3Oi for</p>
          </div>

          <div className="trial-request-kpi-breakdown">
            {useCaseData
              .filter((item) => item.value > 0)
              .map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}

            {rows.length === 0 ? (
              <p className="muted">No activity yet.</p>
            ) : null}
          </div>
        </article>

        <article className="panel trial-request-analytics-card">
          <div className="trial-request-analytics-heading">
            <h2>Estimated Users</h2>
            <p>Anticipated team size</p>
          </div>

          <div className="trial-request-kpi-breakdown">
            {userData
              .filter((item) => item.value > 0)
              .map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}

            {rows.length === 0 ? (
              <p className="muted">No activity yet.</p>
            ) : null}
          </div>
        </article>

        <article className="panel trial-request-analytics-card trial-request-trend-card">
          <div className="trial-request-analytics-heading">
            <h2>Submission Trend</h2>
            <p>Requests received over time</p>
          </div>

          {rows.length === 0 ? (
            <p className="muted">No activity yet.</p>
          ) : (
            <div
              className="trial-request-trend"
              aria-label="Trial request submission trend"
            >
              {trend.map((item) => (
                <div
                  className="trial-request-trend-column"
                  key={item.label}
                >
                  <span className="trial-request-trend-value">
                    {item.value}
                  </span>

                  <div className="trial-request-trend-track">
                    <span
                      style={{
                        height:
                          item.value === 0
                            ? 0
                            : `${Math.max(
                                8,
                                Math.round(
                                  (item.value / maxTrend) * 100,
                                ),
                              )}%`,
                      }}
                    />
                  </div>

                  <small>{item.label}</small>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <TrialRequestFilters
        status={selectedStatus}
        range={selectedRange}
        query={query}
        from={from}
        through={through}
      />

      <section className="panel trial-request-admin-list">
        {filteredRows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>
                    Primary Need
                  </th>
                  <th>Users</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map(
                  (request) => (
                    <NavigableRow
                      key={request.id}
                      href={`/admin/trial-requests/${request.id}`}
                      label={`Open trial request #${request.request_number} for ${request.business_name}`}
                    >
                      <td>
                        <Link
                          href={`/admin/trial-requests/${request.id}`}
                          className="trial-request-number-link"
                        >
                          #{request.request_number}
                        </Link>
                      </td>

                      <td>
                        <strong>
                          {
                            request.business_name
                          }
                        </strong>
                      </td>

                      <td>
                        <span>
                          {
                            request.contact_name
                          }
                        </span>
                        <small className="table-secondary">
                          {
                            request.business_email
                          }
                        </small>
                      </td>

                      <td>
                        {
                          trialRequestUseCaseLabels[
                            request.primary_use_case
                          ]
                        }
                      </td>

                      <td>
                        {
                          request.estimated_users
                        }
                      </td>

                      <td>
                        {new Intl.DateTimeFormat(
                          "en-US",
                          {
                            timeZone:
                              "America/New_York",
                            month: "numeric",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: true,
                          },
                        ).format(
                          new Date(
                            request.created_at,
                          ),
                        )}
                      </td>

                      <td>
                        <Badge
                          value={
                            request.status
                          }
                        />
                      </td>
                    </NavigableRow>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="no-results">
            No trial requests match
            the selected filters.
          </div>
        )}
      </section>
    </>
  );
}
