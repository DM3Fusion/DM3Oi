"use client";

import { useState } from "react";
import { GeographicDeviceMap } from "@/components/platform/geographic-device-map";
import { GeographicLocationHistoryModal } from "@/components/platform/geographic-location-history-modal";
import type {
  PlatformGeographicDeviceActivity,
  PlatformGeographicDevicePoint,
} from "@/lib/data/platform-analytics-repository";
import {
  GEOGRAPHIC_DEFAULT_RADIUS,
  GEOGRAPHIC_RADIUS_OPTIONS,
  geographicWithinRadius,
  type GeographicRadius,
} from "@/lib/platform-geographic-map";

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
  const [radius, setRadius] = useState<GeographicRadius>(
    GEOGRAPHIC_DEFAULT_RADIUS,
  );

  const nearbyPoints = activity.points.filter((point) =>
    geographicWithinRadius(
      point.latitude,
      point.longitude,
      radius,
    ),
  );

  const nearbySummary = nearbyPoints.reduce(
    (summary, point) => ({
      pageViews: summary.pageViews + point.pageViews,
      desktop: summary.desktop + point.desktop,
      mobile: summary.mobile + point.mobile,
      tablet: summary.tablet + point.tablet,
      other: summary.other + point.other + point.unknown,
    }),
    { pageViews: 0, desktop: 0, mobile: 0, tablet: 0, other: 0 },
  );

  return (
    <article className="admin-analytics-panel platform-geography-panel">
      <div className="admin-analytics-panel-heading">
        <div>
          <h3>Geographic Device Activity</h3>
          <p className="muted">
            Geographic distribution of page views by approximate
            network location and device type.
          </p>
        </div>

        {activity.available ? (
          <label className="platform-geography-radius-control">
            <span>Radius from ZIP 20613</span>
            <select
              aria-controls="platform-geographic-device-map"
              aria-label="Geographic radius"
              onChange={(event) =>
                setRadius(
                  Number(event.target.value) as GeographicRadius,
                )
              }
              value={radius}
            >
              {GEOGRAPHIC_RADIUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} miles
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {!activity.available ? (
        <p className="muted platform-geography-unavailable" role="status">
          Geographic device activity will become available
          after its database migration is deployed.
        </p>
      ) : (
        <div className="platform-geography-content">
          <div className="platform-geography-metrics">
            <div>
              <span>Views inside radius</span>
              <strong>
                {nearbySummary.pageViews.toLocaleString("en-US")}
              </strong>
              <small>
                {nearbyPoints.length.toLocaleString("en-US")} mapped locations
              </small>
            </div>

            <div>
              <span>Desktop</span>
              <strong>
                {nearbySummary.desktop.toLocaleString("en-US")}
              </strong>
            </div>

            <div>
              <span>Mobile</span>
              <strong>
                {nearbySummary.mobile.toLocaleString("en-US")}
              </strong>
            </div>

            <div>
              <span>Tablet</span>
              <strong>
                {nearbySummary.tablet.toLocaleString("en-US")}
              </strong>
            </div>

            <div>
              <span>Other / Unknown</span>
              <strong>
                {nearbySummary.other.toLocaleString("en-US")}
              </strong>
            </div>

            <div>
              <span>Without Coordinates</span>
              <strong>
                {activity.unknownCoordinatePageViews.toLocaleString("en-US")}
              </strong>
            </div>
          </div>

          <GeographicDeviceMap
            points={activity.points}
            radius={radius}
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
        </div>
      )}
    </article>
  );
}
