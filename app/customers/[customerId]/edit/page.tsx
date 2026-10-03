import { CustomerEdit } from "@/components/customers/customer-edit";

export default async function Page({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return <CustomerEdit customerId={customerId} presentation="page" />;
}
