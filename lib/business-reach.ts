import { createHash } from "node:crypto";

export const businessReachGeocodeBatchLimit = 500;
export const businessReachGeocodeSource = "US_CENSUS_BATCH" as const;

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
  uniqueLocations: number;
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

export type NormalizedBusinessReachAddress = {
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
};

export type BusinessReachAddressGroup = {
  key: string;
  address: NormalizedBusinessReachAddress;
  candidates: BusinessReachCandidate[];
};

export type BusinessReachGeocodeResult = {
  latitude: number;
  longitude: number;
};

export type BusinessReachUnmappedCustomer = {
  customerId: string;
  customerNumber: string;
  customerName: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  mappingStatus: "PENDING" | "UNMAPPABLE";
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
    uniqueLocations: nonNegativeInteger(value.uniqueLocations),
    points,
    loadError: false,
  };
}

const normalizedAddressPart = (value: string | null | undefined) =>
  value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";

const normalizedAddressParts = (address: BusinessReachAddress) => ({
  streetAddress: normalizedAddressPart(address.streetAddress),
  city: normalizedAddressPart(address.city),
  state: normalizedAddressPart(address.state),
  postalCode: normalizedAddressPart(address.postalCode),
});

export function fingerprintBusinessReachAddress(address: BusinessReachAddress) {
  const normalized = normalizedAddressParts(address);
  return createHash("md5")
    .update([
      normalized.streetAddress,
      normalized.city,
      normalized.state,
      normalized.postalCode,
    ].join("\u001f"))
    .digest("hex");
}

export function normalizeBusinessReachAddress(
  address: BusinessReachAddress,
): NormalizedBusinessReachAddress | null {
  const normalized = normalizedAddressParts(address);
  if (!normalized.streetAddress || !normalized.city || !/^[a-z]{2}$/.test(normalized.state) || !/^\d{5}(?:-\d{4})?$/.test(normalized.postalCode)) return null;
  return {
    streetAddress: normalized.streetAddress,
    city: normalized.city,
    state: normalized.state.toUpperCase(),
    postalCode: normalized.postalCode,
  };
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

export function normalizeBusinessReachUnmappedCustomers(
  payload: unknown,
): BusinessReachUnmappedCustomer[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item): BusinessReachUnmappedCustomer[] => {
    if (
      !isRecord(item) ||
      typeof item.customerId !== "string" ||
      typeof item.customerNumber !== "string" ||
      typeof item.customerName !== "string" ||
      (item.mappingStatus !== "PENDING" && item.mappingStatus !== "UNMAPPABLE")
    ) return [];
    return [{
      customerId: item.customerId,
      customerNumber: item.customerNumber,
      customerName: item.customerName,
      streetAddress: typeof item.streetAddress === "string" ? item.streetAddress : null,
      city: typeof item.city === "string" ? item.city : null,
      state: typeof item.state === "string" ? item.state : null,
      postalCode: typeof item.postalCode === "string" ? item.postalCode : null,
      mappingStatus: item.mappingStatus,
    }];
  });
}

const unmappableWrite = (candidate: BusinessReachCandidate): BusinessReachGeocodeWrite => ({
  customerId: candidate.customerId,
  addressFingerprint: candidate.addressFingerprint,
  status: "UNMAPPABLE",
  locationKey: null,
  latitude: null,
  longitude: null,
});

export function buildBusinessReachAddressBatch(candidates: BusinessReachCandidate[]) {
  const grouped = new Map<string, BusinessReachAddressGroup>();
  const invalidWrites: BusinessReachGeocodeWrite[] = [];
  for (const candidate of candidates.slice(0, businessReachGeocodeBatchLimit)) {
    const address = normalizeBusinessReachAddress(candidate);
    if (!address) {
      invalidWrites.push(unmappableWrite(candidate));
      continue;
    }
    const key = fingerprintBusinessReachAddress(address);
    const existing = grouped.get(key);
    if (existing) existing.candidates.push(candidate);
    else grouped.set(key, { key, address, candidates: [candidate] });
  }
  return { uniqueAddresses: [...grouped.values()], invalidWrites };
}

export function buildBusinessReachGeocodeWrites(
  groups: BusinessReachAddressGroup[],
  results: ReadonlyMap<string, BusinessReachGeocodeResult>,
): BusinessReachGeocodeWrite[] {
  return groups.flatMap((group) => {
    const result = results.get(group.key);
    return group.candidates.map((candidate) =>
      result && isValidBusinessReachCoordinate(result.latitude, result.longitude)
        ? {
            customerId: candidate.customerId,
            addressFingerprint: candidate.addressFingerprint,
            status: "MAPPED" as const,
            locationKey: group.key,
            latitude: result.latitude,
            longitude: result.longitude,
          }
        : unmappableWrite(candidate),
    );
  });
}

export const unavailableBusinessReach = (canRefresh = false): BusinessReachData => ({
  available: false,
  canRefresh,
  activeCustomers: 0,
  mappedCustomers: 0,
  unmappedCustomers: 0,
  pendingCustomers: 0,
  unmappableCustomers: 0,
  uniqueLocations: 0,
  points: [],
  loadError: false,
});

export const failedBusinessReach = (canRefresh: boolean): BusinessReachData => ({
  ...unavailableBusinessReach(canRefresh),
  available: true,
  loadError: true,
});
