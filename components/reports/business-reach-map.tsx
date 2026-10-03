"use client";

import { useEffect, useRef } from "react";
import type { BusinessReachPoint } from "@/lib/business-reach";

export function BusinessReachMap({ points }: { points: BusinessReachPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !points.length) return;
    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    void Promise.all([import("leaflet"), import("@linkurious/leaflet-heat")]).then(([leaflet, heat]) => {
      if (cancelled || !containerRef.current) return;
      map = leaflet.map(container, {
        attributionControl: true,
        zoomControl: true,
        scrollWheelZoom: false,
      });
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      const heatPoints: [number, number, number][] = points.map((point) => [
        point.latitude,
        point.longitude,
        point.weight,
      ]);
      heat.heatLayer(heatPoints, {
        radius: 30,
        blur: 24,
        minOpacity: 0.28,
        maxZoom: 11,
        max: Math.max(1, ...points.map((point) => point.weight)),
        gradient: {
          0.2: "#afc9d5",
          0.45: "#5f95a8",
          0.7: "#c49a54",
          1: "#a95449",
        },
      }).addTo(map);

      if (points.length === 1) {
        map.setView([points[0].latitude, points[0].longitude], 10);
      } else {
        map.fitBounds(
          leaflet.latLngBounds(points.map((point) => [point.latitude, point.longitude])),
          { padding: [34, 34], maxZoom: 10 },
        );
      }
    }).catch((error: unknown) => {
      console.error("Business Reach map initialization failed", error);
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points]);

  return (
    <div
      ref={containerRef}
      className="business-reach-map"
      role="img"
      aria-label={`Customer density heat map with ${points.length} aggregated geographic ${points.length === 1 ? "point" : "points"}.`}
    />
  );
}
