import { getCustomerPortalContext } from "@/lib/auth/customer-portal";
import { selectPortalAccountAction } from "@/lib/data/customer-portal-actions";
import { createClient } from "@/lib/supabase/server";
import { resolveOrganizationDisplayName } from "@/lib/data/organization-display-name";
export default async function SelectAccountPage() { const context = await getCustomerPortalContext(); if (!context?.links?.length) return null; const supabase = await createClient(); const [{ data: customers }, { data: organizations }] = await Promise.all([supabase.from("organization_customers").select("id,name,customer_number").in("id", context.links.map((link) => link.customer_id)), supabase.from("organizations").select("id,name").in("id", context.links.map((link) => link.organization_id))]); const customerMap = new Map((customers ?? []).map((customer) => [customer.id, customer])); const organizationDisplayNames = new Map(
  await Promise.all(
    (organizations ?? []).map(async (organization) => [
      organization.id,
      await resolveOrganizationDisplayName(
        organization.id,
        organization.name,
      ),
    ] as const),
  ),
); return <section className="portal-panel"><h1>Select an account</h1><p>Choose the customer account you want to manage.</p><div className="portal-account-list">{context.links.map((link) => <form key={link.id} action={selectPortalAccountAction}><input type="hidden" name="portalAccessId" value={link.id}/><button type="submit"><strong>{customerMap.get(link.customer_id)?.name ?? "Customer account"}</strong><span>{organizationDisplayNames.get(link.organization_id) ?? "Organization"}{customerMap.get(link.customer_id)?.customer_number ? ` · ${customerMap.get(link.customer_id)?.customer_number}` : ""}</span></button></form>)}</div></section>; }
