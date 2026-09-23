import type { Metadata } from "next";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { getAccessContext } from "@/lib/auth/context";
import { getApplicationVersionLabel } from "@/lib/app-version";
import { getUnreadNotificationCount } from "@/lib/data/communications-repository";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:{default:"DM3Oi — Operational Intelligence",template:"%s | DM3Oi™"},description:"Operational Intelligence for service businesses."};
export default async function RootLayout({children}:{children:React.ReactNode}){const access=await getAccessContext();const unreadNotificationCount=access?.activeOrganization&&access.internalAccess?await getUnreadNotificationCount({organizationId:access.activeOrganization.id,userId:access.user.id}):0;return <html lang="en"><body><AnalyticsTracker /><AppShell access={access} applicationVersionLabel={getApplicationVersionLabel()} unreadNotificationCount={unreadNotificationCount}>{children}</AppShell></body></html>}
