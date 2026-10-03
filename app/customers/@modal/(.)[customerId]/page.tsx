import { CustomerDetail } from "@/components/customers/customer-detail";

export default async function CustomerDetailModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const [{ customerId }, query] = await Promise.all([params, searchParams]);
  return <CustomerDetail customerId={customerId} query={query} presentation="modal" />;
}
