"use client";

import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { GeographicLocationHistoryModal } from "@/components/platform/geographic-location-history-modal";
import { loadPlatformPageViewHistory } from "@/components/platform/platform-analytics-details-actions";
import type {
  PlatformAnalytics,
  PlatformAnalyticsDatum,
  PlatformGeographicDevicePoint,
  PlatformPageViewHistory,
  PlatformPageViewHistoryRow,
} from "@/lib/data/platform-analytics-repository";
import {
  aggregateGeographicLocations,
  filterGeographicLocations,
  GEOGRAPHIC_DEVICE_COLORS,
  geographicDevicePercentage,
  geographicLocationGroupKey,
  geographicLocationLabel,
} from "@/lib/platform-geographic-map";

type Props = {
  analytics: PlatformAnalytics;
  points: PlatformGeographicDevicePoint[];
  locationDataAvailable: boolean;
  analyticsRange: string;
  analyticsFrom: string;
  analyticsThrough: string;
};

const DEVICE_TYPES = [
  "Desktop",
  "Mobile",
  "Tablet",
  "Other",
  "Unknown",
] as const;
const HISTORY_PAGE_SIZES = [10, 25, 50, 100] as const;

const LOCATION_DEVICES = [
  { key: "desktop", label: "Desktop", color: GEOGRAPHIC_DEVICE_COLORS.desktop },
  { key: "mobile", label: "Mobile", color: GEOGRAPHIC_DEVICE_COLORS.mobile },
  { key: "tablet", label: "Tablet", color: GEOGRAPHIC_DEVICE_COLORS.tablet },
  { key: "other", label: "Other", color: GEOGRAPHIC_DEVICE_COLORS.other },
  { key: "unknown", label: "Unknown", color: GEOGRAPHIC_DEVICE_COLORS.unknown },
] as const;

function locationDeviceUsage(point: PlatformGeographicDevicePoint) {
  return LOCATION_DEVICES.map((device) => ({
    ...device,
    count: point[device.key],
  }));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function RankedList({ data }: { data: PlatformAnalyticsDatum[] }) {
  if (data.length === 0) {
    return <p className="platform-detail-empty">No activity recorded.</p>;
  }

  return (
    <ol className="platform-detail-ranked-list">
      {data.map((item) => (
        <li key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value.toLocaleString("en-US")}</strong>
        </li>
      ))}
    </ol>
  );
}

function Unavailable({ children }: { children: ReactNode }) {
  return (
    <div className="platform-detail-unavailable">
      <strong>Unavailable</strong>
      <p>{children}</p>
    </div>
  );
}

export function PlatformAnalyticsDetails({
  analytics,
  points,
  locationDataAvailable,
  analyticsRange,
  analyticsFrom,
  analyticsThrough,
}: Props) {
  const [showLocations, setShowLocations] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedLocation, setSelectedLocation] =
    useState<PlatformGeographicDevicePoint | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [appliedHistorySearch, setAppliedHistorySearch] = useState("");
  const [historyLimit, setHistoryLimit] = useState(25);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [history, setHistory] =
    useState<PlatformPageViewHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyRequestId = useRef(0);
  const [selectedPageView, setSelectedPageView] =
    useState<PlatformPageViewHistoryRow | null>(null);
  const selectedPageViewTrigger = useRef<HTMLButtonElement | null>(null);

  function closePageViewDetails() {
    setSelectedPageView(null);
    requestAnimationFrame(() => selectedPageViewTrigger.current?.focus());
  }

  useEffect(() => {
    if (!selectedPageView) return;

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedPageView(null);
        requestAnimationFrame(() => selectedPageViewTrigger.current?.focus());
      }
    }

    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [selectedPageView]);

  const groupedLocations = useMemo(
    () => aggregateGeographicLocations(points),
    [points],
  );
  const filteredLocations = useMemo(() => {
    return filterGeographicLocations(groupedLocations, locationSearch);
  }, [groupedLocations, locationSearch]);
  const maximumLocationPageViews = Math.max(
    ...filteredLocations.map((point) => point.pageViews),
    1,
  );
  const deviceTypeData = DEVICE_TYPES.map((label) => ({
    label,
    value:
      analytics.deviceTypeBreakdown.find(
        (datum) => datum.label.toLowerCase() === label.toLowerCase(),
      )?.value ?? 0,
  }));

  useEffect(() => {
    let cancelled = false;
    const requestId = ++historyRequestId.current;

    async function load() {
      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const result = await loadPlatformPageViewHistory({
          analyticsRange,
          analyticsFrom,
          analyticsThrough,
          search: appliedHistorySearch,
          limit: historyLimit,
          offset: historyOffset,
        });

        if (!cancelled && requestId === historyRequestId.current) {
          setHistory(result);
        }
      } catch {
        if (!cancelled && requestId === historyRequestId.current) {
          setHistory(null);
          setHistoryError("Activity history could not be loaded.");
        }
      } finally {
        if (!cancelled && requestId === historyRequestId.current) {
          setHistoryLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    analyticsRange,
    analyticsFrom,
    analyticsThrough,
    appliedHistorySearch,
    historyLimit,
    historyOffset,
  ]);

  useEffect(() => {
    if (!showLocations || selectedLocation) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowLocations(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showLocations, selectedLocation]);

  function applyHistorySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHistoryOffset(0);
    setAppliedHistorySearch(historySearch.trim());
  }

  return (
    <article className="admin-analytics-panel platform-analytics-details">
      <div className="admin-analytics-panel-heading">
        <div>
          <h3>Analytics Details</h3>
          <p className="muted">
            Ranked technical and location detail for the selected reporting period.
          </p>
        </div>
      </div>

      <div className="platform-analytics-detail-grid">
        <section className="platform-analytics-detail-card">
          <h4>Device Type</h4>
          {analytics.analyticsDetailsAvailable ? (
            <RankedList data={deviceTypeData} />
          ) : (
            <Unavailable>
              Device-type detail becomes available after its database migration is deployed.
            </Unavailable>
          )}
        </section>

        <section className="platform-analytics-detail-card">
          <h4>Operating System</h4>
          <RankedList data={analytics.operatingSystemBreakdown} />
        </section>

        <section className="platform-analytics-detail-card">
          <h4>Browser</h4>
          <RankedList data={analytics.browserBreakdown} />
        </section>

        <section className="platform-analytics-detail-card">
          <h4>Platform</h4>
          <Unavailable>
            Browser platform is not persisted; operating system is not substituted.
          </Unavailable>
        </section>

        <section className="platform-analytics-detail-card">
          <div className="platform-detail-card-heading">
            <h4>Location</h4>
            {locationDataAvailable && groupedLocations.length > 0 ? (
              <button onClick={() => setShowLocations(true)} type="button">
                View All
              </button>
            ) : null}
          </div>
          {!locationDataAvailable ? (
            <Unavailable>
              Location detail becomes available after its geographic migration is deployed.
            </Unavailable>
          ) : (
            groupedLocations.length > 0 ? (
              <ol className="platform-detail-ranked-list">
                {groupedLocations.slice(0, 5).map((point) => (
                  <li key={geographicLocationGroupKey(point)}>
                    <span>{geographicLocationLabel(point)}</span>
                    <strong>{point.pageViews.toLocaleString("en-US")}</strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="platform-detail-empty">No mapped locations recorded.</p>
            )
          )}
        </section>

        <section className="platform-analytics-detail-card">
          <h4>Total Time on Site</h4>
          <Unavailable>
            Visit duration and heartbeat events are not captured.
          </Unavailable>
        </section>

        <section className="platform-analytics-detail-card platform-detail-metric-card">
          <h4>Unique Analytics Sessions</h4>
          <strong>{analytics.sessions.toLocaleString("en-US")}</strong>
          <p>
            Distinct 12-hour analytics session cookies in the selected reporting period.
          </p>
        </section>

        <section className="platform-analytics-detail-card">
          <h4>Timezone</h4>
          {analytics.timezoneBreakdownAvailable ? (
            <RankedList data={analytics.timezoneBreakdown} />
          ) : (
            <Unavailable>
              Network timezone detail becomes available after its geographic collection migration is deployed.
            </Unavailable>
          )}
        </section>
      </div>

      <section className="platform-activity-history" aria-labelledby="platform-activity-history-heading">
        <div className="platform-activity-history-heading">
          <div>
            <h4 id="platform-activity-history-heading">Page-View Activity History</h4>
            <p>Privacy-safe event detail. All timestamps are shown in UTC.</p>
          </div>
          <span>
            {history?.available
              ? `${history.total.toLocaleString("en-US")} records`
              : null}
          </span>
        </div>

        <div className="platform-activity-history-toolbar">
          <form onSubmit={applyHistorySearch} role="search">
            <label>
              <span className="sr-only">Search page-view activity</span>
              <input
                maxLength={100}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Search page, device, browser, OS, or location..."
                type="search"
                value={historySearch}
              />
            </label>
            <button type="submit">Search</button>
          </form>

          <label className="platform-activity-history-limit">
            <span>Display</span>
            <select
              aria-label="Activity rows per page"
              onChange={(event) => {
                setHistoryLimit(Number(event.target.value));
                setHistoryOffset(0);
              }}
              value={historyLimit}
            >
              {HISTORY_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>

        {historyError ? (
          <p className="platform-activity-history-status" role="alert">
            {historyError}
          </p>
        ) : historyLoading ? (
          <p className="platform-activity-history-status" role="status">
            Loading activity history...
          </p>
        ) : history && !history.available ? (
          <p className="platform-activity-history-status" role="status">
            Activity history becomes available after its database migration is deployed.
          </p>
        ) : history?.rows.length ? (
          <div className="platform-activity-history-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Timestamp (UTC)</th>
                  <th scope="col">Page</th>
                  <th scope="col">Device</th>
                  <th scope="col">Browser</th>
                  <th scope="col">Operating System</th>
                  <th scope="col">Approximate Location</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map((row, index) => {
                  const location =
                    [row.city, row.region, row.country]
                      .filter(Boolean)
                      .join(", ") || "Unknown";

                  const cells = [
                    formatTimestamp(row.timestamp),
                    row.path,
                    row.deviceType,
                    row.browser,
                    row.operatingSystem,
                    location,
                  ];

                  return (
                    <tr key={`${row.timestamp}-${row.path}-${index}`}>
                      {cells.map((value, cellIndex) => (
                        <td key={cellIndex}>
                          <button
                            aria-label={`View page-view details: ${formatTimestamp(row.timestamp)}, ${row.path}`}
                            className="platform-page-view-row-button"
                            onClick={(event) => {
                              selectedPageViewTrigger.current = event.currentTarget;
                              setSelectedPageView(row);
                            }}
                            title={value}
                            type="button"
                          >
                            {cellIndex === 1 ? <code>{value}</code> : value}
                          </button>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="platform-activity-history-status">
            No page views match this reporting period and search.
          </p>
        )}

        {history?.available && history.total > historyLimit ? (
          <nav aria-label="Page-view activity pages" className="platform-activity-history-pagination">
            <button
              disabled={historyLoading || historyOffset === 0}
              onClick={() => setHistoryOffset((value) => Math.max(0, value - historyLimit))}
              type="button"
            >
              Previous
            </button>
            <span>
              {historyOffset + 1}–{Math.min(historyOffset + historyLimit, history.total)} of {history.total}
            </span>
            <button
              disabled={historyLoading || historyOffset + historyLimit >= history.total}
              onClick={() => setHistoryOffset((value) => value + historyLimit)}
              type="button"
            >
              Next
            </button>
          </nav>
        ) : null}
      </section>

      {selectedPageView ? (
        <div
          className="platform-page-view-details-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePageViewDetails();
          }}
          role="presentation"
        >
          <section
            aria-labelledby="platform-page-view-details-heading"
            aria-modal="true"
            className="platform-page-view-details-modal"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closePageViewDetails();
              }

              if (event.key === "Tab") {
                const focusable = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                  ),
                );

                if (focusable.length === 0) {
                  event.preventDefault();
                  return;
                }

                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
            role="dialog"
          >
            <header>
              <h3 id="platform-page-view-details-heading">Page-View Details</h3>
              <button
                autoFocus
                onClick={closePageViewDetails}
                type="button"
              >
                Close
              </button>
            </header>
            <dl>
              {[
                ["Timestamp (UTC)", formatTimestamp(selectedPageView.timestamp)],
                ["Page", selectedPageView.path],
                ["Device", selectedPageView.deviceType],
                ["Browser", selectedPageView.browser],
                ["Operating System", selectedPageView.operatingSystem],
                [
                  "Approximate Location",
                  [
                    selectedPageView.city,
                    selectedPageView.region,
                    selectedPageView.country,
                  ].filter(Boolean).join(", ") || "Unknown",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      ) : null}

      {showLocations ? (
        <div
          className="platform-all-locations-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowLocations(false);
          }}
          role="presentation"
        >
          <section
            aria-labelledby="platform-all-locations-heading"
            aria-modal="true"
            className="platform-all-locations-modal"
            role="dialog"
          >
            <header>
              <div>
                <span className="eyebrow">Analytics Details</span>
                <h3 id="platform-all-locations-heading">All Locations</h3>
                <p>Approximate network locations ranked by page views.</p>
              </div>
              <button
                aria-label="Close All Locations"
                onClick={() => setShowLocations(false)}
                type="button"
              >
                Close
              </button>
            </header>

            <div className="platform-all-locations-content">
              <label className="platform-all-locations-search">
                <span className="sr-only">Search locations</span>
                <input
                  autoFocus
                  onChange={(event) => setLocationSearch(event.target.value)}
                  placeholder="Search city, region, or country..."
                  type="search"
                  value={locationSearch}
                />
              </label>

              <div className="platform-all-locations-chart">
                <div className="platform-all-locations-chart-heading">
                  <div>
                    <h4>Device Usage by Location</h4>
                    <p>Activity count and device share by captured location.</p>
                  </div>
                  <div
                    aria-label="Device colors"
                    className="platform-all-locations-legend"
                  >
                    {LOCATION_DEVICES.map((device) => (
                      <span key={device.key}>
                        <i style={{ backgroundColor: device.color }} />
                        {device.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="platform-all-locations-results">
                  {filteredLocations.length ? filteredLocations.map((point) => {
                    const devices = locationDeviceUsage(point);
                    const deviceTotal = devices.reduce(
                      (total, device) => total + device.count,
                      0,
                    );
                    const label = geographicLocationLabel(point);
                    const proportionalWidth =
                      (point.pageViews / maximumLocationPageViews) * 100;

                    return (
                      <div
                        className="platform-all-locations-row"
                        key={geographicLocationGroupKey(point)}
                      >
                        <button
                          className="platform-all-locations-label"
                          onClick={() => setSelectedLocation(point)}
                          title={`Open Location History for ${label}`}
                          type="button"
                        >
                          {label}
                        </button>

                        <div
                          aria-label={`${label} device distribution: ${devices
                            .map((device) =>
                              `${device.label} ${device.count.toLocaleString("en-US")} (${geographicDevicePercentage(device.count, deviceTotal)}%)`)
                            .join(", ")}`}
                          className="platform-all-locations-track"
                          role="img"
                        >
                          <div
                            className="platform-all-locations-stack"
                            style={{
                              "--platform-location-proportional-width":
                                `${proportionalWidth.toFixed(3)}%`,
                            } as CSSProperties}
                          >
                            {devices.map((device) => {
                              if (device.count === 0) return null;

                              const percentage = geographicDevicePercentage(
                                device.count,
                                deviceTotal,
                              );

                              return (
                                <span
                                  className="platform-all-locations-segment"
                                  key={device.key}
                                  style={{
                                    backgroundColor: device.color,
                                    flexGrow: device.count,
                                  }}
                                  title={`${device.label}: ${device.count.toLocaleString("en-US")} (${percentage}%)`}
                                >
                                  <span>
                                    {device.count.toLocaleString("en-US")} ({percentage}%)
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        <strong title="Total page views">
                          <span className="sr-only">Total page views: </span>
                          {point.pageViews.toLocaleString("en-US")}
                        </strong>
                      </div>
                    );
                  }) : (
                    <p>No locations match this search.</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {selectedLocation ? (
            <GeographicLocationHistoryModal
              analyticsFrom={analyticsFrom}
              analyticsRange={analyticsRange}
              analyticsThrough={analyticsThrough}
              onClose={() => setSelectedLocation(null)}
              onSelectLocation={setSelectedLocation}
              point={selectedLocation}
              points={groupedLocations}
              historyScope="location"
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
