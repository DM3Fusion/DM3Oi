"use server";

import {
  getPlatformGeographicLocationHistory,
  getPlatformGeographicLocationGroupHistory,
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

type GeographicLocationGroupHistoryRequest = {
  analyticsRange?: string;
  analyticsFrom?: string;
  analyticsThrough?: string;
  city: string;
  region: string;
  country: string;
  limit?: number;
  offset?: number;
};

export async function loadGeographicLocationGroupHistory(
  request: GeographicLocationGroupHistoryRequest,
): Promise<PlatformGeographicLocationHistory> {
  if (!request || typeof request !== "object") {
    throw new Error("Invalid Location History request.");
  }

  return getPlatformGeographicLocationGroupHistory(
    {
      analyticsRange: request.analyticsRange,
      analyticsFrom: request.analyticsFrom,
      analyticsThrough: request.analyticsThrough,
    },
    request.city,
    request.region,
    request.country,
    request.limit ?? 50,
    request.offset ?? 0,
  );
}
