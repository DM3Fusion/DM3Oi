"use client";

import { useState } from "react";
import { GeographicDeviceMap } from "@/components/platform/geographic-device-map";
import { GeographicLocationHistoryModal } from "@/components/platform/geographic-location-history-modal";
import type {
  PlatformGeographicDeviceActivity,
  PlatformGeographicDevicePoint,
} from "@/lib/data/platform-analytics-repository";

type Props = {
  activity: PlatformGeographicDeviceActivity;
  analyticsRange: string;
  analyticsFrom: string;
  analyticsThrough: string;
};

export function PlatformGeography({
  activity,
  analyticsRange,
  analyticsFrom,
  analyticsThrough,
}: Props) {
  const [selectedLocation, setSelectedLocation] =
    useState<PlatformGeographicDevicePoint | null>(null);

  return (
    <article className="admin-analytics-panel platform-geography-panel">
      <div className="admin-analytics-panel-heading">
        <div>
          <h3>Geography</h3>
          <p className="muted">
            Geographic distribution of page views by approximate
            network location and device type.
          </p>
        </div>
      </div>

      {!activity.available ? (
        <p className="muted platform-geography-unavailable" role="status">
          Geographic device activity will become available
          after its database migration is deployed.
        </p>
      ) : (
        <>
          <div className="platform-geography-metrics">
            <div>
              <span>Total Page Views</span>
              <strong>
                {activity.totalPageViews.toLocaleString("en-US")}
              </strong>
            </div>

            <div>
              <span>Mapped Page Views</span>
              <strong>
                {activity.geolocatedPageViews.toLocaleString("en-US")}
              </strong>
            </div>

            <div>
              <span>Without Coordinates</span>
              <strong>
                {activity.unknownCoordinatePageViews.toLocaleString("en-US")}
              </strong>
            </div>

            <div>
              <span>Mapped Locations</span>
              <strong>
                {activity.points.length.toLocaleString("en-US")}
              </strong>
            </div>
          </div>

          <GeographicDeviceMap
            points={activity.points}
            onSelectLocation={setSelectedLocation}
          />

          {selectedLocation ? (
            <GeographicLocationHistoryModal
              point={selectedLocation}
              points={activity.points}
              onSelectLocation={setSelectedLocation}
              onClose={() => setSelectedLocation(null)}
              analyticsRange={analyticsRange}
              analyticsFrom={analyticsFrom}
              analyticsThrough={analyticsThrough}
            />
          ) : null}
        </>
      )}
    </article>
  );
}
