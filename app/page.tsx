import { Dashboard } from "@/components/dashboard/dashboard";
import { PlatformDashboard } from "@/components/platform/platform-dashboard";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { resolveRootExperience } from "@/lib/auth/access-routing";
import { getLiveOrganizationData } from "@/lib/data/case-repository";
import { getPlatformAdministration } from "@/lib/data/platform-repository";
import {
  getOverviewDownloadCount,
  getPlatformAnalytics,
} from "@/lib/data/platform-analytics-repository";
import { getUnreadNotificationCount } from "@/lib/data/communications-repository";
import { getOperationalIntelligence } from "@/lib/data/operational-intelligence-repository";
import { getGoalDashboardSummary } from "@/lib/data/goals-repository";
import { ApplicationIcon } from "@/components/application-icon";
import { PublicLandingPage } from "@/components/public-landing-page";
import { getPublishedLandingPageContent } from "@/lib/public-landing-page-server";
import { measureServerPerformance } from "@/lib/server-performance";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    analyticsRange?: string;
    analyticsFrom?: string;
    analyticsThrough?: string;
  }>;
}) {
  return measureServerPerformance("/", "page.total", async () => {
  const access = await measureServerPerformance(
    "/",
    "page.getAccessContext",
    () => getAccessContext(),
  );

  if (!access) {
    const landingPageContent =
      await measureServerPerformance(
        "/",
        "page.getPublishedLandingPageContent",
        () => getPublishedLandingPageContent(),
      );

    return (
      <PublicLandingPage
        content={landingPageContent}
      />
    );
  }

  const experience = resolveRootExperience({
    ...access,
    hasActiveOrganization: Boolean(
      access.activeOrganization,
    ),
  });

  if (experience === "PLATFORM") {
    const query = await searchParams;

    const [administration, analytics, overviewDownloadCount] =
      await Promise.all([
        measureServerPerformance(
          "/",
          "page.getPlatformAdministration",
          () => getPlatformAdministration(),
        ),
        measureServerPerformance(
          "/",
          "page.getPlatformAnalytics",
          () => getPlatformAnalytics(query),
        ),
        measureServerPerformance(
          "/",
          "page.getOverviewDownloadCount",
          () => getOverviewDownloadCount(),
        ),
      ]);

    return (
      <>
        <PageHeader
          eyebrow="Platform Administration"
          title="Platform Console"
        />
        <PlatformDashboard
          analytics={analytics}
          organizations={administration.organizations}
          overviewDownloadCount={overviewDownloadCount}
          summary={administration.summary}
        />
      </>
    );
  }

  if (experience === "PORTAL") {
    redirect("/portal");
  }

  if (experience === "UNPROVISIONED") {
    redirect("/account/unprovisioned");
  }

  if (
    access.license &&
    !access.license.workspaceAllowed
  ) {
    redirect("/account/license-expired");
  }

  const [
    data,
    unreadCommunications,
    goalSummary,
  ] = await Promise.all([
    measureServerPerformance(
      "/",
      "page.getLiveOrganizationData",
      () => getLiveOrganizationData(),
    ),
    measureServerPerformance(
      "/",
      "page.getUnreadNotificationCount",
      () => getUnreadNotificationCount({
      organizationId:
        access.activeOrganization!.id,
      userId: access.user.id,
      }),
    ),
    measureServerPerformance(
      "/",
      "page.getGoalDashboardSummary",
      () => getGoalDashboardSummary(),
    ),
  ]);

  const intelligence =
    await measureServerPerformance(
      "/",
      "page.getOperationalIntelligence",
      () => getOperationalIntelligence(data),
    );

  return (
    <>
      <PageHeader
        action={
          <Link
            className="primary-button"
            href="/cases/new"
          >
            <ApplicationIcon name="add" />
            New Case
          </Link>
        }
        eyebrow="Dashboard"
        title="Operational Dashboard"
      />
      <Dashboard
        data={data}
        intelligence={intelligence}
        goalSummary={goalSummary}
        unreadCommunications={
          unreadCommunications
        }
      />
    </>
  );
  });
}
