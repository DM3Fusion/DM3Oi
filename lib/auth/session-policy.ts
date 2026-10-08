export const INTERNAL_INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000;
export const CUSTOMER_PORTAL_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
export const ABSOLUTE_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

export const SESSION_ACTIVITY_MARKER_COOKIE = "dm3oi-session-activity";
export const SESSION_ACTIVITY_MARKER_MAX_AGE_SECONDS = 60;

type SessionActivityRequest = {
  method: string;
  url: string;
  headers: Pick<Headers, "get">;
  cookies: {
    get(name: string): { value: string } | undefined;
  };
};

function isPrefetchRequest(headers: Pick<Headers, "get">) {
  const purpose = headers.get("purpose")?.toLowerCase();
  const secPurpose = headers.get("sec-purpose")?.toLowerCase();
  return (
    headers.get("next-router-prefetch") !== null ||
    headers.get("next-router-segment-prefetch") !== null ||
    headers.get("x-middleware-prefetch") === "1" ||
    purpose === "prefetch" ||
    secPurpose?.includes("prefetch") === true
  );
}

export function isMeaningfulSessionActivity(request: SessionActivityRequest) {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/api/analytics/")) return false;
  if (request.method === "HEAD" || request.method === "OPTIONS") return false;
  if (isPrefetchRequest(request.headers)) return false;

  if (request.cookies.get(SESSION_ACTIVITY_MARKER_COOKIE)?.value !== "1") {
    return false;
  }

  const fetchMode = request.headers.get("sec-fetch-mode")?.toLowerCase();
  const fetchDestination = request.headers.get("sec-fetch-dest")?.toLowerCase();
  const isDocumentNavigation =
    request.method === "GET" &&
    fetchMode === "navigate" &&
    fetchDestination === "document";

  const isServerAction =
    request.method === "POST" && Boolean(request.headers.get("next-action"));
  const isAppRouterNavigation =
    request.method === "GET" &&
    request.headers.get("rsc") === "1" &&
    Boolean(request.headers.get("next-router-state-tree"));

  return isDocumentNavigation || isServerAction || isAppRouterNavigation;
}
