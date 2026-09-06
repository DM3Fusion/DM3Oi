export const customerStatuses = ["active", "inactive", "archived"] as const;
export type CustomerStatusFilter = "all" | (typeof customerStatuses)[number];
type FilterableCustomer = { customer_number:string; name:string; email:string|null; phone:string|null; type:string; status:string };
export const normalizeCustomerStatus = (value?:string):CustomerStatusFilter => customerStatuses.includes(value?.toLowerCase() as (typeof customerStatuses)[number]) ? value!.toLowerCase() as CustomerStatusFilter : "all";
export const normalizeCustomerQuery = (value?:string) => (value??"").trim().slice(0,200);
export function customerMatchesFilters(customer:FilterableCustomer,query:string,status:CustomerStatusFilter){if(status!=="all"&&customer.status.toLowerCase()!==status)return false;const term=normalizeCustomerQuery(query).toLowerCase();if(!term)return true;return [customer.customer_number,customer.name,customer.email,customer.phone,customer.type].some(value=>value?.toLowerCase().includes(term));}
