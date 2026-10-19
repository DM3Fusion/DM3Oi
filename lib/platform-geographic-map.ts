export type GeographicDevice =
  | "desktop"
  | "mobile"
  | "tablet"
  | "other"
  | "unknown";

export const GEOGRAPHIC_ALL_LOCATIONS = "all" as const;

export const GEOGRAPHIC_RADIUS_OPTIONS = [
  25,
  50,
  75,
  100,
  250,
  500,
  1000,
  GEOGRAPHIC_ALL_LOCATIONS,
] as const;

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
  radiusMiles: Exclude<GeographicRadius, typeof GEOGRAPHIC_ALL_LOCATIONS>,
): boolean {
  return geographicDistanceMiles(
    GEOGRAPHIC_RADIUS_CENTER.latitude,
    GEOGRAPHIC_RADIUS_CENTER.longitude,
    latitude,
    longitude,
  ) <= radiusMiles;
}

export function geographicHasValidCoordinates(point: {
  latitude: number;
  longitude: number;
}): boolean {
  return (
    Number.isFinite(point.latitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    Number.isFinite(point.longitude) &&
    point.longitude >= -180 &&
    point.longitude <= 180 &&
    !(point.latitude === 0 && point.longitude === 0)
  );
}

export function geographicPointsForRadius<
  Point extends { latitude: number; longitude: number },
>(points: readonly Point[], radius: GeographicRadius): Point[] {
  return points.filter(
    (point) =>
      geographicHasValidCoordinates(point) &&
      (radius === GEOGRAPHIC_ALL_LOCATIONS ||
        geographicWithinRadius(
          point.latitude,
          point.longitude,
          radius,
        )),
  );
}

export function summarizeGeographicPoints(
  points: readonly {
    pageViews: number;
    desktop: number;
    mobile: number;
    tablet: number;
    other: number;
    unknown: number;
  }[],
) {
  return points.reduce(
    (summary, point) => ({
      pageViews: summary.pageViews + point.pageViews,
      desktop: summary.desktop + point.desktop,
      mobile: summary.mobile + point.mobile,
      tablet: summary.tablet + point.tablet,
      other: summary.other + point.other + point.unknown,
    }),
    { pageViews: 0, desktop: 0, mobile: 0, tablet: 0, other: 0 },
  );
}
