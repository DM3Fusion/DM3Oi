import { CustomerEdit } from "@/components/customers/customer-edit";

export default async function CustomerEditModalPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <CustomerEdit customerId={customerId} presentation="modal" />;
}
