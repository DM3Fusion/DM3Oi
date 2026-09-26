import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyFoundation, PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { ApplicationIcon } from "@/components/application-icon";
const configurationCards = [
  {
    title: "General",
    description: "Configure organization-wide operational defaults.",
    href: "/settings/general",
    permission: "VIEW_ADMINISTRATION",
  },
  {
    title: "Case Configuration",
    description: "Configure the kinds of cases this organization manages.",
    href: "/settings/case-configuration",
    permission: "VIEW_ADMINISTRATION",
  },
  {
    title: "Case Lifecycle",
    description: "Configure case status presentation and workflow behavior.",
    href: "/settings/case-lifecycle",
    permission: "VIEW_ADMINISTRATION",
  },
  {
    title: "Customer Portal",
    description: "Configure customer-facing portal behavior.",
    href: "/settings/customer-portal",
    permission: "VIEW_ADMINISTRATION",
  },
  {
    title: "User Access",
    description: "Control what organization roles can access and manage.",
    href: "/settings/user-access",
    permission: "MANAGE_ROLE_PERMISSIONS",
  },
] as const;
export default async function Page() {
  const access = await getAccessContext();
  if (!hasPermission(access, "VIEW_SETTINGS")) notFound();
  const cards = configurationCards.filter(
    (card) =>
      hasPermission(access, card.permission) &&
      (card.href !== "/settings/general" || access?.isSuperAdmin),
  );
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
      />
      {cards.length ? (
        <div className="admin-card-grid">
          {cards.map(({ title, description, href }) => (
            <Link href={href} className="panel admin-config-card" key={href}>
              <h2>{title}</h2>
              <p>{description}</p>
              <span className="admin-card-action">Manage <ApplicationIcon name="forward" /></span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyFoundation
          icon="settings"
          title="Settings foundation is ready"
          description="Notifications, preferences, branding, and integration settings will be added here."
        />
      )}
    </>
  );
}
