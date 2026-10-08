import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ServiceRequestForm } from "@/components/service-request-form";
import { getNewServiceRequestFormData } from "@/lib/data/case-repository";
import { hasPermission, roleHasPermission } from "@/lib/auth/permissions";
export const metadata = { title: "New Service Request" };
export default async function Page() {
  const data = await getNewServiceRequestFormData();
  if (!hasPermission(data.access, "CREATE_SERVICE_REQUEST")) notFound();
  const canAssign = hasPermission(data.access, "ASSIGN_SERVICE_REQUEST");
  const staff = data.staff.filter((s) => roleHasPermission(s.role, "VIEW_SERVICE_DESK")).map((s) => ({ id: s.id, name: s.name }));
  return (
    <>
      <PageHeader eyebrow="Customer Service" title="New Service Request" description="Create an internal request linked to an existing customer." />
      <section className="panel form-panel">
        {data.customers.length ? (
          <ServiceRequestForm
            customers={data.customers}
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
