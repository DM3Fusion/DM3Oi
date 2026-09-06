import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { canAccessOrganizationAdministration, hasTenantInternalAccess } from "@/lib/auth/access-routing";

const cards = [
  { title: "Users", description: "Manage organization members and access.", href: "/users" },
  { title: "Questions & Rules", description: "Configure operational questions and requirements.", href: "/questions" },
  { title: "Case Types", description: "Define the kinds of cases this organization manages.", href: "/administration/case-types" },
  { title: "Case Lifecycle", description: "Configure case status and workflow behavior.", href: "/administration/case-lifecycle" },
  { title: "Customer Portal", description: "Configure customer-facing portal behavior.", href: "/administration/customer-portal" },
  { title: "Organization Defaults", description: "Configure organization-wide operational defaults.", href: "/administration/defaults" },
  { title: "Settings", description: "Manage workspace preferences and application defaults.", href: "/settings" },
] as const;

export default async function Page() {
  const access = await getAccessContext();
  const canAdminister = Boolean(
    access &&
      hasTenantInternalAccess(access) &&
      canAccessOrganizationAdministration(access),
  );
  if (!canAdminister) notFound();

  return <><PageHeader eyebrow="Administration" title="Administration" description="Manage organization-level operational configuration and administrative tools."/><div className="admin-card-grid">{cards.map(({title,description,href})=><Link href={href} className="panel admin-config-card" key={href}><h2>{title}</h2><p>{description}</p><span className="admin-card-action">Manage →</span></Link>)}</div></>;
}
