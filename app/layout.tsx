import type { Metadata } from "next";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import "./globals.css";
import "./customer-portal-onboarding.css";
import { AppShell } from "@/components/layout/app-shell";
import { getAccessContext } from "@/lib/auth/context";
import { getApplicationVersionLabel } from "@/lib/app-version";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:{default:"DM3Oi — Operational Intelligence",template:"%s | DM3Oi™"},description:"Operational Intelligence for service businesses."};
export default async function RootLayout({children}:{children:React.ReactNode}){
  const access=await getAccessContext();

  return <html lang="en"><body><AnalyticsTracker /><AppShell access={access} applicationVersionLabel={getApplicationVersionLabel()} unreadNotificationCount={0} newTrialRequestCount={0}>{children}</AppShell></body></html>;
}
