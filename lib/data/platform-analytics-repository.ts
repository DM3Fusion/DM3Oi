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

export type PlatformAnalytics = {
  range: PlatformAnalyticsRange;
  from: string;
  through: string;
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
    pageViews: number;
  }[];
};

type PlatformAnalyticsAggregate = {
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
  geography: { label: string; pageViews: number }[];
};

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

  return {
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

  const aggregateResult = await supabase.rpc("get_platform_analytics", {
    target_start: range.start?.toISOString() ?? null,
    target_end_exclusive: range.endExclusive.toISOString(),
  });

  const error = aggregateResult.error;

  if (error) {
    console.error("Platform analytics query failed", {
      code: error.code,
      message: error.message,
    });

    throw new Error("Platform analytics data is temporarily unavailable.");
  }

  const aggregate = asAggregate(aggregateResult.data);
  const dailyTraffic = new Map(
    aggregate.trafficDays.map((day) => [day.key, Number(day.value)]),
  );

  const firstAllTimeDay = parseUtcDate(aggregate.trafficDays[0]?.key);
  const chartStart = range.start ?? firstAllTimeDay ?? startOfUtcDay(new Date());
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
      range.range === "all" && firstAllTimeDay
        ? utcDateKey(firstAllTimeDay)
        : range.from,
    through: range.through,
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
  };
}
