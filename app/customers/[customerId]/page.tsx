import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { getAccessContext } from "@/lib/auth/context";
import { hasTenantInternalAccess } from "@/lib/auth/access-routing";
import { createClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/format-phone";
import Link from "next/link";
import { manageCustomerPortalAccessAction } from "@/lib/data/customer-portal-provisioning-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCustomerPortalOnboardingStatus } from "@/lib/data/customer-portal-provisioning-service";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";
import { hasPermission } from "@/lib/auth/permissions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { ApplicationIcon } from "@/components/application-icon";
import { CustomerPermanentDelete } from "@/components/customer-permanent-delete";
import { requireOrganizationCustomer } from "@/lib/data/organization-customers";
import { getCustomerMemberSince } from "@/lib/customer-tenure";
import { isIncompleteCompatibilityCaseStatus } from "@/lib/case-lifecycle";

export default async function Page({ params, searchParams }: { params: Promise<{ customerId: string }>; searchParams: Promise<{ message?: string; error?: string }> }) {
  const [{ customerId }, query, access] = await Promise.all([params, searchParams, getAccessContext()]);
  if (!access || !hasTenantInternalAccess(access) || !access.activeOrganization) notFound();
  const supabase = await createClient();
  const { data: customerRow } = await supabase.from("organization_customers").select("*").eq("id", customerId).eq("organization_id", access.activeOrganization.id).maybeSingle();
  const customer = requireOrganizationCustomer(customerRow);
  if (!customer) notFound();
  const [{ data: creator }, { data: cases }, { data: portalLinks }] = await Promise.all([customer.created_by_user_id ? supabase.from("profiles").select("*").eq("id", customer.created_by_user_id).maybeSingle() : Promise.resolve({ data: null }), supabase.from("organization_cases").select("id,status,tax_year").eq("organization_id", access.activeOrganization.id).eq("customer_id", customer.id), supabase.from("customer_portal_users").select("id,user_id,is_active").eq("organization_id", access.activeOrganization.id).eq("customer_id", customer.id).order("is_active", { ascending: false })]);
  const openCases = (cases ?? []).filter((item) => isIncompleteCompatibilityCaseStatus(item.status)).length;
  const memberSince = getCustomerMemberSince(cases ?? []);
  const portal = portalLinks?.[0];
  const portalStatus = await getCustomerPortalOnboardingStatus({ organizationId: access.activeOrganization.id, customerId: customer.id, actorUserId: access.user.id });
  const { data: settings } = await createAdminClient().from("organization_settings").select("timezone").eq("organization_id", access.activeOrganization.id).maybeSingle();
  return (
    <>
      <PageHeader
        eyebrow="Relationships"
        title={customer.name}
        action={
          hasPermission(access, "EDIT_CUSTOMER") ? (
            <Link className="primary-button" href={`/customers/${customer.id}/edit`}>
              Edit Customer
            </Link>
          ) : undefined
        }
      />
      {query.message ? <div className="success-alert page-notice">{query.message}</div> : null}
      {query.error ? (
        <div className="form-alert page-notice" role="alert">
          {query.error}
        </div>
      ) : null}
      <section className="panel detail-section">
        <div className="section-head">
          <div>
            <h2>{customer.customer_number}</h2>
            <p>{customer.type}</p>
          </div>
          <Badge value={customer.status} />
        </div>
        <dl className="detail-facts">
          <div>
            <dt>Name</dt>
            <dd>{customer.name}</dd>
          </div>
          {customer.first_name || customer.last_name ? <div><dt>Structured name</dt><dd>{[customer.first_name, customer.last_name].filter(Boolean).join(" ")}</dd></div> : null}
          <div>
            <dt>Email</dt>
            <dd>{customer.email ?? "—"}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{formatPhone(customer.phone)}</dd>
          </div>
          {customer.street_address || customer.city || customer.state || customer.postal_code ? (
            <div><dt>Address</dt><dd>{[customer.street_address, [customer.city, customer.state].filter(Boolean).join(", "), customer.postal_code].filter(Boolean).join(" · ")}</dd></div>
          ) : null}
          {customer.notes ? (
            <div>
              <dt>Notes</dt>
              <dd>{customer.notes}</dd>
            </div>
          ) : null}
          <div>
            <dt>Open cases</dt>
            <dd>{openCases}</dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{memberSince ?? "—"}</dd>
          </div>
          <div>
            <dt>Last activity</dt>
            <dd>{formatOrganizationDateTime(customer.updated_at, settings?.timezone)}</dd>
          </div>
          <div>
            <dt>Created by</dt>
            <dd>{customer.created_by_display_name || creator?.display_name || creator?.email || "Unknown user"}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatOrganizationDateTime(customer.created_at, settings?.timezone)}</dd>
          </div>
        </dl>
      </section>
      <section className="panel detail-section portal-access-card">
        <div className="section-head">
          <h2>Portal Access</h2>
          <Badge value={portalStatus.state === "INVITATION_SENT" ? "INVITATION SENT" : portalStatus.state === "NOT_CONFIGURED" ? "NOT ENABLED" : portalStatus.state === "UNAVAILABLE" && portal ? "INACTIVE" : portalStatus.state} />
        </div>
        {portal ? (
          <>
            <p className="muted">{portalStatus.recipientEmail ?? customer.email ?? "No email available"}</p>
            {portalStatus.state === "INVITATION_SENT" && portalStatus.lastSentAt ? <p className="muted">Invitation sent {formatOrganizationDateTime(portalStatus.lastSentAt, settings?.timezone)} · activation pending</p> : null}
            {portalStatus.reason ? <p className="muted">{portalStatus.reason}</p> : null}
            <form action={manageCustomerPortalAccessAction}>
              <input type="hidden" name="customerId" value={customer.id} />
              <input type="hidden" name="portalAccessId" value={portal.id} />
              <input type="hidden" name="intent" value={portal.is_active ? "disable" : "enable"} />
              <PendingSubmitButton className="primary-button" pendingLabel="Updating…">{portal.is_active ? "Disable Portal Access" : "Enable / Reactivate Portal Access"}</PendingSubmitButton>
            </form>
            {portal.is_active && portalStatus.recipientEmail ? (
              <form action={manageCustomerPortalAccessAction}>
                <input type="hidden" name="customerId" value={customer.id} />
                <input type="hidden" name="intent" value="resend" />
                <PendingSubmitButton className="text-button" pendingLabel="Resending…">Resend invitation</PendingSubmitButton>
              </form>
            ) : null}
          </>
        ) : (
          <form action={manageCustomerPortalAccessAction}>
            <input type="hidden" name="customerId" value={customer.id} />
            <input type="hidden" name="intent" value="enable" />
            <PendingSubmitButton className="primary-button" pendingLabel="Sending…" disabled={!customer.email}>
              Enable Portal Access
            </PendingSubmitButton>
            {!customer.email ? <small className="field-error">Add a valid customer email first.</small> : null}
          </form>
        )}
      </section>
      {access.isSuperAdmin ? (
        <CustomerPermanentDelete
          customerId={customer.id}
          customerName={customer.name}
          customerNumber={customer.customer_number}
        />
      ) : null}
      <Link className="auth-link" href="/customers">
        <ApplicationIcon name="back" />All customers
      </Link>
    </>
  );
}
