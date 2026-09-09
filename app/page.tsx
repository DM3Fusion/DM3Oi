import { Dashboard } from "@/components/dashboard/dashboard";
import { PlatformDashboard } from "@/components/platform/platform-dashboard";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { resolveRootExperience } from "@/lib/auth/access-routing";
import { getLiveOrganizationData } from "@/lib/data/case-repository";
import { getPlatformSummary } from "@/lib/data/platform-repository";
import { getUnreadNotificationCount } from "@/lib/data/communications-repository";
import { getOperationalIntelligence } from "@/lib/data/operational-intelligence-repository";

export default async function Page(){
  const access=await getAccessContext();
  if(!access)redirect("/account/unprovisioned");
  const experience=resolveRootExperience({...access,hasActiveOrganization:Boolean(access.activeOrganization)});
  if(experience==="PLATFORM"){
    const summary=await getPlatformSummary();
    return <><PageHeader eyebrow="Platform Administration" title="Back Office" description="Manage DM3Oi organizations, users, access, and platform operations."/><PlatformDashboard summary={summary}/></>;
  }
  if(experience==="PORTAL")redirect("/portal");
  if(experience==="UNPROVISIONED")redirect("/account/unprovisioned");
  if(access.license && !access.license.workspaceAllowed) redirect("/account/license-expired");
  const [data,unreadCommunications]=await Promise.all([getLiveOrganizationData(),getUnreadNotificationCount({organizationId:access.activeOrganization!.id,userId:access.user.id})]);
  const intelligence=await getOperationalIntelligence(data);
  return <><PageHeader eyebrow="Dashboard" title="Operational Dashboard" description="Here’s what needs attention today." action={<Link className="primary-button" href="/cases/new">＋ New Case</Link>}/><Dashboard data={data} unreadCommunications={unreadCommunications} intelligence={intelligence}/></>;
}
