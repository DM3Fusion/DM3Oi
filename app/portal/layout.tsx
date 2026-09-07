import { getCustomerPortalContext } from "@/lib/auth/customer-portal";
import { redirect } from "next/navigation";
import PortalNav from "@/components/portal-nav";
import type { Viewport } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORGANIZATION_AVATAR_BUCKET } from "@/lib/profile/avatar";
import { OrganizationAvatar } from "@/components/organization-avatar";

export const viewport: Viewport = { viewportFit: "cover" };

async function PortalHeader({ context, hasMultipleAccounts, enabled = true }: { context: Awaited<ReturnType<typeof getCustomerPortalContext>>; hasMultipleAccounts: boolean; enabled?: boolean }) {
  let organizationAvatarUrl: string | null = null;
  if (context?.organization?.avatar_path) organizationAvatarUrl = (await createAdminClient().storage.from(ORGANIZATION_AVATAR_BUCKET).createSignedUrl(context.organization.avatar_path, 3600)).data?.signedUrl ?? null;
  return <header className="portal-header"><div className="portal-brand">{context?.organization ? <OrganizationAvatar name={context?.organization?.name ?? "Organization"} src={organizationAvatarUrl} size="md" /> : null}<span className="portal-brand-copy"><strong>DM3Oi™</strong><small>Customer Portal</small>{context?.organization?.name && <b className="portal-brand-organization portal-org-context"><span className="portal-org-prefix">for </span><span className="portal-org-name">{context.organization.name}</span></b>}</span></div><PortalNav hasMultipleAccounts={hasMultipleAccounts} enabled={enabled} /></header>;
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const context = await getCustomerPortalContext();
  if (!context?.links?.length || context.reason === "NO_ACTIVE_PORTAL_ACCESS") redirect("/account/unprovisioned");
  if (context.reason === "ACCOUNT_SELECTION_REQUIRED") return <><PortalHeader context={null} hasMultipleAccounts={false} enabled={false} /><main className="portal-main">{children}</main></>;
  if (!context.access) return <><PortalHeader context={context} hasMultipleAccounts={false} enabled={false} /><main className="portal-main"><section className="portal-panel"><h1>{context.reason === "PORTAL_DISABLED" ? "Portal unavailable" : "Portal temporarily unavailable"}</h1><p>This customer portal is currently unavailable for the selected organization.</p></section></main></>;
  return <><PortalHeader context={context} hasMultipleAccounts={context.links.length > 1} /><main className="portal-main">{children}</main></>;
}
