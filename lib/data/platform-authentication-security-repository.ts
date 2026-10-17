import "server-only";

import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export const SECURITY_EVENTS_PAGE_SIZE = 50;

export const AUTHENTICATION_SECURITY_EVENT_TYPES = [
  "AUTHENTICATION_SUCCESS",
  "AUTHENTICATION_FAILURE",
  "EXPLICIT_SIGN_OUT",
  "INACTIVITY_EXPIRATION",
  "ABSOLUTE_SESSION_EXPIRATION",
  "ADMINISTRATIVE_REVOCATION",
] as const;

export type AuthenticationSecurityEventType =
  (typeof AUTHENTICATION_SECURITY_EVENT_TYPES)[number];

export type AuthenticationSecurityEvent = {
  event_id: string;
  event_type: string;
  event_timestamp: string;
  user_id: string;
  authentication_method: string;
  authentication_outcome: string;
  access_category: string | null;
  organization_id: string | null;
  application_role: string | null;
  country_code: string | null;
  region_code: string | null;
  city: string | null;
  postal_code: string | null;
  network_latitude: number | null;
  network_longitude: number | null;
  network_location_type: string | null;
  device_category: string | null;
  browser: string | null;
  operating_system: string | null;
  event_source: string;
  event_schema_version: number;
};

export type AuthenticationSessionEvent =
  AuthenticationSecurityEvent & {
    authentication_session_id: string;
  };

export type SecurityEventQuery = {
  start?: string | null;
  endExclusive?: string | null;
  userId?: string | null;
  eventType?: string | null;
  beforeOccurredAt?: string | null;
  beforeEventId?: string | null;
};

export type SecuritySessionQuery = {
  sessionId: string;
  beforeOccurredAt?: string | null;
  beforeEventId?: string | null;
};

type RpcResult<T> = {
  data: T[] | null;
  error: { code?: string; message: string } | null;
};

type SecurityEventsRpc = (
  name: "get_platform_authentication_security_events",
  args: {
    target_start: string | null;
    target_end_exclusive: string | null;
    target_user_id: string | null;
    target_event_type: string | null;
    target_limit: number;
    target_before_occurred_at: string | null;
    target_before_event_id: string | null;
  },
) => Promise<RpcResult<AuthenticationSecurityEvent>>;

type SessionHistoryRpc = (
  name: "get_platform_authentication_session_history",
  args: {
    target_authentication_session_id: string;
    target_limit: number;
    target_before_occurred_at: string | null;
    target_before_event_id: string | null;
  },
) => Promise<RpcResult<AuthenticationSessionEvent>>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeUuid(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!UUID_PATTERN.test(trimmed)) {
    throw new Error("Invalid security audit UUID.");
  }
  return trimmed;
}

function normalizeTimestamp(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = value.trim();

  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      trimmed,
    )
  ) {
    throw new Error("Invalid security audit timestamp.");
  }

  const timestamp = Date.parse(trimmed);

  if (!Number.isFinite(timestamp)) {
    throw new Error("Invalid security audit timestamp.");
  }

  return trimmed;
}

function normalizeEventType(value: string | null | undefined) {
  if (!value) return null;

  if (
    !AUTHENTICATION_SECURITY_EVENT_TYPES.includes(
      value as AuthenticationSecurityEventType,
    )
  ) {
    throw new Error("Invalid authentication security event type.");
  }

  return value;
}

function normalizeCursor(
  occurredAt: string | null | undefined,
  eventId: string | null | undefined,
) {
  const timestamp = normalizeTimestamp(occurredAt);
  const id = normalizeUuid(eventId);

  if (Boolean(timestamp) !== Boolean(id)) {
    throw new Error("Incomplete authentication security cursor.");
  }

  return { timestamp, id };
}

export async function getPlatformAuthenticationSecurityEvents(
  query: SecurityEventQuery = {},
) {
  await requireSuperAdmin();

  const start = normalizeTimestamp(query.start);
  const endExclusive = normalizeTimestamp(query.endExclusive);
  const userId = normalizeUuid(query.userId);
  const eventType = normalizeEventType(query.eventType);
  const cursor = normalizeCursor(
    query.beforeOccurredAt,
    query.beforeEventId,
  );

  if (
    start &&
    endExclusive &&
    Date.parse(endExclusive) <= Date.parse(start)
  ) {
    throw new Error("Invalid authentication security date range.");
  }

  const supabase = await createClient();

  const rpc = supabase.rpc.bind(supabase) as unknown as SecurityEventsRpc;

  const result = await rpc(
    "get_platform_authentication_security_events",
    {
      target_start: start,
      target_end_exclusive: endExclusive,
      target_user_id: userId,
      target_event_type: eventType,
      target_limit: SECURITY_EVENTS_PAGE_SIZE + 1,
      target_before_occurred_at: cursor.timestamp,
      target_before_event_id: cursor.id,
    },
  );

  if (result.error) {
    console.error("Authentication security event lookup failed", {
      code: result.error.code,
      message: result.error.message,
    });

    throw new Error(
      "Authentication security events are temporarily unavailable.",
    );
  }

  const rows = result.data ?? [];
  const hasMore = rows.length > SECURITY_EVENTS_PAGE_SIZE;
  const events = rows.slice(0, SECURITY_EVENTS_PAGE_SIZE);
  const last = events.at(-1);

  return {
    events,
    hasMore,
    nextCursor:
      hasMore && last
        ? {
            occurredAt: last.event_timestamp,
            eventId: last.event_id,
          }
        : null,
  };
}

export async function getPlatformAuthenticationSessionHistory(
  query: SecuritySessionQuery,
) {
  await requireSuperAdmin();

  const sessionId = normalizeUuid(query.sessionId);

  if (!sessionId) {
    throw new Error("Authentication session ID is required.");
  }

  const cursor = normalizeCursor(
    query.beforeOccurredAt,
    query.beforeEventId,
  );

  const supabase = await createClient();

  const rpc = supabase.rpc.bind(supabase) as unknown as SessionHistoryRpc;

  const result = await rpc(
    "get_platform_authentication_session_history",
    {
      target_authentication_session_id: sessionId,
      target_limit: SECURITY_EVENTS_PAGE_SIZE + 1,
      target_before_occurred_at: cursor.timestamp,
      target_before_event_id: cursor.id,
    },
  );

  if (result.error) {
    console.error("Authentication session history lookup failed", {
      code: result.error.code,
      message: result.error.message,
    });

    throw new Error(
      "Authentication session history is temporarily unavailable.",
    );
  }

  const rows = result.data ?? [];
  const hasMore = rows.length > SECURITY_EVENTS_PAGE_SIZE;
  const events = rows.slice(0, SECURITY_EVENTS_PAGE_SIZE);
  const last = events.at(-1);

  return {
    sessionId,
    events,
    hasMore,
    nextCursor:
      hasMore && last
        ? {
            occurredAt: last.event_timestamp,
            eventId: last.event_id,
          }
        : null,
  };
}
