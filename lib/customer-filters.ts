export const customerStatuses = ["active", "inactive", "archived"] as const;
export type CustomerStatusFilter = "all" | (typeof customerStatuses)[number];
type FilterableCustomer = {
  customer_number: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  email: string | null;
  phone: string | null;
  type: string;
  status: string;
};

export const normalizeCustomerStatus = (value?:string):CustomerStatusFilter => customerStatuses.includes(value?.toLowerCase() as (typeof customerStatuses)[number]) ? value!.toLowerCase() as CustomerStatusFilter : "all";
export const normalizeCustomerQuery = (value?:string) => (value??"").trim().slice(0,200);

export function customerMatchesFilters(
  customer: FilterableCustomer,
  query: string,
  status: CustomerStatusFilter,
) {
  if (status !== "all" && customer.status.toLowerCase() !== status) return false;

  const term = normalizeCustomerQuery(query).toLowerCase();
  if (!term) return true;

  return [
    customer.customer_number,
    customer.name,
    customer.first_name,
    customer.last_name,
    customer.street_address,
    customer.city,
    customer.state,
    customer.postal_code,
    customer.email,
    customer.phone,
    customer.type,
    customer.status,
  ].some((value) => value?.toLowerCase().includes(term));
}
