"use server";

import {
  getPlatformGeographicLocationHistory,
  type PlatformGeographicLocationHistory,
} from "@/lib/data/platform-analytics-repository";

type GeographicHistoryRequest = {
  analyticsRange?: string;
  analyticsFrom?: string;
  analyticsThrough?: string;
  latitude: number;
  longitude: number;
  limit?: number;
  offset?: number;
};

export async function loadGeographicLocationHistory(
  request: GeographicHistoryRequest,
): Promise<PlatformGeographicLocationHistory> {
  if (!request || typeof request !== "object") {
    throw new Error("Invalid Location History request.");
  }

  return getPlatformGeographicLocationHistory(
    {
      analyticsRange: request.analyticsRange,
      analyticsFrom: request.analyticsFrom,
      analyticsThrough: request.analyticsThrough,
    },
    request.latitude,
    request.longitude,
    request.limit ?? 50,
    request.offset ?? 0,
  );
}
