import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplicationIcon } from "@/components/application-icon";
import { PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";

const configurationCards = [
  {
    title: "Case Types",
    description: "Define the kinds of cases this organization manages.",
    href: "/administration/case-types",
  },
  {
    title: "Case Lifecycle",
    description: "Configure case status presentation and workflow behavior.",
    href: "/administration/case-lifecycle",
  },
] as const;

export default async function Page() {
  const access = await getAccessContext();

  if (
    !access?.activeOrganization ||
    !hasPermission(access, "VIEW_SETTINGS") ||
    !hasPermission(access, "VIEW_ADMINISTRATION")
  ) {
    notFound();
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Case Configuration"
        description="Configure organization-wide case structure and workflow."
      />

      <div className="admin-card-grid">
        {configurationCards.map(({ title, description, href }) => (
          <Link
            href={href}
            className="panel admin-config-card"
            key={href}
          >
            <h2>{title}</h2>
            <p>{description}</p>
            <span className="admin-card-action">
              Manage <ApplicationIcon name="forward" />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
