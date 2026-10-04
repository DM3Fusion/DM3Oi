import type { Metadata } from "next";
import { headers } from "next/headers";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./customer-portal-onboarding.css";
import { AppShell } from "@/components/layout/app-shell";
import { getAccessContext } from "@/lib/auth/context";
import { getApplicationVersionLabel } from "@/lib/app-version";
import { getUnreadNotificationCount } from "@/lib/data/communications-repository";
import { getNewTrialRequestCount } from "@/lib/data/trial-request-repository";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:{default:"DM3Oi — Operational Intelligence",template:"%s | DM3Oi™"},description:"Business Operations Intelligence for organizations managing customers, cases, tasks, service requests, communications, workflows, and operational performance."};
export default async function RootLayout({children}:{children:React.ReactNode}){
  const [access, requestHeaders]=await Promise.all([getAccessContext(), headers()]);
  const requestPathname=requestHeaders.get("x-dm3oi-route-pathname");
  const staticGuideRequest=requestPathname==="/how-to-guide"||requestPathname==="/staff-how-to-guide";
  const [unreadNotificationCount, newTrialRequestCount] = await Promise.all([
    !staticGuideRequest && access?.internalAccess && access.activeOrganization
      ? getUnreadNotificationCount({
          organizationId: access.activeOrganization.id,
          userId: access.user.id,
        })
      : Promise.resolve(0),
    access?.isSuperAdmin
      ? getNewTrialRequestCount()
      : Promise.resolve(0),
  ]);

  return <html lang="en"><body><AnalyticsTracker /><AppShell access={access} applicationVersionLabel={getApplicationVersionLabel()} unreadNotificationCount={unreadNotificationCount} newTrialRequestCount={newTrialRequestCount}>{children}</AppShell></body></html>;
}
