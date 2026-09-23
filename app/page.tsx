import { Dashboard } from "@/components/dashboard/dashboard";
import { PlatformDashboard } from "@/components/platform/platform-dashboard";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { resolveRootExperience } from "@/lib/auth/access-routing";
import { getLiveOrganizationData } from "@/lib/data/case-repository";
import { getPlatformSummary } from "@/lib/data/platform-repository";
import { getPlatformAnalytics } from "@/lib/data/platform-analytics-repository";
import { getUnreadNotificationCount } from "@/lib/data/communications-repository";
import { getOperationalIntelligence } from "@/lib/data/operational-intelligence-repository";
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

    const [summary, analytics] =
      await Promise.all([
        getPlatformSummary(),
        getPlatformAnalytics(query),
      ]);

    return (
      <>
        <PageHeader
          eyebrow="Platform Administration"
          title="Back Office"
        />
        <PlatformDashboard
          analytics={analytics}
          summary={summary}
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

  const [data, unreadCommunications] =
    await Promise.all([
      getLiveOrganizationData(),
      getUnreadNotificationCount({
        organizationId:
          access.activeOrganization!.id,
        userId: access.user.id,
      }),
    ]);

  const intelligence =
    await getOperationalIntelligence(data);

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
        unreadCommunications={
          unreadCommunications
        }
      />
    </>
  );
}
