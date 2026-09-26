import { CasesRegister } from "@/components/cases/cases-register";
import { CaseKpis } from "@/components/cases/case-kpis";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { getLiveOrganizationData } from "@/lib/data/case-repository";
import { normalizeCaseStatus } from "@/lib/operational-filters";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { getCaseDashboardCounts, matchesCaseRegisterFilters, normalizeCaseView, normalizeRawCaseStatus } from "@/lib/case-dashboard";
import { ApplicationIcon } from "@/components/application-icon";
import { guidedCaseIntakeSteps } from "@/lib/guided-case-intake";
import { loadGuidedIntakeDraftSummaries } from "@/lib/data/guided-case-intake-drafts";
import { DraftIntakeRow } from "@/components/cases/draft-intake-row";
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
  const drafts = canCreate ? await loadGuidedIntakeDraftSummaries() : [];
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Cases"
        action={
          canCreate ? (
            <Link className="primary-button" href="/cases/new">
              <ApplicationIcon name="add" />New Case
            </Link>
          ) : undefined
        }
      />
      {drafts.length ? (
        <section className="panel detail-section draft-intakes-panel">
          <div className="section-head">
            <div>
              <h2>Draft Intakes</h2>
              <p>Saved intake sessions that have not created Cases yet.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Customer</th>
                  <th>Case Title</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <DraftIntakeRow
                    key={draft.id}
                    draftId={draft.id}
                    customerName={draft.customerName}
                    caseTitle={draft.caseTitle}
                    completedSteps={Math.min(
                      Math.max(draft.currentStep, 0),
                      guidedCaseIntakeSteps.length,
                    )}
                    totalSteps={guidedCaseIntakeSteps.length}
                    updatedAt={new Date(draft.updatedAt).toLocaleString()}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <CaseKpis counts={counts} filters={filters} selectedView={selectedView} />
      <CasesRegister items={items} filters={{ ...filters, status: dashboardStatus ?? rawStatus ?? "ALL", view: selectedView }} />
    </>
  );
}
