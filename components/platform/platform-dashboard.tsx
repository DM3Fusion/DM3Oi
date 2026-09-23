import Link from "next/link";

import { AdminGeography } from "@/components/admin-geography";
import { AdminTopPages } from "@/components/admin-top-pages";
import { AnalyticsDonut } from "@/components/analytics-donut";
import { ApplicationIcon } from "@/components/application-icon";
import type { ApplicationIconName } from "@/lib/application-icons";
import type { PlatformAnalytics } from "@/lib/data/platform-analytics-repository";
import type { PlatformSummary } from "@/lib/data/platform-repository";

const analyticsRanges = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "90d", label: "90 Days" },
  { key: "custom", label: "Custom" },
] as const;

export function PlatformDashboard({
  summary,
  analytics,
}: {
  summary: PlatformSummary;
  analytics: PlatformAnalytics;
}) {
  const metrics: {
    label: string;
    value: number;
    icon: ApplicationIconName;
    tone: string;
  }[] = [
    {
      label: "Organizations",
      value: summary.organizations,
      icon: "organization",
      tone: "blue",
    },
    {
      label: "Active Organizations",
      value: summary.activeOrganizations,
      icon: "organization-active",
      tone: "green",
    },
    {
      label: "Inactive Organizations",
      value: summary.inactiveOrganizations,
      icon: "blocked",
      tone: "slate",
    },
    {
      label: "Platform Administrators",
      value: summary.platformAdministrators,
      icon: "platform",
      tone: "violet",
    },
    {
      label: "Organization Users",
      value: summary.organizationUsers,
      icon: "user-active",
      tone: "cyan",
    },
    {
      label: "Pending Provisioning",
      value: summary.pendingProvisioning,
      icon: "user-pending",
      tone: "amber",
    },
  ];

  return (
    <>
      <div className="platform-role">
        <ApplicationIcon name="platform" />
        <span>SUPER ADMIN</span>
      </div>

      <div className="metric-grid platform-metrics">
        {metrics.map(
          ({ label, value, icon, tone }) => (
            <article
              className={`metric tone-${tone}`}
              key={label}
            >
              <div>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>

              <span className="metric-icon">
                <ApplicationIcon name={icon} />
              </span>
            </article>
          ),
        )}
      </div>

      <section className="admin-analytics">
        <div className="admin-analytics-heading">
          <div>
            <span className="eyebrow">
              Platform Intelligence
            </span>
            <h2>Platform Analytics</h2>
            <p className="muted">
              First-party DM3Oi activity.
              Reporting periods use UTC.
            </p>
          </div>

          <div className="admin-analytics-range-wrap">
            <nav
              aria-label="Analytics reporting period"
              className="admin-analytics-range"
            >
              {analyticsRanges.map(
                ({ key, label }) => (
                  <Link
                    className={
                      analytics.range === key
                        ? "active"
                        : undefined
                    }
                    href={
                      key === "custom"
                        ? `/?analyticsRange=custom&analyticsFrom=${analytics.from}&analyticsThrough=${analytics.through}`
                        : `/?analyticsRange=${key}`
                    }
                    key={key}
                  >
                    {label}
                  </Link>
                ),
              )}
            </nav>

            {analytics.range === "custom" ? (
              <form
                action="/"
                className="admin-analytics-custom-range"
                method="get"
              >
                <input
                  name="analyticsRange"
                  type="hidden"
                  value="custom"
                />

                <label>
                  <span>From</span>
                  <input
                    defaultValue={analytics.from}
                    name="analyticsFrom"
                    required
                    type="date"
                  />
                </label>

                <label>
                  <span>Through</span>
                  <input
                    defaultValue={analytics.through}
                    name="analyticsThrough"
                    required
                    type="date"
                  />
                </label>

                <button
                  className="secondary-button"
                  type="submit"
                >
                  Apply
                </button>
              </form>
            ) : null}

            {analytics.customRangeError ? (
              <p
                className="admin-analytics-range-error"
                role="alert"
              >
                {analytics.customRangeError}
              </p>
            ) : null}
          </div>
        </div>

        <div className="admin-analytics-kpis">
          <article className="management-kpi">
            <span>Page Views</span>
            <strong>{analytics.pageViews}</strong>
          </article>

          <article className="management-kpi">
            <span>Sessions</span>
            <strong>{analytics.sessions}</strong>
          </article>

          <article className="management-kpi">
            <span>Users</span>
            <strong>{analytics.users}</strong>
          </article>

          <article className="management-kpi">
            <span>Organizations</span>
            <strong>
              {analytics.organizations}
            </strong>
          </article>
        </div>

        <article className="admin-live-activity">
          <div>
            <span className="eyebrow">
              Live Activity
            </span>
            <strong>
              {analytics.activeUsers} Active{" "}
              {analytics.activeUsers === 1
                ? "User"
                : "Users"}{" "}
              · {analytics.activeSessions} Active{" "}
              {analytics.activeSessions === 1
                ? "Session"
                : "Sessions"}
            </strong>
          </div>

          <p>
            Live authenticated sessions.
            Inactive sessions expire after 5 minutes.
          </p>
        </article>

        <div className="admin-analytics-grid">
          <article className="admin-analytics-panel admin-analytics-traffic">
            <div className="admin-analytics-panel-heading">
              <div>
                <h3>Traffic</h3>
                <p className="muted">
                  Page views by UTC day.
                </p>
              </div>
            </div>

            <div className="admin-analytics-bars">
              {analytics.trafficDays.map(
                (day) => (
                  <div
                    className="admin-analytics-bar-column"
                    key={day.key}
                  >
                    <div className="admin-analytics-bar-plot">
                      <strong>
                        {day.value}
                      </strong>
                      <i
                        style={{
                          height: `${Math.max(
                            day.value > 0
                              ? 4
                              : 0,
                            (day.value /
                              analytics.maxTrafficCount) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                    <span>{day.label}</span>
                  </div>
                ),
              )}
            </div>
          </article>

          <article className="admin-analytics-panel admin-analytics-composition">
            <div className="admin-analytics-panel-heading">
              <div>
                <h3>Technology Mix</h3>
                <p className="muted">
                  Devices, browsers, operating
                  systems, and traffic classification.
                </p>
              </div>
            </div>

            <AnalyticsDonut
              data={analytics.deviceBreakdown}
              title="Device"
            />

            <AnalyticsDonut
              data={analytics.browserBreakdown}
              title="Browser"
            />

            <AnalyticsDonut
              data={
                analytics.operatingSystemBreakdown
              }
              title="Operating System"
            />

            <AnalyticsDonut
              data={
                analytics.trafficTypeBreakdown
              }
              title="Traffic Type"
            />
          </article>

          <AdminTopPages
            pages={analytics.topPages}
          />

          <AdminGeography
            rows={analytics.geography}
          />
        </div>
      </section>

      {summary.organizations === 0 ? (
        <section className="panel empty platform-empty">
          <span className="empty-icon">
            <ApplicationIcon name="organization" />
          </span>
          <h2>No organizations yet</h2>
          <p>
            Create the first business organization
            to begin organization-level case
            management.
          </p>
          <Link
            className="primary-button"
            href="/admin/organizations/new"
          >
            <ApplicationIcon name="add" />
            Create Organization
          </Link>
        </section>
      ) : (
        <section className="panel platform-ready">
          <div className="section-head">
            <h2>Organization workspaces</h2>
            <Link href="/admin/organizations">
              View organizations{" "}
              <ApplicationIcon name="forward" />
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
