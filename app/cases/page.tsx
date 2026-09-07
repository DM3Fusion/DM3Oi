import { CasesRegister } from "@/components/cases/cases-register";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { getLiveOrganizationData } from "@/lib/data/case-repository";
import { matchesCaseFilter, normalizeCaseStatus } from "@/lib/operational-filters";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
export const metadata = { title: "Cases" };
type Params = {
  query?: string;
  status?: string;
  priority?: string;
  assignment?: string;
};
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const [data, filters, access] = await Promise.all([getLiveOrganizationData(), searchParams, getAccessContext()]);
  const query = (filters.query ?? "").toLowerCase();
  const dashboardStatus = normalizeCaseStatus(filters.status);
  const rawStatus = ["NEW", "UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "WAITING", "REVIEW", "COMPLETED", "CLOSED", "CANCELLED"].includes(filters.status ?? "") ? filters.status : undefined;
  const items = data.cases.filter((item) => `${item.case_number} ${item.title} ${item.customer?.name ?? ""}`.toLowerCase().includes(query) && (dashboardStatus ? matchesCaseFilter(item, dashboardStatus) : rawStatus ? item.status === rawStatus : true) && (filters.priority && filters.priority !== "ALL" ? item.priority === filters.priority : true) && (filters.assignment === "ASSIGNED" ? Boolean(item.manager_user_id || item.assignedStaff.length) : filters.assignment === "UNASSIGNED" ? !item.manager_user_id && !item.assignedStaff.length : true));
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
      <CasesRegister items={items} filters={{ ...filters, status: dashboardStatus ?? rawStatus ?? "ALL" }} />
    </>
  );
}
