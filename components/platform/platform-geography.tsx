"use client";

import { useState } from "react";
import { GeographicDeviceMap } from "@/components/platform/geographic-device-map";
import { GeographicLocationHistoryModal } from "@/components/platform/geographic-location-history-modal";
import type {
  PlatformGeographicDeviceActivity,
  PlatformGeographicDevicePoint,
} from "@/lib/data/platform-analytics-repository";
import {
  GEOGRAPHIC_ALL_LOCATIONS,
  GEOGRAPHIC_DEFAULT_RADIUS,
  GEOGRAPHIC_RADIUS_OPTIONS,
  geographicPointsForRadius,
  summarizeGeographicPoints,
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

  const selectedPoints = geographicPointsForRadius(
    activity.points,
    radius,
  );
  const selectedSummary = summarizeGeographicPoints(selectedPoints);
  const allLocations = radius === GEOGRAPHIC_ALL_LOCATIONS;

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
              onChange={(event) => {
                const value = event.target.value;
                setRadius(
                  value === GEOGRAPHIC_ALL_LOCATIONS
                    ? GEOGRAPHIC_ALL_LOCATIONS
                    : Number(value) as GeographicRadius,
                );
              }}
              value={radius}
            >
              {GEOGRAPHIC_RADIUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === GEOGRAPHIC_ALL_LOCATIONS
                    ? "All Locations"
                    : `${option} miles`}
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
              <span>
                {allLocations
                  ? "Views across all locations"
                  : "Views inside radius"}
              </span>
              <strong>
                {selectedSummary.pageViews.toLocaleString("en-US")}
              </strong>
              <small>
                {selectedPoints.length.toLocaleString("en-US")} mapped locations
              </small>
            </div>

            <div>
              <span>Desktop</span>
              <strong>
                {selectedSummary.desktop.toLocaleString("en-US")}
              </strong>
            </div>

            <div>
              <span>Mobile</span>
              <strong>
                {selectedSummary.mobile.toLocaleString("en-US")}
              </strong>
            </div>

            <div>
              <span>Tablet</span>
              <strong>
                {selectedSummary.tablet.toLocaleString("en-US")}
              </strong>
            </div>

            <div>
              <span>Other / Unknown</span>
              <strong>
                {selectedSummary.other.toLocaleString("en-US")}
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
