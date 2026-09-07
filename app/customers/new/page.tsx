import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/customer-form";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
export const metadata = { title: "New Customer" };
export default async function Page() {
  const access = await getAccessContext();
  if (!hasPermission(access, "CREATE_CUSTOMER")) notFound();
  return (
    <>
      <PageHeader eyebrow="Customers" title="Create Customer" description="Add a customer record for case and service workflows." />
      <section className="panel form-panel">
        <CustomerForm />
      </section>
    </>
  );
}
