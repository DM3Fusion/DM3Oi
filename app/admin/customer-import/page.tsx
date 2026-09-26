import { PageHeader } from "@/components/ui";
import { CustomerImportWorkspace } from "@/components/admin/customer-import-workspace";
import { getCustomerDataOrganizations } from "@/lib/data/customer-data-management-repository";

export const metadata = { title: "Customer Import" };

export default async function Page() {
  const organizations = await getCustomerDataOrganizations();
  return <><PageHeader eyebrow="Platform Administration" title="Customer Import" /><CustomerImportWorkspace organizations={organizations} /></>;
}
