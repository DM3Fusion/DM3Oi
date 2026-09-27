export const minimumTaxYear = 1900;
export const maximumTaxYear = 2200;

export const isValidTaxYear = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= minimumTaxYear &&
  value <= maximumTaxYear;

type CustomerIdentity = { id: string };
type CaseTaxYear = { customer_id: string; tax_year: number | null };

export function getCustomerTenureMetrics(
  customers: CustomerIdentity[],
  cases: CaseTaxYear[],
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
  const customerIds = new Set(customers.map((customer) => customer.id));
  const countForYear = (year: number | null) =>
    year === null
      ? 0
      : [...yearsByCustomer].filter(
          ([customerId, years]) => customerIds.has(customerId) && years.has(year),
        ).length;
  const repeatCustomers = [...yearsByCustomer].filter(
    ([customerId, years]) =>
      customerIds.has(customerId) &&
      [...years].some((year) => years.has(year + 1)),
  ).length;
  const newCustomers =
    currentTaxYear === null
      ? 0
      : [...yearsByCustomer].filter(([customerId, years]) => {
          if (!customerIds.has(customerId) || !years.has(currentTaxYear)) return false;
          return Math.min(...years) === currentTaxYear;
        }).length;
  const inactivePriorYearCustomers =
    currentTaxYear === null || priorTaxYear === null
      ? 0
      : [...yearsByCustomer].filter(
          ([customerId, years]) =>
            customerIds.has(customerId) &&
            years.has(priorTaxYear) &&
            !years.has(currentTaxYear),
        ).length;

  return {
    lifetimeCustomers: customerIds.size,
    currentTaxYear,
    priorTaxYear,
    currentTaxYearCustomers: countForYear(currentTaxYear),
    priorTaxYearCustomers: countForYear(priorTaxYear),
    repeatCustomers,
    newCustomers,
    inactivePriorYearCustomers,
  };
}

export function getCustomerMemberSince(cases: Array<{ tax_year: number | null }>) {
  const years = cases
    .map((item) => item.tax_year)
    .filter(isValidTaxYear);
  return years.length ? Math.min(...years) : null;
}
