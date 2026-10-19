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
  signIns: number;
  lastSignIn: string | null;
  pageViews: number;
  sessions: number;
  uniquePages: number;
  lastActivity: string | null;
  topRoute: string | null;
  geography: string | null;
  locations: {
    location: string;
    visits: number;
    pageViews: number;
    lastActivity: string | null;
  }[];
  activity: {
    path: string;
    visits: number;
    pageViews: number;
    lastActivity: string | null;
  }[];
};

type PlatformAuthenticationAuditRow = {
  identityKey: string;
  user: string;
  email: string | null;
  accountIdentifier: string;
  accessType:
    | "INTERNAL"
    | "CUSTOMER_PORTAL"
    | "AUTHENTICATED_UNCLASSIFIED";
  role: string | null;
  organization: string;
  signIns: number;
  lastSignIn: string;
};

type PlatformAuthenticationAudit = {
  summary: {
    internalSignIns: number;
    customerPortalSignIns: number;
    unclassifiedSignIns: number;
  };
  rows: PlatformAuthenticationAuditRow[];
};

export type PlatformAuthenticatedAccess = {
  summary: {
    internalSignIns: number;
    internalVisits: number;
    internalUniquePages: number;
    internalPageViews: number;

    customerPortalSignIns: number;
    customerPortalVisits: number;
    customerPortalUniquePages: number;
    customerPortalPageViews: number;

    unclassifiedSignIns: number;
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
  analyticsDetailsAvailable: boolean;
  deviceTypeBreakdown: PlatformAnalyticsDatum[];
  timezoneBreakdownAvailable: boolean;
  timezoneBreakdown: PlatformAnalyticsDatum[];
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
    lastAccessedAt: string | null;
  }[];
  authenticatedAccess: PlatformAuthenticatedAccess;
};

type PlatformAnalyticsDetails = {
  deviceTypeBreakdown: PlatformAnalyticsDatum[];
  timezoneBreakdownAvailable: boolean;
  timezoneBreakdown: PlatformAnalyticsDatum[];
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
    lastAccessedAt: string | null;
  }[];
};

function asAuthenticationAudit(
  value: unknown,
): PlatformAuthenticationAudit {
  const aggregate = value as
    | Partial<PlatformAuthenticationAudit>
    | null;
  const summary = aggregate?.summary;

  return {
    summary: {
      internalSignIns: Number(
        summary?.internalSignIns ?? 0,
      ),
      customerPortalSignIns: Number(
        summary?.customerPortalSignIns ?? 0,
      ),
      unclassifiedSignIns: Number(
        summary?.unclassifiedSignIns ?? 0,
      ),
    },
    rows: Array.isArray(aggregate?.rows)
      ? aggregate.rows
      : [],
  };
}

function asAuthenticatedAccess(
  value: unknown,
): PlatformAuthenticatedAccess {
  const aggregate = value as
    | Partial<PlatformAuthenticatedAccess>
    | null;
  const summary = aggregate?.summary;

  return {
    summary: {
      internalSignIns: Number(
        summary?.internalSignIns ?? 0,
      ),
      internalVisits: Number(
        summary?.internalVisits ?? 0,
      ),
      internalUniquePages: Number(
        summary?.internalUniquePages ?? 0,
      ),
      internalPageViews: Number(
        summary?.internalPageViews ?? 0,
      ),

      customerPortalSignIns: Number(
        summary?.customerPortalSignIns ?? 0,
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

      unclassifiedSignIns: Number(
        summary?.unclassifiedSignIns ?? 0,
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
      ? aggregate.rows.map((row) => ({
          ...row,
          signIns: Number(row.signIns ?? 0),
          lastSignIn: row.lastSignIn ?? null,
          pageViews: Number(row.pageViews ?? 0),
          sessions: Number(row.sessions ?? 0),
          uniquePages: Number(row.uniquePages ?? 0),
          lastActivity: row.lastActivity ?? null,
          topRoute: row.topRoute ?? null,
          geography: row.geography ?? null,
          locations: Array.isArray(row.locations)
            ? row.locations
            : [],
          activity: Array.isArray(row.activity)
            ? row.activity
            : [],
        }))
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

function asAnalyticsDetails(value: unknown): PlatformAnalyticsDetails {
  const row = value as Partial<PlatformAnalyticsDetails> | null;

  const normalizeBreakdown = (breakdown: unknown) =>
    Array.isArray(breakdown)
      ? breakdown.flatMap((datum: unknown) => {
          if (!datum || typeof datum !== "object") return [];

          const item = datum as Record<string, unknown>;
          const value = Number(item.value);

          if (
            typeof item.label !== "string" ||
            !Number.isFinite(value) ||
            value < 0
          ) {
            return [];
          }

          return [{ label: item.label, value: Math.trunc(value) }];
        })
      : [];

  return {
    deviceTypeBreakdown: normalizeBreakdown(row?.deviceTypeBreakdown),
    timezoneBreakdownAvailable: Array.isArray(row?.timezoneBreakdown),
    timezoneBreakdown: normalizeBreakdown(row?.timezoneBreakdown),
  };
}

function isMissingAnalyticsRpc(error: { code?: string } | null) {
  return error?.code === "PGRST202" || error?.code === "42883";
}

export type PlatformGeographicDevicePoint = {
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  pageViews: number;
  desktop: number;
  mobile: number;
  tablet: number;
  other: number;
  unknown: number;
  lastAccessedAt: string | null;
};

export type PlatformGeographicDeviceActivity =
  | {
      available: true;
      totalPageViews: number;
      geolocatedPageViews: number;
      unknownCoordinatePageViews: number;
      points: PlatformGeographicDevicePoint[];
    }
  | {
      available: false;
      totalPageViews: 0;
      geolocatedPageViews: 0;
      unknownCoordinatePageViews: 0;
      points: [];
    };

export async function getPlatformGeographicDeviceActivity(
  query: PlatformAnalyticsQuery = {},
): Promise<PlatformGeographicDeviceActivity> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const range = resolveRange(query);

  const parameters = {
    target_start: range.start?.toISOString() ?? null,
    target_end_exclusive: range.endExclusive.toISOString(),
  };

  // The migration is deployed separately. Keep the existing
  // Platform Console functional while this RPC is unavailable.
  const result = await supabase.rpc(
    "get_platform_geographic_device_activity" as
      Parameters<typeof supabase.rpc>[0],
    parameters,
  );

  if (result.error) {
    if (
      result.error.code === "PGRST202" ||
      result.error.code === "42883"
    ) {
      return {
        available: false,
        totalPageViews: 0,
        geolocatedPageViews: 0,
        unknownCoordinatePageViews: 0,
        points: [],
      };
    }

    console.error("Geographic analytics query failed", {
      code: result.error.code,
      message: result.error.message,
    });

    throw new Error(
      "Geographic analytics data is temporarily unavailable.",
    );
  }

  const data = result.data as {
    totalPageViews?: unknown;
    geolocatedPageViews?: unknown;
    unknownCoordinatePageViews?: unknown;
    points?: unknown;
  } | null;

  const asCount = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0
      ? Math.trunc(number)
      : 0;
  };

  const points = Array.isArray(data?.points)
    ? data.points.flatMap((value: unknown) => {
        if (!value || typeof value !== "object") return [];

        const point = value as Record<string, unknown>;
        const latitude = Number(point.latitude);
        const longitude = Number(point.longitude);

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          return [];
        }

        return [{
          city: String(point.city ?? "Unknown"),
          region: String(point.region ?? "Unknown"),
          country: String(point.country ?? "Unknown"),
          latitude,
          longitude,
          pageViews: asCount(point.pageViews),
          desktop: asCount(point.desktop),
          mobile: asCount(point.mobile),
          tablet: asCount(point.tablet),
          other: asCount(point.other),
          unknown: asCount(point.unknown),
          lastAccessedAt:
            typeof point.lastAccessedAt === "string"
              ? point.lastAccessedAt
              : null,
        }];
      })
    : [];

  return {
    available: true,
    totalPageViews: asCount(data?.totalPageViews),
    geolocatedPageViews: asCount(data?.geolocatedPageViews),
    unknownCoordinatePageViews: asCount(
      data?.unknownCoordinatePageViews,
    ),
    points,
  };
}

export type PlatformGeographicHistoryRow = {
  timestamp: string;
  path: string;
  deviceType: string;
  city: string | null;
  region: string | null;
  country: string | null;
};

export type PlatformGeographicLocationHistory = {
  total: number;
  limit: number;
  offset: number;
  rows: PlatformGeographicHistoryRow[];
};

function parsePlatformGeographicLocationHistory(
  data: unknown,
  limit: number,
  offset: number,
): PlatformGeographicLocationHistory {
  const payload = data && typeof data === "object"
    ? data as Record<string, unknown>
    : null;
  const rows = Array.isArray(payload?.rows)
    ? payload.rows.flatMap((value: unknown) => {
        if (!value || typeof value !== "object") return [];

        const row = value as Record<string, unknown>;

        if (
          typeof row.timestamp !== "string" ||
          Number.isNaN(Date.parse(row.timestamp))
        ) {
          return [];
        }

        return [{
          timestamp: row.timestamp,
          path:
            typeof row.path === "string"
              ? row.path
              : "/",
          deviceType:
            typeof row.deviceType === "string"
              ? row.deviceType
              : "OTHER",
          city:
            typeof row.city === "string" ? row.city : null,
          region:
            typeof row.region === "string" ? row.region : null,
          country:
            typeof row.country === "string" ? row.country : null,
        }];
      })
    : [];
  const total = Number(payload?.total ?? 0);

  return {
    total: Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0,
    limit,
    offset,
    rows,
  };
}

function normalizedGeographicHistoryLabel(
  value: string,
  maximumLength: number,
) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (
    !normalized ||
    normalized.length > maximumLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error("Invalid geographic location label.");
  }

  return normalized;
}

function validateGeographicHistoryPagination(limit: number, offset: number) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000
  ) {
    throw new Error("Invalid Location History pagination.");
  }
}

export type PlatformPageViewHistoryRow = {
  timestamp: string;
  path: string;
  deviceType: string;
  browser: string;
  operatingSystem: string;
  city: string | null;
  region: string | null;
  country: string | null;
};

export type PlatformPageViewHistory =
  | {
      available: true;
      total: number;
      limit: number;
      offset: number;
      rows: PlatformPageViewHistoryRow[];
    }
  | {
      available: false;
      total: 0;
      limit: number;
      offset: number;
      rows: [];
    };

export async function getPlatformPageViewHistory(
  query: PlatformAnalyticsQuery,
  search = "",
  limit = 25,
  offset = 0,
): Promise<PlatformPageViewHistory> {
  await requireSuperAdmin();

  const normalizedSearch = search.trim();

  if (
    normalizedSearch.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(normalizedSearch)
  ) {
    throw new Error("Invalid analytics history search.");
  }

  if (
    ![10, 25, 50, 100].includes(limit) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000
  ) {
    throw new Error("Invalid analytics history pagination.");
  }

  const supabase = await createClient();
  const range = resolveRange(query);
  const result = await supabase.rpc(
    "get_platform_page_view_history" as Parameters<
      typeof supabase.rpc
    >[0],
    {
      target_start: range.start?.toISOString() ?? null,
      target_end_exclusive: range.endExclusive.toISOString(),
      target_search: normalizedSearch || null,
      target_limit: limit,
      target_offset: offset,
    },
  );

  if (result.error) {
    if (isMissingAnalyticsRpc(result.error)) {
      return {
        available: false,
        total: 0,
        limit,
        offset,
        rows: [],
      };
    }

    console.error("Platform page-view history query failed", {
      code: result.error.code,
      message: result.error.message,
    });

    throw new Error(
      "Platform page-view history is temporarily unavailable.",
    );
  }

  const data = result.data as {
    total?: unknown;
    rows?: unknown;
  } | null;
  const rows = Array.isArray(data?.rows)
    ? data.rows.flatMap((value: unknown) => {
        if (!value || typeof value !== "object") return [];

        const row = value as Record<string, unknown>;

        if (
          typeof row.timestamp !== "string" ||
          Number.isNaN(Date.parse(row.timestamp))
        ) {
          return [];
        }

        return [{
          timestamp: row.timestamp,
          path: typeof row.path === "string" ? row.path : "/",
          deviceType:
            typeof row.deviceType === "string"
              ? row.deviceType
              : "OTHER",
          browser:
            typeof row.browser === "string" ? row.browser : "Unknown",
          operatingSystem:
            typeof row.operatingSystem === "string"
              ? row.operatingSystem
              : "Unknown",
          city: typeof row.city === "string" ? row.city : null,
          region: typeof row.region === "string" ? row.region : null,
          country: typeof row.country === "string" ? row.country : null,
        }];
      })
    : [];
  const total = Number(data?.total ?? 0);

  return {
    available: true,
    total:
      Number.isFinite(total) && total >= 0 ? Math.trunc(total) : 0,
    limit,
    offset,
    rows,
  };
}

export async function getPlatformGeographicLocationHistory(
  query: PlatformAnalyticsQuery,
  latitude: number,
  longitude: number,
  limit = 50,
  offset = 0,
): Promise<PlatformGeographicLocationHistory> {
  await requireSuperAdmin();

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    throw new Error("Invalid geographic coordinates.");
  }

  validateGeographicHistoryPagination(limit, offset);

  const supabase = await createClient();
  const range = resolveRange(query);

  const result = await supabase.rpc(
    "get_platform_geographic_location_history" as
      Parameters<typeof supabase.rpc>[0],
    {
      target_start: range.start?.toISOString() ?? null,
      target_end_exclusive: range.endExclusive.toISOString(),
      target_latitude: latitude,
      target_longitude: longitude,
      target_limit: limit,
      target_offset: offset,
    },
  );

  if (result.error) {
    console.error("Geographic Location History query failed", {
      code: result.error.code,
      message: result.error.message,
    });

    throw new Error(
      "Geographic Location History is temporarily unavailable.",
    );
  }

  return parsePlatformGeographicLocationHistory(
    result.data,
    limit,
    offset,
  );
}

export async function getPlatformGeographicLocationGroupHistory(
  query: PlatformAnalyticsQuery,
  city: string,
  region: string,
  country: string,
  limit = 50,
  offset = 0,
): Promise<PlatformGeographicLocationHistory> {
  await requireSuperAdmin();

  const normalizedCity = normalizedGeographicHistoryLabel(city, 120);
  const normalizedRegion = normalizedGeographicHistoryLabel(region, 100);
  const normalizedCountry = normalizedGeographicHistoryLabel(country, 8);
  validateGeographicHistoryPagination(limit, offset);

  const supabase = await createClient();
  const range = resolveRange(query);
  const result = await supabase.rpc(
    "get_platform_geographic_location_group_history" as
      Parameters<typeof supabase.rpc>[0],
    {
      target_start: range.start?.toISOString() ?? null,
      target_end_exclusive: range.endExclusive.toISOString(),
      target_city: normalizedCity,
      target_region: normalizedRegion,
      target_country: normalizedCountry,
      target_limit: limit,
      target_offset: offset,
    },
  );

  if (result.error) {
    console.error("Geographic location-group history query failed", {
      code: result.error.code,
      message: result.error.message,
    });

    throw new Error(
      "Geographic Location History is temporarily unavailable.",
    );
  }

  return parsePlatformGeographicLocationHistory(
    result.data,
    limit,
    offset,
  );
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
  const [
    aggregateResult,
    authenticatedAccessResult,
    authenticationAuditResult,
    analyticsDetailsResult,
  ] = await Promise.all([
    supabase.rpc(
      "get_platform_analytics",
      parameters,
    ),
    supabase.rpc(
      "get_platform_authenticated_access_analytics",
      parameters,
    ),
    supabase.rpc(
      "get_platform_authentication_audit",
      parameters,
    ),
    supabase.rpc(
      "get_platform_analytics_details" as Parameters<
        typeof supabase.rpc
      >[0],
      parameters,
    ),
  ]);

  const analyticsDetailsAvailable = !isMissingAnalyticsRpc(
    analyticsDetailsResult.error,
  );
  const error =
    aggregateResult.error ??
    authenticatedAccessResult.error ??
    authenticationAuditResult.error ??
    (analyticsDetailsAvailable ? analyticsDetailsResult.error : null);

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
  const authenticationAudit = asAuthenticationAudit(
    authenticationAuditResult.data,
  );
  const analyticsDetails = analyticsDetailsAvailable
    ? asAnalyticsDetails(analyticsDetailsResult.data)
    : {
        deviceTypeBreakdown: [],
        timezoneBreakdownAvailable: false,
        timezoneBreakdown: [],
      };

  const authenticatedRowKey = (row: {
    identityKey: string;
    accessType: string;
    role: string | null;
    organization: string;
  }) =>
    [
      row.identityKey,
      row.accessType,
      row.role ?? "",
      row.organization,
    ].join("|");

  const mergedAuthenticatedRows = new Map<
    string,
    PlatformAuthenticatedAccessRow
  >();

  for (const row of authenticatedAccess.rows) {
    mergedAuthenticatedRows.set(
      authenticatedRowKey(row),
      row,
    );
  }

  for (const auditRow of authenticationAudit.rows) {
    const key = authenticatedRowKey(auditRow);
    const activityRow = mergedAuthenticatedRows.get(key);

    mergedAuthenticatedRows.set(key, {
      identityKey: auditRow.identityKey,
      user: auditRow.user,
      email: auditRow.email,
      accountIdentifier: auditRow.accountIdentifier,
      accessType: auditRow.accessType,
      role: auditRow.role,
      organization: auditRow.organization,
      signIns: Number(auditRow.signIns ?? 0),
      lastSignIn: auditRow.lastSignIn,
      pageViews: Number(activityRow?.pageViews ?? 0),
      sessions: Number(activityRow?.sessions ?? 0),
      uniquePages: Number(activityRow?.uniquePages ?? 0),
      lastActivity: activityRow?.lastActivity ?? null,
      topRoute: activityRow?.topRoute ?? null,
      geography: activityRow?.geography ?? null,
      locations: activityRow?.locations ?? [],
      activity: activityRow?.activity ?? [],
    });
  }

  authenticatedAccess.summary.internalSignIns =
    authenticationAudit.summary.internalSignIns;
  authenticatedAccess.summary.customerPortalSignIns =
    authenticationAudit.summary.customerPortalSignIns;
  authenticatedAccess.summary.unclassifiedSignIns =
    authenticationAudit.summary.unclassifiedSignIns;

  authenticatedAccess.rows = Array.from(
    mergedAuthenticatedRows.values(),
  ).sort((left, right) => {
    const leftTime = new Date(
      left.lastSignIn ?? left.lastActivity ?? 0,
    ).getTime();
    const rightTime = new Date(
      right.lastSignIn ?? right.lastActivity ?? 0,
    ).getTime();

    return rightTime - leftTime;
  });

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
    analyticsDetailsAvailable,
    deviceTypeBreakdown: analyticsDetails.deviceTypeBreakdown,
    timezoneBreakdownAvailable:
      analyticsDetails.timezoneBreakdownAvailable,
    timezoneBreakdown: analyticsDetails.timezoneBreakdown,
    deviceBreakdown: aggregate.deviceBreakdown,
    browserBreakdown: aggregate.browserBreakdown,
    operatingSystemBreakdown: aggregate.operatingSystemBreakdown,
    trafficTypeBreakdown: aggregate.trafficTypeBreakdown,
    topPages: aggregate.topPages,
    geography: aggregate.geography,
    authenticatedAccess,
  };
}
