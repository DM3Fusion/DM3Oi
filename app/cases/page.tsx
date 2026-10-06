import { CasesRegister } from "@/components/cases/cases-register";
import { CaseKpis } from "@/components/cases/case-kpis";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { getCasesRegisterData } from "@/lib/data/case-repository";
import { normalizeCaseStatus } from "@/lib/operational-filters";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { getCaseDashboardCounts, matchesCaseRegisterFilters, normalizeCaseView, normalizeRawCaseStatus } from "@/lib/case-dashboard";
import { ApplicationIcon } from "@/components/application-icon";
import { isIncompleteCompatibilityCaseStatus } from "@/lib/case-lifecycle";
import { AssignedUserWorkloads } from "@/components/cases/assigned-user-workloads";
export const metadata = { title: "Cases" };
type Params = {
  query?: string;
  status?: string;
  priority?: string;
  assignment?: string;
  view?: string;
  lifecycle?: string;
  assignee?: string;
};
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const [data, filters, access] = await Promise.all([
    getCasesRegisterData(),
    searchParams,
    getAccessContext(),
  ]);
  const dashboardStatus = normalizeCaseStatus(filters.status);
  const rawStatus = normalizeRawCaseStatus(filters.status);
  const selectedView = normalizeCaseView(filters.view);
  const selectedLifecycle =
    filters.lifecycle === "completed" ? "completed" : "active";
  const dashboardCases = data.cases.filter(
    (item) =>
      item.status === "COMPLETED" ||
      isIncompleteCompatibilityCaseStatus(item.status),
  );
  const dashboardTaxYear = dashboardCases.reduce<number | null>(
    (latest, item) => {
      const taxYear = Number(item.tax_year);
      if (!Number.isInteger(taxYear) || taxYear <= 0) return latest;
      return latest === null ? taxYear : Math.max(latest, taxYear);
    },
    null,
  );
  const lifecycleCases = dashboardCases.filter((item) =>
    selectedLifecycle === "completed"
      ? item.status === "COMPLETED"
      : isIncompleteCompatibilityCaseStatus(item.status),
  );
  const counts = getCaseDashboardCounts(dashboardCases, data.timezone);
  const items = lifecycleCases.filter((item) =>
    matchesCaseRegisterFilters(item, filters, data.timezone),
  );
  const canCreate = hasPermission(access, "CREATE_CASE");

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title={dashboardTaxYear ? `${dashboardTaxYear} Cases` : "Cases"}
        action={
          canCreate ? (
            <Link className="primary-button" href="/cases/new">
              <ApplicationIcon name="add" />New Case
            </Link>
          ) : undefined
        }
      />
      <CaseKpis counts={counts} filters={filters} selectedView={selectedView} />
      <AssignedUserWorkloads workloads={data.workloads} />
      <nav className="case-lifecycle-tabs" aria-label="Case lifecycle">
        <Link
          href={{
            pathname: "/cases",
            query: {
              ...filters,
              lifecycle: "active",
              status: undefined,
              view: undefined,
            },
          }}
          className={`case-lifecycle-tab case-lifecycle-tab-active${selectedLifecycle === "active" ? " active" : ""}`}
          aria-current={selectedLifecycle === "active" ? "page" : undefined}
        >
          List Active Cases
        </Link>
        <Link
          href={{
            pathname: "/cases",
            query: {
              ...filters,
              lifecycle: "completed",
              status: undefined,
              view: undefined,
            },
          }}
          className={`case-lifecycle-tab case-lifecycle-tab-completed${selectedLifecycle === "completed" ? " active" : ""}`}
          aria-current={selectedLifecycle === "completed" ? "page" : undefined}
        >
          List Completed Cases
        </Link>
      </nav>
      <CasesRegister items={items} filters={{ ...filters, status: dashboardStatus ?? rawStatus ?? "ALL", view: selectedView }} />
    </>
  );
}
