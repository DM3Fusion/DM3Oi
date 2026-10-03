import { PageHeader } from "@/components/ui";
import { CustomerDuplicateWorkspace } from "@/components/admin/customer-duplicate-workspace";
import { getDuplicateWorkspace } from "@/lib/data/customer-data-management-repository";

export const metadata = { title: "Duplicate Customers" };

export default async function Page({ searchParams }: { searchParams: Promise<{ organizationId?: string }> }) {
  const params = await searchParams;
  const data = await getDuplicateWorkspace(params.organizationId);
  return <><PageHeader eyebrow="Platform Administration" title="Duplicate Customers" /><CustomerDuplicateWorkspace organizations={data.organizations} organizationId={data.selected?.id ?? ""} customers={data.customers} pairs={data.pairs} history={data.history} /></>;
}
