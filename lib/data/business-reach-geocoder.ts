import "server-only";

import type { BusinessReachAddressGroup, BusinessReachGeocodeResult } from "@/lib/business-reach";
import { buildCensusAddressBatch, parseCensusAddressBatch } from "@/lib/business-reach-census";

const censusBatchEndpoint = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";

export class BusinessReachGeocoderError extends Error {
  constructor(public readonly kind: "HTTP" | "TIMEOUT" | "NETWORK" | "MALFORMED_RESPONSE", public readonly status: number | null = null) {
    super("Business Reach address geocoding failed.");
    this.name = "BusinessReachGeocoderError";
  }
}

export async function geocodeBusinessReachAddresses(
  groups: BusinessReachAddressGroup[],
): Promise<Map<string, BusinessReachGeocodeResult>> {
  if (!groups.length) return new Map<string, BusinessReachGeocodeResult>();
  const { csv, keyByRequestId } = buildCensusAddressBatch(groups);
  const formData = new FormData();
  formData.set("addressFile", new Blob([csv], { type: "text/csv" }), "business-reach.csv");
  formData.set("benchmark", "Public_AR_Current");

  let response: Response;
  try {
    response = await fetch(censusBatchEndpoint, {
      method: "POST",
      body: formData,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    const kind = error instanceof DOMException && error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK";
    throw new BusinessReachGeocoderError(kind);
  }
  if (!response.ok) throw new BusinessReachGeocoderError("HTTP", response.status);

  const parsed = parseCensusAddressBatch(await response.text(), keyByRequestId);
  if (parsed.processedKeys.size !== groups.length) {
    throw new BusinessReachGeocoderError("MALFORMED_RESPONSE", response.status);
  }
  return parsed.results;
}
