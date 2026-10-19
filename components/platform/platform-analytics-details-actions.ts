"use server";

import {
  getPlatformPageViewHistory,
  type PlatformPageViewHistory,
} from "@/lib/data/platform-analytics-repository";

export type PlatformPageViewHistoryRequest = {
  analyticsRange: string;
  analyticsFrom: string;
  analyticsThrough: string;
  search: string;
  limit: number;
  offset: number;
};

export async function loadPlatformPageViewHistory(
  request: PlatformPageViewHistoryRequest,
): Promise<PlatformPageViewHistory> {
  return getPlatformPageViewHistory(
    {
      analyticsRange: request.analyticsRange,
      analyticsFrom: request.analyticsFrom,
      analyticsThrough: request.analyticsThrough,
    },
    request.search,
    request.limit,
    request.offset,
  );
}
