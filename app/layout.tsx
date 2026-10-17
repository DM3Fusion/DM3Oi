import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./customer-portal-onboarding.css";
import { AppShell } from "@/components/layout/app-shell";
import {
  NewTrialRequestsNavigationBadge,
  PlatformInboxNavigationBadge,
  UnreadCommunicationsNavigationBadge,
} from "@/components/layout/navigation-attention-badges";
import { getAccessContext } from "@/lib/auth/context";
import { getApplicationVersionLabel } from "@/lib/app-version";
export const dynamic="force-dynamic";
export const metadata: Metadata = {
  metadataBase: new URL("https://dm3oi.com"),
  title: {
    default: "DM3Oi — Operational Intelligence",
    template: "%s | DM3Oi™",
  },
  description:
    "Business Operations Intelligence for organizations managing customers, cases, tasks, service requests, communications, workflows, and operational performance.",
  openGraph: {
    type: "website",
    url: "https://dm3oi.com",
    siteName: "DM3Oi",
    title: "DM3Oi — Operational Intelligence",
    description:
      "Business Operations Intelligence for customers, cases, tasks, service requests, communications, and workflows.",
    images: [
      {
        url: "/brand/DM3Oi_landing_page_top_left.webp",
        width: 602,
        height: 198,
        alt: "DM3Oi Business Operations Intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DM3Oi — Operational Intelligence",
    description:
      "Business Operations Intelligence for organizations.",
    images: ["/brand/DM3Oi_landing_page_top_left.webp"],
  },
};
export default async function RootLayout({children}:{children:React.ReactNode}){
  const [access, requestHeaders]=await Promise.all([getAccessContext(), headers()]);
  const requestPathname=requestHeaders.get("x-dm3oi-route-pathname");
  const staticGuideRequest=requestPathname==="/how-to-guide"||requestPathname==="/staff-how-to-guide";
  const unreadAttention =
    !staticGuideRequest && access?.internalAccess && access.activeOrganization
      ? {
          organizationId: access.activeOrganization.id,
          userId: access.user.id,
        }
      : null;
  const trialRequestAttention = Boolean(access?.isSuperAdmin);

  return <html lang="en"><body><AnalyticsTracker /><AppShell
    access={access}
    applicationVersionLabel={getApplicationVersionLabel()}
    communicationsDesktopBadge={unreadAttention ? (
      <Suspense fallback={null}>
        <UnreadCommunicationsNavigationBadge {...unreadAttention} />
      </Suspense>
    ) : null}
    communicationsMobileBadge={unreadAttention ? (
      <Suspense fallback={null}>
        <UnreadCommunicationsNavigationBadge {...unreadAttention} mobile />
      </Suspense>
    ) : null}
    trialRequestsDesktopBadge={trialRequestAttention ? (
      <Suspense fallback={null}>
        <NewTrialRequestsNavigationBadge />
      </Suspense>
    ) : null}
    trialRequestsMobileBadge={trialRequestAttention ? (
      <Suspense fallback={null}>
        <NewTrialRequestsNavigationBadge mobile />
      </Suspense>
    ) : null}
    platformInboxDesktopBadge={trialRequestAttention ? (
      <Suspense fallback={null}>
        <PlatformInboxNavigationBadge />
      </Suspense>
    ) : null}
    platformInboxMobileBadge={trialRequestAttention ? (
      <Suspense fallback={null}>
        <PlatformInboxNavigationBadge mobile />
      </Suspense>
    ) : null}
  >{children}</AppShell></body></html>;
}
