import "server-only";

import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export type PlatformAnalyticsRange =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "all"
  | "custom";

export type PlatformAnalyticsQuery = {
  analyticsRange?: string;
  analyticsFrom?: string;
  analyticsThrough?: string;
};

export type PlatformAnalyticsDatum = {
  label: string;
  value: number;
};

export type PlatformAuthenticatedAccessRow = {
  identityKey: string;
  user: string;
  email: string | null;
  accountIdentifier: string;
  accessType:
    | "INTERNAL"
    | "CUSTOMER_PORTAL"
    | "AUTHENTICATED_UNCLASSIFIED"
    | "AUTHENTICATED_HISTORICAL";
  role: string | null;
  organization: string;
  pageViews: number;
  sessions: number;
  lastActivity: string;
  topRoute: string;
  geography: string;
};

export type PlatformAuthenticatedAccess = {
  summary: {
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
  rows: PlatformAuthenticatedAccessRow[];
};

export type PlatformAnalytics = {
  range: PlatformAnalyticsRange;
  from: string;
  through: string;
  trustedDataStartedAt: string;
  customRangeError: string | null;
  pageViews: number;
  sessions: number;
  users: number;
  organizations: number;
  trafficDays: {
    key: string;
    label: string;
    value: number;
  }[];
  maxTrafficCount: number;
  deviceBreakdown: PlatformAnalyticsDatum[];
  browserBreakdown: PlatformAnalyticsDatum[];
  operatingSystemBreakdown: PlatformAnalyticsDatum[];
  trafficTypeBreakdown: PlatformAnalyticsDatum[];
  topPages: {
    path: string;
    pageViews: number;
  }[];
  geography: {
    label: string;
    postalCode: string | null;
    latitude: number | null;
    longitude: number | null;
    visits: number;
    uniquePages: number;
  }[];
  authenticatedAccess: PlatformAuthenticatedAccess;
};

type PlatformAnalyticsAggregate = {
  trustedDataStartedAt: string;
  pageViews: number;
  sessions: number;
  users: number;
  organizations: number;
  trafficDays: { key: string; value: number }[];
  deviceBreakdown: PlatformAnalyticsDatum[];
  browserBreakdown: PlatformAnalyticsDatum[];
  operatingSystemBreakdown: PlatformAnalyticsDatum[];
  trafficTypeBreakdown: PlatformAnalyticsDatum[];
  topPages: { path: string; pageViews: number }[];
  geography: {
    label: string;
    postalCode: string | null;
    latitude: number | null;
    longitude: number | null;
    visits: number;
    uniquePages: number;
  }[];
};

function asAuthenticatedAccess(
  value: unknown,
): PlatformAuthenticatedAccess {
  const aggregate = value as
    | Partial<PlatformAuthenticatedAccess>
    | null;
  const summary = aggregate?.summary;

  return {
    summary: {
      internalVisits: Number(
        summary?.internalVisits ?? 0,
      ),
      internalUniquePages: Number(
        summary?.internalUniquePages ?? 0,
      ),
      internalPageViews: Number(
        summary?.internalPageViews ?? 0,
      ),

      customerPortalVisits: Number(
        summary?.customerPortalVisits ?? 0,
      ),
      customerPortalUniquePages: Number(
        summary?.customerPortalUniquePages ?? 0,
      ),
      customerPortalPageViews: Number(
        summary?.customerPortalPageViews ?? 0,
      ),

      unclassifiedAuthenticatedVisits: Number(
        summary?.unclassifiedAuthenticatedVisits ?? 0,
      ),
      unclassifiedAuthenticatedUniquePages: Number(
        summary?.unclassifiedAuthenticatedUniquePages ?? 0,
      ),
      unclassifiedAuthenticatedPageViews: Number(
        summary?.unclassifiedAuthenticatedPageViews ?? 0,
      ),

      publicVisits: Number(
        summary?.publicVisits ?? 0,
      ),
      publicUniquePages: Number(
        summary?.publicUniquePages ?? 0,
      ),
      publicPageViews: Number(
        summary?.publicPageViews ?? 0,
      ),
    },
    rows: Array.isArray(aggregate?.rows)
      ? aggregate.rows
      : [],
  };
}

export async function getOverviewDownloadCount(): Promise<number> {
  await requireSuperAdmin();

  try {
    const supabase = await createClient();

    const result = await supabase.rpc(
      "get_overview_download_count",
    );

    if (result.error) {
      console.error("Overview download count query failed.", {
        code: result.error.code ?? "OVERVIEW_DOWNLOAD_COUNT_FAILED",
      });
      return 0;
    }

    const count = Number(result.data ?? 0);

    return Number.isFinite(count) && count >= 0
      ? Math.trunc(count)
      : 0;
  } catch {
    console.error("Overview download count query failed.", {
      code: "OVERVIEW_DOWNLOAD_COUNT_FAILED",
    });
    return 0;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseUtcDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || utcDateKey(date) !== value) {
    return null;
  }

  return date;
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function rangeLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function resolveRange(query: PlatformAnalyticsQuery, now = new Date()) {
  const requestedRange: PlatformAnalyticsRange =
    query.analyticsRange === "today" ||
    query.analyticsRange === "30d" ||
    query.analyticsRange === "90d" ||
    query.analyticsRange === "all" ||
    query.analyticsRange === "custom"
      ? query.analyticsRange
      : "7d";

  const today = startOfUtcDay(now);
  const tomorrow = addUtcDays(today, 1);
  const fallbackStart = addUtcDays(tomorrow, -7);

  if (requestedRange === "all") {
    return {
      range: requestedRange,
      start: null,
      endExclusive: now,
      from: utcDateKey(fallbackStart),
      through: utcDateKey(today),
      customRangeError: null,
    };
  }

  if (requestedRange !== "custom") {
    const days =
      requestedRange === "today"
        ? 1
        : requestedRange === "30d"
          ? 30
          : requestedRange === "90d"
            ? 90
            : 7;

    const start = addUtcDays(tomorrow, -days);

    return {
      range: requestedRange,
      start,
      endExclusive: tomorrow,
      from: utcDateKey(start),
      through: utcDateKey(today),
      customRangeError: null,
    };
  }

  const from = parseUtcDate(query.analyticsFrom) ?? fallbackStart;
  const through = parseUtcDate(query.analyticsThrough) ?? today;
  const dayCount =
    Math.floor((through.getTime() - from.getTime()) / DAY_MS) + 1;

  let customRangeError: string | null = null;

  if (through.getTime() < from.getTime()) {
    customRangeError = "Through date must be on or after From date.";
  } else if (dayCount > 366) {
    customRangeError = "Custom reporting periods cannot exceed 366 days.";
  }

  if (customRangeError) {
    return {
      range: requestedRange,
      start: fallbackStart,
      endExclusive: tomorrow,
      from: query.analyticsFrom ?? utcDateKey(fallbackStart),
      through: query.analyticsThrough ?? utcDateKey(today),
      customRangeError,
    };
  }

  return {
    range: requestedRange,
    start: from,
    endExclusive: addUtcDays(through, 1),
    from: utcDateKey(from),
    through: utcDateKey(through),
    customRangeError,
  };
}

function asAggregate(value: unknown): PlatformAnalyticsAggregate {
  const row = value as Partial<PlatformAnalyticsAggregate> | null;
  const trustedDataStartedAt = row?.trustedDataStartedAt;

  if (
    typeof trustedDataStartedAt !== "string" ||
    Number.isNaN(new Date(trustedDataStartedAt).getTime())
  ) {
    throw new Error(
      "Platform analytics trusted baseline is unavailable.",
    );
  }

  return {
    trustedDataStartedAt,
    pageViews: Number(row?.pageViews ?? 0),
    sessions: Number(row?.sessions ?? 0),
    users: Number(row?.users ?? 0),
    organizations: Number(row?.organizations ?? 0),
    trafficDays: Array.isArray(row?.trafficDays) ? row.trafficDays : [],
    deviceBreakdown: Array.isArray(row?.deviceBreakdown)
      ? row.deviceBreakdown
      : [],
    browserBreakdown: Array.isArray(row?.browserBreakdown)
      ? row.browserBreakdown
      : [],
    operatingSystemBreakdown: Array.isArray(row?.operatingSystemBreakdown)
      ? row.operatingSystemBreakdown
      : [],
    trafficTypeBreakdown: Array.isArray(row?.trafficTypeBreakdown)
      ? row.trafficTypeBreakdown
      : [],
    topPages: Array.isArray(row?.topPages) ? row.topPages : [],
    geography: Array.isArray(row?.geography) ? row.geography : [],
  };
}

export async function getPlatformAnalytics(
  query: PlatformAnalyticsQuery = {},
): Promise<PlatformAnalytics> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const range = resolveRange(query);

  const parameters = {
    target_start: range.start?.toISOString() ?? null,
    target_end_exclusive: range.endExclusive.toISOString(),
  };
  const [aggregateResult, authenticatedAccessResult] =
    await Promise.all([
      supabase.rpc(
        "get_platform_analytics",
        parameters,
      ),
      supabase.rpc(
        "get_platform_authenticated_access_analytics",
        parameters,
      ),
    ]);

  const error =
    aggregateResult.error ??
    authenticatedAccessResult.error;

  if (error) {
    console.error("Platform analytics query failed", {
      code: error.code,
      message: error.message,
    });

    throw new Error("Platform analytics data is temporarily unavailable.");
  }

  const aggregate = asAggregate(aggregateResult.data);
  const authenticatedAccess = asAuthenticatedAccess(
    authenticatedAccessResult.data,
  );
  const dailyTraffic = new Map(
    aggregate.trafficDays.map((day) => [day.key, Number(day.value)]),
  );

  const trustedStart = new Date(aggregate.trustedDataStartedAt);
  const requestedStart = range.start ?? trustedStart;
  const effectiveStart =
    requestedStart < trustedStart
      ? trustedStart
      : requestedStart;
  const chartStart = startOfUtcDay(effectiveStart);
  const trafficDays = [];

  for (
    let day = chartStart;
    day < range.endExclusive;
    day = addUtcDays(day, 1)
  ) {
    const key = utcDateKey(day);

    trafficDays.push({
      key,
      label: rangeLabel(day),
      value: dailyTraffic.get(key) ?? 0,
    });
  }

  return {
    range: range.range,
    from:
      range.range === "all"
        ? utcDateKey(startOfUtcDay(trustedStart))
        : range.from,
    through: range.through,
    trustedDataStartedAt: aggregate.trustedDataStartedAt,
    customRangeError: range.customRangeError,
    pageViews: aggregate.pageViews,
    sessions: aggregate.sessions,
    users: aggregate.users,
    organizations: aggregate.organizations,
    trafficDays,
    maxTrafficCount: Math.max(1, ...trafficDays.map((day) => day.value)),
    deviceBreakdown: aggregate.deviceBreakdown,
    browserBreakdown: aggregate.browserBreakdown,
    operatingSystemBreakdown: aggregate.operatingSystemBreakdown,
    trafficTypeBreakdown: aggregate.trafficTypeBreakdown,
    topPages: aggregate.topPages,
    geography: aggregate.geography,
    authenticatedAccess,
  };
}
