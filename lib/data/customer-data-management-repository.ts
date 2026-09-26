import "server-only";

import { requireSuperAdmin } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { findDuplicateCustomerPairs } from "@/lib/customer-data-management";
import { requireOrganizationCustomers } from "@/lib/data/organization-customers";

export async function getCustomerDataOrganizations() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const [{ data: organizations, error }, { data: customers, error: customerError }] = await Promise.all([
    supabase.from("organizations").select("id,name,slug,status").order("name"),
    supabase.from("organization_customers").select("organization_id,id"),
  ]);
  if (error || customerError) throw new Error("Customer Data Management organizations could not be loaded.");
  return (organizations ?? []).map((organization) => ({
    ...organization,
    customerCount: (customers ?? []).filter((customer) => customer.organization_id === organization.id).length,
  }));
}

export async function getDuplicateWorkspace(organizationId?: string) {
  const organizations = await getCustomerDataOrganizations();
  const selected = organizations.find((organization) => organization.id === organizationId) ?? null;
  if (!selected) return { organizations, selected: null, customers: [], pairs: [], history: [] };
  const supabase = await createClient();
  const [{ data: customers, error }, { data: history, error: historyError }] = await Promise.all([
    supabase.from("organization_customers").select("*").eq("organization_id", selected.id).order("customer_number"),
    supabase.from("customer_merge_history").select("*").eq("organization_id", selected.id).order("performed_at", { ascending: false }).limit(25),
  ]);
  if (error || historyError) throw new Error("Duplicate Customer data could not be loaded.");
  const rows = requireOrganizationCustomers(customers ?? []);
  return { organizations, selected, customers: rows, pairs: findDuplicateCustomerPairs(rows), history: history ?? [] };
}
