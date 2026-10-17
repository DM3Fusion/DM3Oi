import Link from "next/link";
import { PageHeader } from "@/components/ui";
import {
  AUTHENTICATION_SECURITY_EVENT_TYPES,
  getPlatformAuthenticationSecurityEvents,
  getPlatformAuthenticationSessionHistory,
} from "@/lib/data/platform-authentication-security-repository";

type SearchParams = {
  view?: string;
  sessionId?: string;
  eventType?: string;
  userId?: string;
  start?: string;
  end?: string;
  before?: string;
  beforeId?: string;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));

const formatEventType = (value: string) =>
  value.replaceAll("_", " ").toLowerCase().replace(
    /\b\w/g,
    (character) => character.toUpperCase(),
  );

function locationLabel(event: {
  city: string | null;
  region_code: string | null;
  country_code: string | null;
  postal_code: string | null;
}) {
  const location = [
    event.city,
    event.region_code,
    event.country_code,
  ].filter(Boolean).join(", ");

  return [location, event.postal_code].filter(Boolean).join(" ") || "Unavailable";
}

function buildQuery(
  query: SearchParams,
  cursor?: { occurredAt: string; eventId: string },
) {
  const params = new URLSearchParams();

  if (query.view === "geography") {
    params.set("view", "geography");
  }

  if (query.eventType) params.set("eventType", query.eventType);
  if (query.userId) params.set("userId", query.userId);
  if (query.start) params.set("start", query.start);
  if (query.end) params.set("end", query.end);

  if (cursor) {
    params.set("before", cursor.occurredAt);
    params.set("beforeId", cursor.eventId);
  }

  return `/admin/authentication-security?${params.toString()}`;
}

function buildSessionQuery(
  sessionId: string,
  cursor: { occurredAt: string; eventId: string },
) {
  const params = new URLSearchParams({
    view: "sessions",
    sessionId,
    before: cursor.occurredAt,
    beforeId: cursor.eventId,
  });

  return `/admin/authentication-security?${params.toString()}`;
}

type SecurityGeographyEvent = {
  country_code: string | null;
  region_code: string | null;
  city: string | null;
};

function summarizeGeography(events: SecurityGeographyEvent[]) {
  const counts = new Map<string, number>();

  for (const event of events) {
    const location =
      [event.city, event.region_code, event.country_code]
        .filter(Boolean)
        .join(", ") || "Location unavailable";

    counts.set(location, (counts.get(location) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([location, count]) => ({ location, count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.location.localeCompare(b.location),
    );
}

function dateBoundary(value: string | undefined, nextDay = false) {
  if (!value) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid authentication security date.");
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Invalid authentication security date.");
  }

  if (nextDay) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date.toISOString();
}

export default async function AuthenticationSecurityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;

  const view =
    query.view === "sessions" || query.view === "geography"
      ? query.view
      : "events";

  const sessionId = query.sessionId?.trim() ?? "";

  const result =
    view === "sessions"
      ? sessionId
        ? await getPlatformAuthenticationSessionHistory({
            sessionId,
            beforeOccurredAt: query.before,
            beforeEventId: query.beforeId,
          })
        : null
      : await getPlatformAuthenticationSecurityEvents({
          eventType: query.eventType,
          userId: query.userId,
          start: dateBoundary(query.start),
          endExclusive: dateBoundary(query.end, true),
          beforeOccurredAt: query.before,
          beforeEventId: query.beforeId,
        });

  const geography =
    view === "geography" && result
      ? summarizeGeography(result.events)
      : [];

  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title="Authentication Security"
        description="Verified authentication events and approximate network security metadata."
      />

      <nav
        className="settings-tabs"
        aria-label="Authentication security views"
      >
        <Link
          href="/admin/authentication-security"
          aria-current={view === "events" ? "page" : undefined}
        >
          Events
        </Link>

        <Link
          href="/admin/authentication-security?view=sessions"
          aria-current={view === "sessions" ? "page" : undefined}
        >
          Sessions
        </Link>

        <Link
          href="/admin/authentication-security?view=geography"
          aria-current={view === "geography" ? "page" : undefined}
        >
          Geography
        </Link>
      </nav>

      {view === "sessions" ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Authentication Session History</h2>
              <p>
                Enter a known authentication session UUID to
                retrieve its recorded security events.
              </p>
            </div>
          </div>

          <form method="get" className="filter-bar">
            <input type="hidden" name="view" value="sessions" />

            <label>
              <span>Authentication Session UUID</span>
              <input
                type="text"
                name="sessionId"
                placeholder="Session UUID"
                defaultValue={sessionId}
                required
              />
            </label>

            <button type="submit" className="primary-button">
              Find Session
            </button>
          </form>

          {result ? (
            result.events.length ? (
              <>
                <p>
                  Showing {result.events.length} recorded events
                  for the selected session.
                </p>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Timestamp (ET)</th>
                        <th>Event</th>
                        <th>Outcome</th>
                        <th>User</th>
                        <th>Network Location</th>
                        <th>Device</th>
                      </tr>
                    </thead>

                    <tbody>
                      {result.events.map((event) => (
                        <tr key={event.event_id}>
                          <td>
                            <time dateTime={event.event_timestamp}>
                              {formatDate(event.event_timestamp)}
                            </time>
                          </td>
                          <td>
                            {formatEventType(event.event_type)}
                          </td>
                          <td>{event.authentication_outcome}</td>
                          <td>{event.user_id}</td>
                          <td>{locationLabel(event)}</td>
                          <td>
                            {event.device_category ?? "Unavailable"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {result.hasMore && result.nextCursor ? (
                  <div className="panel-actions">
                    <Link
                      href={buildSessionQuery(
                        sessionId,
                        result.nextCursor,
                      )}
                      className="secondary-button"
                    >
                      Next 50 Session Events
                    </Link>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty compact-empty">
                <h2>No session events found</h2>
                <p>
                  No recorded security events match this session UUID.
                </p>
              </div>
            )
          ) : (
            <div className="empty compact-empty">
              <h2>No session selected</h2>
              <p>Enter a session UUID to begin.</p>
            </div>
          )}
        </section>
      ) : (
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{view === "geography"
              ? "Authentication Network Geography"
              : "Authentication Events"}</h2>
            <p>
              Showing {result?.events.length ?? 0} recorded events.
              Network locations are approximate and are not GPS locations.
            </p>
          </div>
        </div>

        <form method="get" className="filter-bar">
          {view === "geography" ? (
            <input type="hidden" name="view" value="geography" />
          ) : null}

          <label>
            <span>Event Type</span>
            <select
              name="eventType"
              defaultValue={query.eventType ?? ""}
            >
              <option value="">All Events</option>
              {AUTHENTICATION_SECURITY_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatEventType(type)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>User ID</span>
            <input
              name="userId"
              type="text"
              placeholder="User UUID"
              defaultValue={query.userId ?? ""}
            />
          </label>

          <label>
            <span>From (UTC)</span>
            <input
              name="start"
              type="date"
              defaultValue={query.start ?? ""}
            />
          </label>

          <label>
            <span>Through (UTC)</span>
            <input
              name="end"
              type="date"
              defaultValue={query.end ?? ""}
            />
          </label>

          <button type="submit" className="primary-button">
            Apply Filters
          </button>

          <Link
            href="/admin/authentication-security"
            className="secondary-button"
          >
            Clear
          </Link>
        </form>

        {view === "geography" ? (
          <>
            <p>
              This summary covers only the {result?.events.length ?? 0}
              events retrieved on this page. It is not an all-time
              geographic report. Locations are approximate network
              estimates, not GPS positions.
            </p>

            {geography.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Approximate Network Location</th>
                      <th>Events on This Page</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geography.map((item) => (
                      <tr key={item.location}>
                        <td>{item.location}</td>
                        <td>{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No geographic events match these filters.</p>
            )}

            {result?.hasMore && result.nextCursor ? (
              <div className="panel-actions">
                <Link
                  href={buildQuery(query, result.nextCursor)}
                  className="secondary-button"
                >
                  Next 50 Events
                </Link>
              </div>
            ) : null}
          </>
        ) : result?.events.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp (ET)</th>
                    <th>Event</th>
                    <th>Outcome</th>
                    <th>User</th>
                    <th>Network Location</th>
                    <th>Device</th>
                    <th>Browser / OS</th>
                  </tr>
                </thead>

                <tbody>
                  {result.events.map((event) => (
                    <tr key={event.event_id}>
                      <td>
                        <time dateTime={event.event_timestamp}>
                          {formatDate(event.event_timestamp)}
                        </time>
                      </td>

                      <td>
                        <b>{formatEventType(event.event_type)}</b>
                        <small className="table-secondary">
                          {event.authentication_method}
                        </small>
                      </td>

                      <td>{event.authentication_outcome}</td>

                      <td>
                        <span className="table-secondary">
                          {event.user_id}
                        </span>
                      </td>

                      <td>{locationLabel(event)}</td>

                      <td>{event.device_category ?? "Unavailable"}</td>

                      <td>
                        {[event.browser, event.operating_system]
                          .filter(Boolean)
                          .join(" / ") || "Unavailable"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.hasMore && result.nextCursor ? (
              <div className="panel-actions">
                <Link
                  href={buildQuery(query, result.nextCursor)}
                  className="secondary-button"
                >
                  Next 50 Events
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <div className="empty compact-empty">
            <h2>No authentication events found</h2>
            <p>
              No recorded authentication events match the selected filters.
            </p>
          </div>
        )}
      </section>
      )}
    </>
  );
}
