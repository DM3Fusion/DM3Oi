"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadGeographicLocationGroupHistory,
  loadGeographicLocationHistory,
} from "@/components/platform/geographic-location-history-actions";
import type {
  PlatformGeographicDevicePoint,
  PlatformGeographicLocationHistory,
} from "@/lib/data/platform-analytics-repository";
import { GEOGRAPHIC_DEVICE_COLORS } from "@/lib/platform-geographic-map";

type Props = {
  point: PlatformGeographicDevicePoint | null;
  points: PlatformGeographicDevicePoint[];
  onSelectLocation: (point: PlatformGeographicDevicePoint) => void;
  onClose: () => void;
  analyticsRange: string;
  analyticsFrom: string;
  analyticsThrough: string;
  historyScope?: "coordinate" | "location";
};

const PAGE_SIZE = 25;

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function locationLabel(point: PlatformGeographicDevicePoint) {
  return [point.city, point.region, point.country]
    .filter((value) => value && value !== "Unknown")
    .join(", ") || "Unknown location";
}

function locationKey(point: PlatformGeographicDevicePoint) {
  return [
    point.latitude,
    point.longitude,
    point.city,
    point.region,
    point.country,
  ].join(":");
}

function deviceUsage(point: PlatformGeographicDevicePoint) {
  return [
    {
      label: "Desktop",
      count: point.desktop,
      color: GEOGRAPHIC_DEVICE_COLORS.desktop,
    },
    {
      label: "Mobile",
      count: point.mobile,
      color: GEOGRAPHIC_DEVICE_COLORS.mobile,
    },
    {
      label: "Tablet",
      count: point.tablet,
      color: GEOGRAPHIC_DEVICE_COLORS.tablet,
    },
    {
      label: "Other",
      count: point.other,
      color: GEOGRAPHIC_DEVICE_COLORS.other,
    },
    {
      label: "Unknown",
      count: point.unknown,
      color: GEOGRAPHIC_DEVICE_COLORS.unknown,
    },
  ];
}

export function GeographicLocationHistoryModal({
  point,
  points,
  onSelectLocation,
  onClose,
  analyticsRange,
  analyticsFrom,
  analyticsThrough,
  historyScope = "coordinate",
}: Props) {
  const [offset, setOffset] = useState(0);
  const [history, setHistory] =
    useState<PlatformGeographicLocationHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const latitude = point?.latitude;
  const longitude = point?.longitude;
  const city = point?.city;
  const region = point?.region;
  const country = point?.country;
  const selectedLocationKey = point ? locationKey(point) : null;

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;

    let cancelled = false;
    const requestId = ++requestIdRef.current;

    async function load() {
      setLoading(true);
      setError(null);
      setHistory(null);

      try {
        const result = historyScope === "location"
          ? await loadGeographicLocationGroupHistory({
              analyticsRange,
              analyticsFrom,
              analyticsThrough,
              city: city!,
              region: region!,
              country: country!,
              limit: PAGE_SIZE,
              offset,
            })
          : await loadGeographicLocationHistory({
              analyticsRange,
              analyticsFrom,
              analyticsThrough,
              latitude: latitude!,
              longitude: longitude!,
              limit: PAGE_SIZE,
              offset,
            });

        if (!cancelled && requestId === requestIdRef.current) {
          setHistory(result);
        }
      } catch {
        if (!cancelled && requestId === requestIdRef.current) {
          setError("Location History could not be loaded.");
          setHistory(null);
        }
      } finally {
        if (!cancelled && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    latitude,
    longitude,
    city,
    region,
    country,
    historyScope,
    selectedLocationKey,
    analyticsRange,
    analyticsFrom,
    analyticsThrough,
    offset,
  ]);

  useEffect(() => {
    if (!point) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [point, onClose]);

  if (!point) return null;

  const devices = deviceUsage(point);

  function selectLocation(nextPoint: PlatformGeographicDevicePoint) {
    if (locationKey(nextPoint) === selectedLocationKey) return;

    requestIdRef.current += 1;
    setOffset(0);
    setHistory(null);
    setError(null);
    setLoading(true);
    onSelectLocation(nextPoint);
  }

  return (
    <div
      className="platform-location-history-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-label="Location History"
        aria-modal="true"
        className="platform-location-history-modal"
        role="dialog"
      >
        <header className="platform-location-history-header">
          <div>
            <span className="eyebrow">Geographic Analytics</span>
            <h3>Location History</h3>
            <p>{locationLabel(point)}</p>
            {historyScope === "location" ? (
              <small>
                Combined history for every mapped coordinate group with this
                captured city, region, and country.
              </small>
            ) : (
              <small>
                Approximate network coordinates:{" "}
                {point.latitude.toFixed(2)},{" "}
                {point.longitude.toFixed(2)}
              </small>
            )}
          </div>

          <button
            aria-label="Close Location History"
            className="platform-location-history-close"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </header>

        <div className="platform-location-history-content">
          <div className="platform-location-history-summary">
            <span>Page Views</span>
            <strong>
              {point.pageViews.toLocaleString("en-US")}
            </strong>
          </div>

          <section className="platform-location-history-devices">
            <h4>Device Usage by Location</h4>

            <div className="platform-location-history-location-list">
              {points.map((location) => {
                const locationDevices = deviceUsage(location);
                const deviceTotal = locationDevices.reduce(
                  (total, device) => total + device.count,
                  0,
                );
                const label = locationLabel(location);
                const selected =
                  locationKey(location) === selectedLocationKey;

                return (
                  <button
                    aria-pressed={selected}
                    className={
                      selected
                        ? "platform-location-history-location is-selected"
                        : "platform-location-history-location"
                    }
                    key={locationKey(location)}
                    onClick={() => selectLocation(location)}
                    type="button"
                  >
                    <span className="platform-location-history-location-label">
                      {label}
                    </span>
                    <strong>
                      {location.pageViews.toLocaleString("en-US")} page views
                    </strong>
                    <span
                      aria-label={`${label} device distribution: ${locationDevices
                        .map(
                          (device) =>
                            `${device.label} ${device.count.toLocaleString("en-US")}`,
                        )
                        .join(", ")}`}
                      className="platform-location-history-stacked-bar"
                      role="img"
                    >
                      {locationDevices.map((device) =>
                        device.count > 0 ? (
                          <span
                            key={device.label}
                            style={{
                              backgroundColor: device.color,
                              width: `${
                                deviceTotal
                                  ? (device.count / deviceTotal) * 100
                                  : 0
                              }%`,
                            }}
                            title={`${device.label}: ${device.count}`}
                          />
                        ) : null,
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="platform-location-history-device-legend">
              {devices.map((device) => (
                <span key={device.label}>
                  <i style={{ backgroundColor: device.color }} />
                  {device.label}:{" "}
                  {device.count.toLocaleString("en-US")}
                </span>
              ))}
            </div>
          </section>

          <section className="platform-location-history-events">
            <div className="platform-location-history-table-heading">
              <h4>Page View History</h4>
              <span>
                {history
                  ? `${history.total.toLocaleString("en-US")} records`
                  : "Loading records"}
              </span>
            </div>

            {error ? (
              <p role="alert">{error}</p>
            ) : loading ? (
              <p className="muted" role="status">
                Loading Location History...
              </p>
            ) : history?.rows.length ? (
              <div className="platform-location-history-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Time (UTC)</th>
                      <th scope="col">Page</th>
                      <th scope="col">Device</th>
                      <th scope="col">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.rows.map((row, index) => (
                      <tr key={`${row.timestamp}-${row.path}-${index}`}>
                        <td>{formatTimestamp(row.timestamp)}</td>
                        <td><code>{row.path}</code></td>
                        <td>{row.deviceType}</td>
                        <td>
                          {[row.city, row.region, row.country]
                            .filter(Boolean)
                            .join(", ") || "Unknown"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">
                No page views found for this location and reporting period.
              </p>
            )}

            {history && history.total > PAGE_SIZE ? (
              <nav
                aria-label="Location History pages"
                className="platform-location-history-pagination"
              >
                <button
                  disabled={loading || offset === 0}
                  onClick={() =>
                    setOffset((current) =>
                      Math.max(0, current - PAGE_SIZE),
                    )
                  }
                  type="button"
                >
                  Previous
                </button>

                <span>
                  {offset + 1}–
                  {Math.min(offset + PAGE_SIZE, history.total)}
                  {" "}of {history.total}
                </span>

                <button
                  disabled={
                    loading ||
                    offset + PAGE_SIZE >= history.total
                  }
                  onClick={() =>
                    setOffset((current) =>
                      current + PAGE_SIZE,
                    )
                  }
                  type="button"
                >
                  Next
                </button>
              </nav>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}
