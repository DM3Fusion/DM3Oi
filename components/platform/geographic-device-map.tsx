"use client";

import { useEffect, useRef } from "react";
import type { PlatformGeographicDevicePoint } from "@/lib/data/platform-analytics-repository";
import {
  GEOGRAPHIC_ALL_LOCATIONS,
  GEOGRAPHIC_DEVICE_COLORS,
  GEOGRAPHIC_RADIUS_CENTER,
  geographicDistanceMiles,
  geographicMarkerDiameter,
  geographicPointsForRadius,
  type GeographicDevice,
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

const GEOGRAPHIC_DEVICES: GeographicDevice[] = [
  "desktop",
  "mobile",
  "tablet",
  "other",
  "unknown",
];

function deviceLabel(device: GeographicDevice) {
  return device.charAt(0).toUpperCase() + device.slice(1);
}

function markerOffset(
  device: GeographicDevice,
  hasMultipleDevices: boolean,
) {
  if (!hasMultipleDevices) return { x: 0, y: 0 };

  const offsets: Record<GeographicDevice, { x: number; y: number }> = {
    desktop: { x: -9, y: -9 },
    mobile: { x: 9, y: -9 },
    tablet: { x: -9, y: 9 },
    other: { x: 9, y: 9 },
    unknown: { x: 0, y: 0 },
  };

  return offsets[device];
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
        center,
        zoom: 8,
        minZoom: 3,
        maxZoom: 19,
        scrollWheelZoom: false,
        keyboard: true,
      });

      map = leafletMap;

      leaflet.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        },
      ).addTo(leafletMap);

      leaflet.control.scale({ imperial: true, metric: false }).addTo(leafletMap);

      const boundary = radius === GEOGRAPHIC_ALL_LOCATIONS
        ? null
        : leaflet.circle(center, {
            radius: radius * 1609.344,
            color: GEOGRAPHIC_DEVICE_COLORS.desktop,
            weight: 2,
            opacity: 0.78,
            fillColor: GEOGRAPHIC_DEVICE_COLORS.desktop,
            fillOpacity: 0.045,
            dashArray: "7 6",
            interactive: false,
          }).addTo(leafletMap);

      leaflet.circleMarker(center, {
        radius: 4,
        color: "#ffffff",
        fillColor: GEOGRAPHIC_DEVICE_COLORS.desktop,
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip("ZIP 20613 center", { direction: "top" })
        .addTo(leafletMap);

      const visiblePoints = geographicPointsForRadius(points, radius);

      for (const point of visiblePoints) {
        const activeDevices = GEOGRAPHIC_DEVICES.filter(
          (device) => point[device] > 0,
        );

        for (const device of activeDevices) {
          const pageViews = point[device];
          const diameter = geographicMarkerDiameter(pageViews);
          const offset = markerOffset(device, activeDevices.length > 1);
          const iconBoxSize = diameter + 24;
          const label = locationLabel(point);
          const distance = geographicDistanceMiles(
            GEOGRAPHIC_RADIUS_CENTER.latitude,
            GEOGRAPHIC_RADIUS_CENTER.longitude,
            point.latitude,
            point.longitude,
          ).toFixed(1);
          const accessibleLabel = `${label}; ${deviceLabel(device)}; ${pageViews.toLocaleString("en-US")} page view${pageViews === 1 ? "" : "s"}; approximately ${distance} miles from ZIP 20613`;
          const icon = leaflet.divIcon({
            className: `platform-geographic-marker-shell platform-geographic-marker-${device}`,
            iconSize: [iconBoxSize, iconBoxSize],
            iconAnchor: [iconBoxSize / 2, iconBoxSize / 2],
            html: `<span class="platform-geographic-marker-dot" aria-hidden="true" style="--platform-geographic-marker-size:${diameter}px;--platform-geographic-marker-offset-x:${offset.x}px;--platform-geographic-marker-offset-y:${offset.y}px"></span>`,
          });
          const marker = leaflet.marker(
            [point.latitude, point.longitude],
            {
              alt: accessibleLabel,
              icon,
              keyboard: true,
              riseOnHover: true,
              title: accessibleLabel,
            },
          );

          marker.bindTooltip(
            `${label} · ${pageViews.toLocaleString("en-US")} ${deviceLabel(device)} page view${pageViews === 1 ? "" : "s"} · ${distance} miles from ZIP 20613`,
            { direction: "top", offset: [offset.x, offset.y - 6] },
          );
          marker.on("click", () => selectLocationRef.current(point));
          marker.addTo(leafletMap);

          const markerElement = marker.getElement();
          if (markerElement) {
            markerElement.setAttribute("role", "button");
            markerElement.setAttribute("aria-label", accessibleLabel);
            markerElement.addEventListener("focus", () => marker.openTooltip());
            markerElement.addEventListener("blur", () => marker.closeTooltip());
            markerElement.addEventListener("keydown", (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              selectLocationRef.current(point);
            });
          }
        }
      }

      if (boundary) {
        leafletMap.fitBounds(boundary.getBounds(), {
          padding: [18, 18],
          animate: false,
        });
      } else if (visiblePoints.length > 0) {
        const pointBounds = leaflet.latLngBounds(
          visiblePoints.map((point) => [
            point.latitude,
            point.longitude,
          ]),
        );

        leafletMap.fitBounds(pointBounds, {
          padding: [18, 18],
          maxZoom: 10,
          animate: false,
        });
      } else {
        leafletMap.setView(center, 8, { animate: false });
      }

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
        aria-label={
          radius === GEOGRAPHIC_ALL_LOCATIONS
            ? "Interactive map of geographic device activity across all mapped locations"
            : `Interactive map of geographic device activity within ${radius} miles of ZIP 20613`
        }
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
            {deviceLabel(device)}
          </span>
        ))}
      </div>

      <p className="muted platform-geographic-map-note">
        Locations are approximate network estimates, not GPS
        positions. Marker colors indicate device types, and marker
        sizes reflect page-view counts. Select a marker to view activity.
      </p>
    </div>
  );
}
