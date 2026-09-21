import Link from "next/link";
import { ApplicationIcon } from "@/components/application-icon";
import type { ApplicationIconName } from "@/lib/application-icons";
import type { PlatformSummary } from "@/lib/data/platform-repository";

export function PlatformDashboard({summary}:{summary:PlatformSummary}){
  const metrics:{label:string;value:number;icon:ApplicationIconName;tone:string}[]=[
    {label:"Organizations",value:summary.organizations,icon:"organization",tone:"blue"},
    {label:"Active Organizations",value:summary.activeOrganizations,icon:"organization-active",tone:"green"},
    {label:"Inactive Organizations",value:summary.inactiveOrganizations,icon:"blocked",tone:"slate"},
    {label:"Platform Administrators",value:summary.platformAdministrators,icon:"platform",tone:"violet"},
    {label:"Organization Users",value:summary.organizationUsers,icon:"user-active",tone:"cyan"},
    {label:"Pending Provisioning",value:summary.pendingProvisioning,icon:"user-pending",tone:"amber"},
  ];
  return <><div className="platform-role"><ApplicationIcon name="platform"/><span>SUPER ADMIN</span></div><div className="metric-grid platform-metrics">{metrics.map(({label,value,icon,tone})=><article className={`metric tone-${tone}`} key={label}><div><span>{label}</span><strong>{value}</strong></div><span className="metric-icon"><ApplicationIcon name={icon}/></span><small>Live platform data</small></article>)}</div>{summary.organizations===0?<section className="panel empty platform-empty"><span className="empty-icon"><ApplicationIcon name="organization"/></span><h2>No organizations yet</h2><p>Create the first business organization to begin organization-level case management.</p><Link className="primary-button" href="/admin/organizations/new"><ApplicationIcon name="add"/>Create Organization</Link></section>:<section className="panel platform-ready"><div className="section-head"><div><h2>Organization workspaces</h2><p>Manage business organizations and enter active operational workspaces.</p></div><Link href="/admin/organizations">View organizations <ApplicationIcon name="forward"/></Link></div></section>}</>;
}
