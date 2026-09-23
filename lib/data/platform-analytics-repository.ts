import "server-only";

import { requireSuperAdmin } from "@/lib/auth/context";
import { analyticsLiveActivityCutoffIso } from "@/lib/analytics";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.generated";

type PageView =
  Database["public"]["Tables"]["analytics_page_views"]["Row"];

export type PlatformAnalyticsRange =
  | "today"
  | "7d"
  | "30d"
  | "90d"
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
  activeUsers: number;
  activeSessions: number;
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

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseUtcDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    utcDateKey(date) !== value
  ) {
    return null;
  }

  return date;
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ),
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

function titleCase(value: string) {
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

function increment(
  map: Map<string, number>,
  key: string | null | undefined,
) {
  if (!key) return;

  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedBreakdown(
  map: Map<string, number>,
  limit?: number,
): PlatformAnalyticsDatum[] {
  const rows = [...map.entries()]
    .map(([label, value]) => ({
      label,
      value,
    }))
    .sort(
      (a, b) =>
        b.value - a.value ||
        a.label.localeCompare(b.label),
    );

  return typeof limit === "number"
    ? rows.slice(0, limit)
    : rows;
}

function resolveRange(
  query: PlatformAnalyticsQuery,
  now = new Date(),
) {
  const requestedRange: PlatformAnalyticsRange =
    query.analyticsRange === "today" ||
    query.analyticsRange === "30d" ||
    query.analyticsRange === "90d" ||
    query.analyticsRange === "custom"
      ? query.analyticsRange
      : "7d";

  const today = startOfUtcDay(now);
  const tomorrow = addUtcDays(today, 1);

  if (requestedRange !== "custom") {
    const days =
      requestedRange === "today"
        ? 1
        : requestedRange === "30d"
          ? 30
          : requestedRange === "90d"
            ? 90
            : 7;

    const start = addUtcDays(
      tomorrow,
      -days,
    );

    return {
      range: requestedRange,
      start,
      endExclusive: tomorrow,
      from: utcDateKey(start),
      through: utcDateKey(today),
      customRangeError: null,
    };
  }

  const fallbackStart = addUtcDays(
    tomorrow,
    -7,
  );

  const from =
    parseUtcDate(query.analyticsFrom) ??
    fallbackStart;

  const through =
    parseUtcDate(query.analyticsThrough) ??
    today;

  const dayCount =
    Math.floor(
      (through.getTime() - from.getTime()) /
        DAY_MS,
    ) + 1;

  let customRangeError: string | null = null;

  if (through.getTime() < from.getTime()) {
    customRangeError =
      "Through date must be on or after From date.";
  } else if (dayCount > 366) {
    customRangeError =
      "Custom reporting periods cannot exceed 366 days.";
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

function deviceLabel(row: PageView) {
  if (row.device_model) {
    return row.device_model;
  }

  return titleCase(row.device_type);
}

function trafficLabel(value: string) {
  if (value === "HUMAN") return "Human";
  if (value === "LIKELY_BOT") {
    return "Likely Bot";
  }
  return "Unclassified";
}

function geographyLabel(row: PageView) {
  const parts = [
    row.city,
    row.region_code,
    row.country_code,
  ].filter(
    (value): value is string =>
      Boolean(value?.trim()),
  );

  return parts.join(", ") || "Unknown";
}

export async function getPlatformAnalytics(
  query: PlatformAnalyticsQuery = {},
): Promise<PlatformAnalytics> {
  await requireSuperAdmin();

  const supabase = createAdminClient();
  const range = resolveRange(query);

  const [pageViewsResult, liveResult] =
    await Promise.all([
      supabase
        .from("analytics_page_views")
        .select("*")
        .gte(
          "created_at",
          range.start.toISOString(),
        )
        .lt(
          "created_at",
          range.endExclusive.toISOString(),
        )
        .order("created_at", {
          ascending: true,
        }),
      supabase
        .from("analytics_live_sessions")
        .select(
          "session_id,user_id,organization_id,last_seen_at,signed_out_at",
        )
        .is("signed_out_at", null)
        .gte(
          "last_seen_at",
          analyticsLiveActivityCutoffIso(),
        ),
    ]);

  const error =
    pageViewsResult.error ?? liveResult.error;

  if (error) {
    console.error(
      "Platform analytics query failed",
      {
        code: error.code,
        message: error.message,
      },
    );

    throw new Error(
      "Platform analytics data is temporarily unavailable.",
    );
  }

  const pageViews =
    pageViewsResult.data ?? [];
  const liveSessions =
    liveResult.data ?? [];

  const sessionIds = new Set<string>();
  const userIds = new Set<string>();
  const organizationIds = new Set<string>();
  const activeUserIds = new Set<string>();

  const pageMap = new Map<string, number>();
  const deviceMap = new Map<string, number>();
  const browserMap = new Map<string, number>();
  const operatingSystemMap =
    new Map<string, number>();
  const trafficTypeMap =
    new Map<string, number>();
  const geographyMap =
    new Map<string, number>();
  const dailyTrafficMap =
    new Map<string, number>();

  for (const row of pageViews) {
    sessionIds.add(row.session_id);

    if (row.user_id) {
      userIds.add(row.user_id);
    }

    if (row.organization_id) {
      organizationIds.add(
        row.organization_id,
      );
    }

    increment(
      pageMap,
      row.normalized_path,
    );
    increment(
      deviceMap,
      deviceLabel(row),
    );
    increment(browserMap, row.browser);
    increment(
      operatingSystemMap,
      row.operating_system,
    );
    increment(
      trafficTypeMap,
      trafficLabel(row.traffic_type),
    );
    increment(
      geographyMap,
      geographyLabel(row),
    );
    increment(
      dailyTrafficMap,
      row.created_at.slice(0, 10),
    );
  }

  for (const row of liveSessions) {
    activeUserIds.add(row.user_id);
  }

  const trafficDays = [];
  for (
    let day = range.start;
    day < range.endExclusive;
    day = addUtcDays(day, 1)
  ) {
    const key = utcDateKey(day);

    trafficDays.push({
      key,
      label: rangeLabel(day),
      value: dailyTrafficMap.get(key) ?? 0,
    });
  }

  const topPages = [...pageMap.entries()]
    .map(([path, pageViews]) => ({
      path,
      pageViews,
    }))
    .sort(
      (a, b) =>
        b.pageViews - a.pageViews ||
        a.path.localeCompare(b.path),
    );

  const geography = [
    ...geographyMap.entries(),
  ]
    .map(([label, pageViews]) => ({
      label,
      pageViews,
    }))
    .sort(
      (a, b) =>
        b.pageViews - a.pageViews ||
        a.label.localeCompare(b.label),
    );

  return {
    range: range.range,
    from: range.from,
    through: range.through,
    customRangeError:
      range.customRangeError,
    pageViews: pageViews.length,
    sessions: sessionIds.size,
    users: userIds.size,
    organizations: organizationIds.size,
    activeUsers: activeUserIds.size,
    activeSessions: liveSessions.length,
    trafficDays,
    maxTrafficCount: Math.max(
      1,
      ...trafficDays.map(
        (day) => day.value,
      ),
    ),
    deviceBreakdown: sortedBreakdown(
      deviceMap,
      5,
    ),
    browserBreakdown: sortedBreakdown(
      browserMap,
      5,
    ),
    operatingSystemBreakdown:
      sortedBreakdown(
        operatingSystemMap,
        5,
      ),
    trafficTypeBreakdown:
      sortedBreakdown(trafficTypeMap),
    topPages,
    geography,
  };
}
