import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { hasTenantInternalAccess } from "@/lib/auth/access-routing";
import { createClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/format-phone";
import Link from "next/link";
import { manageCustomerPortalAccessAction } from "@/lib/data/customer-portal-provisioning-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";

export default async function Page({ params, searchParams }: { params: Promise<{ customerId: string }>; searchParams: Promise<{ message?: string; error?: string }> }) {
  const [{ customerId }, query, access] = await Promise.all([params, searchParams, getAccessContext()]);
  if (!access || !hasTenantInternalAccess(access) || !access.activeOrganization) notFound();
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("*").eq("id", customerId).eq("organization_id", access.activeOrganization.id).maybeSingle();
  if (!customer) notFound();
  const [{ data: creator }, { data: cases }, { data: portalLinks }] = await Promise.all([
    customer.created_by_user_id ? supabase.from("profiles").select("*").eq("id", customer.created_by_user_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("cases").select("id,status").eq("organization_id", access.activeOrganization.id).eq("customer_id", customer.id),
    supabase.from("customer_portal_users").select("id,user_id,is_active").eq("organization_id", access.activeOrganization.id).eq("customer_id", customer.id).order("is_active", { ascending: false }),
  ]);
  const openCases = (cases ?? []).filter((item) => !["COMPLETED", "CLOSED", "CANCELLED"].includes(item.status)).length;
  const portal = portalLinks?.[0];
  const portalProfile = portal?.user_id ? (await supabase.from("profiles").select("email").eq("id", portal.user_id).maybeSingle()).data : null;
  let linkedAuthEmail = portalProfile?.email ?? null;
  if (portal?.user_id) { try { linkedAuthEmail = (await createAdminClient().auth.admin.getUserById(portal.user_id)).data.user?.email ?? linkedAuthEmail; } catch { /* fallback to profile/customer email */ } }
  const { data: settings } = await createAdminClient().from("organization_settings").select("timezone").eq("organization_id", access.activeOrganization.id).maybeSingle();
  return <><PageHeader eyebrow="Relationships" title={customer.name} description="Customer record and creation history." action={<Link className="primary-button" href={`/customers/${customer.id}/edit`}>Edit Customer</Link>}/>{query.message?<div className="success-alert page-notice">{query.message}</div>:null}{query.error?<div className="form-alert page-notice" role="alert">{query.error}</div>:null}<section className="panel detail-section"><div className="section-head"><div><h2>{customer.customer_number}</h2><p>{customer.type}</p></div><Badge value={customer.status}/></div><dl className="detail-facts"><div><dt>Name</dt><dd>{customer.name}</dd></div><div><dt>Email</dt><dd>{customer.email ?? "—"}</dd></div><div><dt>Phone</dt><dd>{formatPhone(customer.phone)}</dd></div>{customer.notes ? <div><dt>Notes</dt><dd>{customer.notes}</dd></div> : null}<div><dt>Open cases</dt><dd>{openCases}</dd></div><div><dt>Last activity</dt><dd>{formatOrganizationDateTime(customer.updated_at, settings?.timezone)}</dd></div><div><dt>Created by</dt><dd>{creator?.display_name || creator?.email || "Unknown user"}</dd></div><div><dt>Created</dt><dd>{formatOrganizationDateTime(customer.created_at, settings?.timezone)}</dd></div></dl></section><section className="panel detail-section portal-access-card"><div className="section-head"><div><h2>Portal Access</h2><p>Customer-facing service request access</p></div><Badge value={portal ? (portal.is_active ? "ACTIVE" : "INACTIVE") : "NOT ENABLED"}/></div>{portal ? <><p className="muted">{linkedAuthEmail ?? customer.email ?? "No email available"}</p><form action={manageCustomerPortalAccessAction}><input type="hidden" name="customerId" value={customer.id}/><input type="hidden" name="portalAccessId" value={portal.id}/><input type="hidden" name="intent" value={portal.is_active ? "disable" : "enable"}/><button className="primary-button">{portal.is_active ? "Disable Portal Access" : "Enable / Reactivate Portal Access"}</button></form>{portal.is_active && linkedAuthEmail ? <form action={manageCustomerPortalAccessAction}><input type="hidden" name="customerId" value={customer.id}/><input type="hidden" name="intent" value="resend"/><button className="text-button">Resend invitation</button></form> : null}</> : <form action={manageCustomerPortalAccessAction}><input type="hidden" name="customerId" value={customer.id}/><input type="hidden" name="intent" value="enable"/><button className="primary-button" disabled={!customer.email}>Enable Portal Access</button>{!customer.email ? <small className="field-error">Add a valid customer email first.</small> : null}</form>}</section><Link className="auth-link" href="/customers">← All customers</Link></>;
}
