import { CasesRegister } from "@/components/cases/cases-register";
import { CaseKpis } from "@/components/cases/case-kpis";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { getLiveOrganizationData } from "@/lib/data/case-repository";
import { normalizeCaseStatus } from "@/lib/operational-filters";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { getCaseDashboardCounts, matchesCaseRegisterFilters, normalizeCaseView, normalizeRawCaseStatus } from "@/lib/case-dashboard";
export const metadata = { title: "Cases" };
type Params = {
  query?: string;
  status?: string;
  priority?: string;
  assignment?: string;
  view?: string;
};
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const [data, filters, access] = await Promise.all([getLiveOrganizationData(), searchParams, getAccessContext()]);
  const dashboardStatus = normalizeCaseStatus(filters.status);
  const rawStatus = normalizeRawCaseStatus(filters.status);
  const selectedView = normalizeCaseView(filters.view);
  const counts = getCaseDashboardCounts(data.cases, data.timezone);
  const items = data.cases.filter((item) => matchesCaseRegisterFilters(item, filters, data.timezone));
  const canCreate = hasPermission(access, "CREATE_CASE");
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Cases"
        description="Search, filter, and track live cases in the active organization."
        action={
          canCreate ? (
            <Link className="primary-button" href="/cases/new">
              ＋ New Case
            </Link>
          ) : undefined
        }
      />
      <CaseKpis counts={counts} filters={filters} selectedView={selectedView} />
      <CasesRegister items={items} filters={{ ...filters, status: dashboardStatus ?? rawStatus ?? "ALL", view: selectedView }} />
    </>
  );
}
