import type { Database } from "@/types/database.generated";

type GeneratedOrganizationCustomer =
  Database["public"]["Views"]["organization_customers"]["Row"];

type RequiredCustomerKeys =
  | "created_at"
  | "customer_number"
  | "id"
  | "name"
  | "organization_id"
  | "status"
  | "type"
  | "updated_at";

export type OrganizationCustomer = Omit<
  GeneratedOrganizationCustomer,
  RequiredCustomerKeys
> & {
  [Key in RequiredCustomerKeys]: NonNullable<
    GeneratedOrganizationCustomer[Key]
  >;
};

export function isOrganizationCustomer(
  row: GeneratedOrganizationCustomer,
): row is OrganizationCustomer {
  return (
    row.created_at !== null &&
    row.customer_number !== null &&
    row.id !== null &&
    row.name !== null &&
    row.organization_id !== null &&
    row.status !== null &&
    row.type !== null &&
    row.updated_at !== null
  );
}

export function requireOrganizationCustomer(
  row: GeneratedOrganizationCustomer | null,
): OrganizationCustomer | null {
  if (row === null) return null;
  if (!isOrganizationCustomer(row)) {
    throw new Error("Customer data is incomplete.");
  }
  return row;
}

export function requireOrganizationCustomers(
  rows: GeneratedOrganizationCustomer[],
): OrganizationCustomer[] {
  if (!rows.every(isOrganizationCustomer)) {
    throw new Error("Customer data is incomplete.");
  }
  return rows;
}
