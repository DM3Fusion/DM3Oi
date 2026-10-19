"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlatformGeographicDevicePoint } from "@/lib/data/platform-analytics-repository";
import {
  GEOGRAPHIC_DEFAULT_RADIUS,
  GEOGRAPHIC_DEVICE_COLORS,
  GEOGRAPHIC_RADIUS_CENTER,
  GEOGRAPHIC_RADIUS_OPTIONS,
  geographicDominantDevice,
  geographicMarkerRadius,
  geographicWithinRadius,
  type GeographicRadius,
} from "@/lib/platform-geographic-map";

type Props = {
  points: PlatformGeographicDevicePoint[];
  onSelectLocation: (point: PlatformGeographicDevicePoint) => void;
};

function locationLabel(point: PlatformGeographicDevicePoint) {
  return [point.city, point.region, point.country]
    .filter((part) => part && part !== "Unknown")
    .join(", ") || "Unknown location";
}

export function GeographicDeviceMap({
  points,
  onSelectLocation,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectLocationRef = useRef(onSelectLocation);
  const [radius, setRadius] = useState<GeographicRadius>(
    GEOGRAPHIC_DEFAULT_RADIUS,
  );

  useEffect(() => {
    selectLocationRef.current = onSelectLocation;
  }, [onSelectLocation]);

  const nearbyPoints = useMemo(
    () =>
      points.filter((point) =>
        geographicWithinRadius(
          point.latitude,
          point.longitude,
          radius,
        ),
      ),
    [points, radius],
  );

  const nearbyPageViews = nearbyPoints.reduce(
    (total, point) => total + point.pageViews,
    0,
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    let resizeObserver: ResizeObserver | null = null;

    void import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current) return;

      const center: [number, number] = [
        GEOGRAPHIC_RADIUS_CENTER.latitude,
        GEOGRAPHIC_RADIUS_CENTER.longitude,
      ];

      const leafletMap = leaflet.map(container, {
        scrollWheelZoom: false,
        zoomControl: true,
      });

      map = leafletMap;

      leaflet.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 18,
        },
      ).addTo(leafletMap);

      leaflet.circle(center, {
        radius: radius * 1609.344,
        color: "#537b94",
        weight: 2,
        opacity: 0.75,
        fillColor: "#537b94",
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(leafletMap);

      leaflet.circleMarker(center, {
        radius: 5,
        color: "#294d63",
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip("ZIP 20613 radius center")
        .addTo(leafletMap);

      for (const point of points) {
        const device = geographicDominantDevice(point);
        const inRadius = geographicWithinRadius(
          point.latitude,
          point.longitude,
          radius,
        );

        const marker = leaflet.circleMarker(
          [point.latitude, point.longitude],
          {
            radius: geographicMarkerRadius(point.pageViews),
            color: GEOGRAPHIC_DEVICE_COLORS[device],
            fillColor: GEOGRAPHIC_DEVICE_COLORS[device],
            weight: 2,
            opacity: inRadius ? 1 : 0.45,
            fillOpacity: inRadius ? 0.7 : 0.2,
          },
        );

        marker.bindTooltip(
          `${locationLabel(point)} · ${point.pageViews.toLocaleString("en-US")} page views · ${device}`,
        );

        marker.on("click", () => {
          selectLocationRef.current(point);
        });

        marker.addTo(leafletMap);
      }

      const bounds = leaflet.latLngBounds(
        [
          leaflet.latLng(
            center[0] - radius / 69,
            center[1] - radius / 54,
          ),
          leaflet.latLng(
            center[0] + radius / 69,
            center[1] + radius / 54,
          ),
        ],
      );

      leafletMap.fitBounds(bounds, {
        padding: [28, 28],
        animate: false,
      });

      const resizeMap = () => {
        if (!cancelled) {
          leafletMap.invalidateSize({ animate: false });
        }
      };

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(resizeMap);
        resizeObserver.observe(container);
      }

      requestAnimationFrame(resizeMap);
    }).catch((error: unknown) => {
      console.error("Geographic map initialization failed", error);
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      map?.remove();
    };
  }, [points, radius]);

  return (
    <div className="platform-geographic-map-shell">
      <div className="platform-geographic-map-toolbar">
        <label>
          Radius around ZIP 20613
          <select
            aria-label="Geographic radius"
            onChange={(event) =>
              setRadius(
                Number(event.target.value) as GeographicRadius,
              )
            }
            value={radius}
          >
            {GEOGRAPHIC_RADIUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} miles
              </option>
            ))}
          </select>
        </label>

        <div className="platform-geographic-map-summary">
          <strong>{nearbyPageViews.toLocaleString("en-US")}</strong>
          <span>Page Views within {radius} miles</span>
          <small>
            {nearbyPoints.length} mapped{" "}
            {nearbyPoints.length === 1 ? "location" : "locations"}
          </small>
        </div>
      </div>

      <div
        ref={containerRef}
        className="platform-geographic-map"
        aria-label="Interactive map of approximate network locations"
      />

      <div className="platform-geographic-map-legend">
        {(
          Object.entries(GEOGRAPHIC_DEVICE_COLORS) as [
            keyof typeof GEOGRAPHIC_DEVICE_COLORS,
            string,
          ][]
        ).map(([device, color]) => (
          <span key={device}>
            <i style={{ backgroundColor: color }} />
            {device.charAt(0).toUpperCase() + device.slice(1)}
          </span>
        ))}
      </div>

      <p className="muted platform-geographic-map-note">
        Locations are approximate network estimates, not GPS
        positions. Marker colors indicate the most common device
        type at each location. Select a marker to view activity.
      </p>
    </div>
  );
}
