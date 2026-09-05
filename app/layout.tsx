import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { getAccessContext } from "@/lib/auth/context";
import { getApplicationVersion } from "@/lib/app-version";
import { getUnreadNotificationCount } from "@/lib/data/communications-repository";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:{default:"DM3iQ™ — Case Management Intelligence",template:"%s | DM3iQ™"},description:"Case Management Intelligence"};
export default async function RootLayout({children}:{children:React.ReactNode}){const access=await getAccessContext();const unreadNotificationCount=access?.activeOrganization&&access.internalAccess?await getUnreadNotificationCount():0;return <html lang="en"><body><AppShell access={access} applicationVersion={getApplicationVersion()} unreadNotificationCount={unreadNotificationCount}>{children}</AppShell></body></html>}
