import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, PageHeader } from "@/components/ui";
import { CustomerEditForm } from "@/components/customer-edit-form";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/format-phone";
import { ApplicationIcon } from "@/components/application-icon";
import { requireOrganizationCustomer } from "@/lib/data/organization-customers";
import { CustomerRouteModal } from "@/components/customers/customer-route-modal";

export async function CustomerEdit({
  customerId,
  presentation,
}: {
  customerId: string;
  presentation: "page" | "modal";
}) {
  const access = await getAccessContext();
  if (!access?.activeOrganization || !hasPermission(access, "EDIT_CUSTOMER")) notFound();
  const supabase = await createClient();
  const { data: customerRow } = await supabase.from("organization_customers").select("*").eq("id", customerId).eq("organization_id", access.activeOrganization.id).maybeSingle();
  const customer = requireOrganizationCustomer(customerRow);
  if (!customer) notFound();
  const content = (
    <>
      <section className="panel detail-section">
        <div className="section-head">
          <div>
            <h2>{customer.customer_number}</h2>
            <p>{customer.type}</p>
          </div>
          <Badge value={customer.status} />
        </div>
        <CustomerEditForm
          customerId={customer.id}
          cancelBehavior={presentation === "modal" ? "back" : "link"}
          initial={{
            name: customer.name,
            firstName: customer.first_name ?? "",
            lastName: customer.last_name ?? "",
            streetAddress: customer.street_address ?? "",
            city: customer.city ?? "",
            state: customer.state ?? "",
            postalCode: customer.postal_code ?? "",
            email: customer.email ?? "",
            phone: formatPhone(customer.phone) === "—" ? "" : formatPhone(customer.phone),
            notes: customer.notes ?? "",
            type: customer.type,
            status: customer.status,
          }}
        />
      </section>
      {presentation === "page" ? (
        <Link className="auth-link" href={`/customers/${customer.id}`}>
          <ApplicationIcon name="back" />Customer detail
        </Link>
      ) : null}
    </>
  );

  if (presentation === "modal") {
    return (
      <CustomerRouteModal title={`Edit ${customer.name}`} customerNumber={customer.customer_number}>
        {content}
      </CustomerRouteModal>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Relationships" title="Edit Customer" />
      {content}
    </>
  );
}
