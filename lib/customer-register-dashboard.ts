import { isValidTaxYear } from "./customer-tenure.ts";

export const customerViews = ["new", "returning", "without-portal"] as const;
export type CustomerView = (typeof customerViews)[number];

type CustomerIdentity = { id: string };
type CustomerCase = { customer_id: string; tax_year: number | null };

export function normalizeCustomerView(value?: string): CustomerView | undefined {
  return customerViews.includes(value as CustomerView)
    ? (value as CustomerView)
    : undefined;
}

export function getCustomerRegisterDashboard(
  customers: CustomerIdentity[],
  cases: CustomerCase[],
  effectivePortalCustomerIds: ReadonlySet<string>,
) {
  const yearsByCustomer = new Map<string, Set<number>>();
  for (const item of cases) {
    if (!isValidTaxYear(item.tax_year)) continue;
    const years = yearsByCustomer.get(item.customer_id) ?? new Set<number>();
    years.add(item.tax_year);
    yearsByCustomer.set(item.customer_id, years);
  }

  const representedYears = [...yearsByCustomer.values()].flatMap((years) => [
    ...years,
  ]);
  const currentTaxYear = representedYears.length
    ? Math.max(...representedYears)
    : null;
  const priorTaxYear = currentTaxYear === null ? null : currentTaxYear - 1;
  const newIds = new Set<string>();
  const returningIds = new Set<string>();

  if (currentTaxYear !== null && priorTaxYear !== null) {
    for (const customer of customers) {
      const years = yearsByCustomer.get(customer.id);
      if (!years?.has(currentTaxYear)) continue;
      if (Math.min(...years) === currentTaxYear) newIds.add(customer.id);
      if (years.has(priorTaxYear)) returningIds.add(customer.id);
    }
  }

  const withoutPortalIds = new Set(
    customers
      .filter((customer) => !effectivePortalCustomerIds.has(customer.id))
      .map((customer) => customer.id),
  );

  return {
    currentTaxYear,
    priorTaxYear,
    counts: {
      total: customers.length,
      new: newIds.size,
      returning: returningIds.size,
      withoutPortal: withoutPortalIds.size,
    },
    matches(customerId: string, view?: CustomerView) {
      if (view === "new") return newIds.has(customerId);
      if (view === "returning") return returningIds.has(customerId);
      if (view === "without-portal") return withoutPortalIds.has(customerId);
      return true;
    },
  };
}

export function customerViewHref(
  filters: { q?: string; status?: string },
  view?: CustomerView,
) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status && filters.status !== "all")
    params.set("status", filters.status);
  if (view) params.set("view", view);
  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}

