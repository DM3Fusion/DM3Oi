import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ServiceRequestForm } from "@/components/service-request-form";
import { getLiveOrganizationData, displayName } from "@/lib/data/case-repository";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission, roleHasPermission } from "@/lib/auth/permissions";
export const metadata = { title: "New Service Request" };
export default async function Page() {
  const [data, access] = await Promise.all([getLiveOrganizationData(), getAccessContext()]);
  if (!hasPermission(access, "CREATE_SERVICE_REQUEST")) notFound();
  const canAssign = hasPermission(access, "ASSIGN_SERVICE_REQUEST");
  const staff = data.staff.filter((s) => roleHasPermission(s.membership.role, "VIEW_SERVICE_DESK")).map((s) => ({ id: s.profile.id, name: displayName(s.profile) }));
  return (
    <>
      <PageHeader eyebrow="Customer Service" title="New Service Request" description="Create an internal request linked to an existing customer." />
      <section className="panel form-panel">
        {data.customers.length ? (
          <ServiceRequestForm
            customers={data.customers
              .filter((c) => c.status === "ACTIVE")
              .map((c) => ({
                id: c.id,
                customer_number: c.customer_number,
                name: c.name,
              }))}
            staff={staff}
            canAssign={canAssign}
          />
        ) : (
          <div className="empty compact-empty">
            <h2>A customer is required</h2>
            <p>Create a customer before opening a service request.</p>
          </div>
        )}
      </section>
    </>
  );
}
