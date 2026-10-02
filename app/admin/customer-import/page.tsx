import { PageHeader } from "@/components/ui";
import { CustomerImportWorkspace } from "@/components/admin/customer-import-workspace";
import { CustomerImportSubmissionQueue } from "@/components/admin/customer-import-submission-queue";
import {
  getCustomerDataOrganizations,
  getCustomerImportSubmissionQueue,
} from "@/lib/data/customer-data-management-repository";

export const metadata = { title: "Customer Import" };

export default async function Page() {
  const [organizations, submissions] = await Promise.all([
    getCustomerDataOrganizations(),
    getCustomerImportSubmissionQueue(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Platform Administration"
        title="Customer Import"
        description="Review organization source files, prepare canonical CSV data, then validate and import Customers."
      />
      <CustomerImportSubmissionQueue submissions={submissions} />
      <CustomerImportWorkspace organizations={organizations} />
    </>
  );
}
