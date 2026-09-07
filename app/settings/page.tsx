import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyFoundation, PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
const configurationCards = [
  {
    title: "User Access",
    description: "Control what organization roles can access and manage.",
    href: "/settings/user-access",
    permission: "MANAGE_ROLE_PERMISSIONS",
  },
  {
    title: "Case Types",
    description: "Define the kinds of cases this organization manages.",
    href: "/administration/case-types",
    permission: "VIEW_ADMINISTRATION",
  },
  {
    title: "Case Lifecycle",
    description: "Configure case status and workflow behavior.",
    href: "/administration/case-lifecycle",
    permission: "VIEW_ADMINISTRATION",
  },
  {
    title: "Customer Portal",
    description: "Configure customer-facing portal behavior.",
    href: "/administration/customer-portal",
    permission: "VIEW_ADMINISTRATION",
  },
  {
    title: "Organization Defaults",
    description: "Configure organization-wide operational defaults.",
    href: "/administration/defaults",
    permission: "VIEW_ADMINISTRATION",
  },
] as const;
export default async function Page() {
  const access = await getAccessContext();
  if (!hasPermission(access, "VIEW_SETTINGS")) notFound();
  const cards = configurationCards.filter((card) =>
    hasPermission(access, card.permission),
  );
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage workspace preferences and application defaults."
      />
      {cards.length ? (
        <div className="admin-card-grid">
          {cards.map(({ title, description, href }) => (
            <Link href={href} className="panel admin-config-card" key={href}>
              <h2>{title}</h2>
              <p>{description}</p>
              <span className="admin-card-action">Manage →</span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyFoundation
          icon="⚙"
          title="Settings foundation is ready"
          description="Notifications, preferences, branding, and integration settings will be added here."
        />
      )}
    </>
  );
}
