const SESSION_KEY = "dm3oi.analytics.session";

export function analyticsSessionId() {
  let sessionId = sessionStorage.getItem(
    SESSION_KEY,
  );

  if (
    !sessionId ||
    !/^[0-9a-f-]{36}$/i.test(sessionId)
  ) {
    sessionId = crypto.randomUUID();

    sessionStorage.setItem(
      SESSION_KEY,
      sessionId,
    );
  }

  return sessionId;
}
