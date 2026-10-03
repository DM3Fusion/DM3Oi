import { createHash } from "node:crypto";
import zipcodes from "zipcodes";

export const businessReachGeocodeBatchLimit = 500;
export const businessReachGeocodeSource = "ZIPCODES_US_ZIP_CENTROID" as const;

export type BusinessReachPoint = {
  latitude: number;
  longitude: number;
  weight: number;
};

export type BusinessReachData = {
  available: boolean;
  canRefresh: boolean;
  activeCustomers: number;
  mappedCustomers: number;
  unmappedCustomers: number;
  pendingCustomers: number;
  unmappableCustomers: number;
  geographicCoverage: number;
  points: BusinessReachPoint[];
  loadError: boolean;
};

export type BusinessReachAddress = {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

export type BusinessReachCandidate = BusinessReachAddress & {
  customerId: string;
  addressFingerprint: string;
};

export type BusinessReachGeocodeWrite = {
  customerId: string;
  addressFingerprint: string;
  status: "MAPPED" | "UNMAPPABLE";
  locationKey: string | null;
  latitude: number | null;
  longitude: number | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export const isValidBusinessReachCoordinate = (latitude: unknown, longitude: unknown) =>
  typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
  typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;

export function normalizeBusinessReachPayload(
  payload: unknown,
  canRefresh: boolean,
): BusinessReachData {
  const value = isRecord(payload) ? payload : {};
  const rawPoints = Array.isArray(value.points) ? value.points : [];
  const points = rawPoints.flatMap((item): BusinessReachPoint[] => {
    if (!isRecord(item)) return [];
    const { latitude, longitude, weight } = item;
    if (!isValidBusinessReachCoordinate(latitude, longitude)) return [];
    const normalizedWeight = nonNegativeInteger(weight);
    return normalizedWeight > 0
      ? [{ latitude: latitude as number, longitude: longitude as number, weight: normalizedWeight }]
      : [];
  });

  return {
    available: true,
    canRefresh,
    activeCustomers: nonNegativeInteger(value.activeCustomers),
    mappedCustomers: nonNegativeInteger(value.mappedCustomers),
    unmappedCustomers: nonNegativeInteger(value.unmappedCustomers),
    pendingCustomers: nonNegativeInteger(value.pendingCustomers),
    unmappableCustomers: nonNegativeInteger(value.unmappableCustomers),
    geographicCoverage: nonNegativeInteger(value.geographicCoverage),
    points,
    loadError: false,
  };
}

const normalizedAddressPart = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? "";

export function fingerprintBusinessReachAddress(address: BusinessReachAddress) {
  return createHash("md5")
    .update([
      address.streetAddress,
      address.city,
      address.state,
      address.postalCode,
    ].map(normalizedAddressPart).join("\u001f"))
    .digest("hex");
}

export function parseBusinessReachCandidates(payload: unknown): BusinessReachCandidate[] {
  if (!Array.isArray(payload)) return [];
  return payload.slice(0, businessReachGeocodeBatchLimit).flatMap((item): BusinessReachCandidate[] => {
    if (!isRecord(item) || typeof item.customerId !== "string" || typeof item.addressFingerprint !== "string") return [];
    const candidate = {
      customerId: item.customerId,
      streetAddress: typeof item.streetAddress === "string" ? item.streetAddress : null,
      city: typeof item.city === "string" ? item.city : null,
      state: typeof item.state === "string" ? item.state : null,
      postalCode: typeof item.postalCode === "string" ? item.postalCode : null,
      addressFingerprint: item.addressFingerprint,
    };
    return fingerprintBusinessReachAddress(candidate) === candidate.addressFingerprint ? [candidate] : [];
  });
}

export function geocodeBusinessReachCandidate(
  candidate: BusinessReachCandidate,
): BusinessReachGeocodeWrite {
  const match = candidate.postalCode?.trim().match(/^(\d{5})(?:-\d{4})?$/);
  const location = match ? zipcodes.lookup(match[1]) : undefined;
  if (!match || !location || !isValidBusinessReachCoordinate(location.latitude, location.longitude)) {
    return {
      customerId: candidate.customerId,
      addressFingerprint: candidate.addressFingerprint,
      status: "UNMAPPABLE",
      locationKey: null,
      latitude: null,
      longitude: null,
    };
  }

  return {
    customerId: candidate.customerId,
    addressFingerprint: candidate.addressFingerprint,
    status: "MAPPED",
    locationKey: match[1],
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

export const unavailableBusinessReach = (canRefresh = false): BusinessReachData => ({
  available: false,
  canRefresh,
  activeCustomers: 0,
  mappedCustomers: 0,
  unmappedCustomers: 0,
  pendingCustomers: 0,
  unmappableCustomers: 0,
  geographicCoverage: 0,
  points: [],
  loadError: false,
});

export const failedBusinessReach = (canRefresh: boolean): BusinessReachData => ({
  ...unavailableBusinessReach(canRefresh),
  available: true,
  loadError: true,
});
