import "server-only";

import { cookies } from "next/headers";

const ANALYTICS_SESSION_COOKIE = "dm3oi_analytics_session";
const ANALYTICS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getOrCreateAnalyticsSessionId() {
  const store = await cookies();
  const existing = store.get(ANALYTICS_SESSION_COOKIE)?.value;

  if (existing && uuidPattern.test(existing)) {
    return {
      sessionId: existing,
      isNew: false,
    };
  }

  const sessionId = crypto.randomUUID();

  store.set(ANALYTICS_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ANALYTICS_SESSION_MAX_AGE_SECONDS,
  });

  return {
    sessionId,
    isNew: true,
  };
}

export async function getAnalyticsSessionId() {
  const store = await cookies();
  const value = store.get(ANALYTICS_SESSION_COOKIE)?.value;

  return value && uuidPattern.test(value)
    ? value
    : null;
}
