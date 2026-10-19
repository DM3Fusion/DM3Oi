"use client";

import { useEffect, useRef } from "react";
import type { PlatformGeographicDevicePoint } from "@/lib/data/platform-analytics-repository";
import {
  GEOGRAPHIC_DEVICE_COLORS,
  GEOGRAPHIC_RADIUS_CENTER,
  geographicDominantDevice,
  geographicMarkerRadius,
  geographicWithinRadius,
  type GeographicRadius,
} from "@/lib/platform-geographic-map";

type Props = {
  points: PlatformGeographicDevicePoint[];
  radius: GeographicRadius;
  onSelectLocation: (point: PlatformGeographicDevicePoint) => void;
};

function locationLabel(point: PlatformGeographicDevicePoint) {
  return [point.city, point.region, point.country]
    .filter((part) => part && part !== "Unknown")
    .join(", ") || "Unknown location";
}

export function GeographicDeviceMap({
  points,
  radius,
  onSelectLocation,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectLocationRef = useRef(onSelectLocation);

  useEffect(() => {
    selectLocationRef.current = onSelectLocation;
  }, [onSelectLocation]);

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
      <div
        ref={containerRef}
        id="platform-geographic-device-map"
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
