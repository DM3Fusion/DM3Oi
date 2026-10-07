import { Suspense } from "react";
import {
  DashboardCasesAttentionServerSection,
  DashboardIntelligenceServerSection,
  DashboardServerSection,
} from "@/components/dashboard/dashboard-server-sections";
import {
  DashboardBodySkeleton,
  ReportSectionSkeleton,
} from "@/components/loading/route-skeletons";
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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    analyticsRange?: string;
    analyticsFrom?: string;
    analyticsThrough?: string;
  }>;
}) {
  const access = await getAccessContext();

  if (!access) {
    const landingPageContent =
      await getPublishedLandingPageContent();

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
        getPlatformAdministration(),
        getPlatformAnalytics(query),
        getOverviewDownloadCount(),
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

  const dataPromise = getLiveOrganizationData();
  const unreadPromise = getUnreadNotificationCount({
    organizationId: access.activeOrganization!.id,
    userId: access.user.id,
  });
  const goalSummaryPromise = getGoalDashboardSummary();
  const intelligencePromise = dataPromise.then((data) =>
    getOperationalIntelligence(data),
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
      <Suspense fallback={<DashboardBodySkeleton />}>
        <DashboardServerSection
          dataPromise={dataPromise}
          unreadPromise={unreadPromise}
          casesAttention={
            <Suspense
              fallback={
                <ReportSectionSkeleton
                  label="Loading Cases needing attention"
                  compact
                />
              }
            >
              <DashboardCasesAttentionServerSection
                intelligencePromise={intelligencePromise}
              />
            </Suspense>
          }
          operationalIntelligence={
            <Suspense
              fallback={
                <ReportSectionSkeleton
                  label="Loading operational intelligence"
                />
              }
            >
              <DashboardIntelligenceServerSection
                intelligencePromise={intelligencePromise}
                goalSummaryPromise={goalSummaryPromise}
              />
            </Suspense>
          }
        />
      </Suspense>
    </>
  );
}
