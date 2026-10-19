export type GeographicDevice =
  | "desktop"
  | "mobile"
  | "tablet"
  | "other"
  | "unknown";

export const GEOGRAPHIC_RADIUS_OPTIONS = [25, 50, 75, 100] as const;

export type GeographicRadius =
  (typeof GEOGRAPHIC_RADIUS_OPTIONS)[number];

export const GEOGRAPHIC_DEFAULT_RADIUS: GeographicRadius = 50;

// Approximate reference point for ZIP 20613, Brandywine, Maryland.
// This is a map reference, not a visitor location.
export const GEOGRAPHIC_RADIUS_CENTER = {
  latitude: 38.70,
  longitude: -76.85,
} as const;

export const GEOGRAPHIC_DEVICE_COLORS: Record<
  GeographicDevice,
  string
> = {
  desktop: "#2f4a6f",
  mobile: "#c99a4e",
  tablet: "#2f7d5b",
  other: "#8a4f7d",
  unknown: "#7b8794",
};

export function geographicDistanceMiles(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radians = (degrees: number) =>
    (degrees * Math.PI) / 180;

  const latitudeDifference = radians(
    latitudeB - latitudeA,
  );

  const longitudeDifference = radians(
    longitudeB - longitudeA,
  );

  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDifference / 2) ** 2;

  const bounded = Math.min(1, Math.max(0, haversine));

  return 3958.7613 * 2 * Math.asin(Math.sqrt(bounded));
}

export function geographicMarkerDiameter(pageViews: number): number {
  const count = Math.max(0, pageViews);

  return Math.min(
    34,
    Math.max(
      14,
      Math.round(12 + 4 * Math.log2(count + 1)),
    ),
  );
}

export function geographicWithinRadius(
  latitude: number,
  longitude: number,
  radiusMiles: GeographicRadius,
): boolean {
  return geographicDistanceMiles(
    GEOGRAPHIC_RADIUS_CENTER.latitude,
    GEOGRAPHIC_RADIUS_CENTER.longitude,
    latitude,
    longitude,
  ) <= radiusMiles;
}
