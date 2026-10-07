import Link from "next/link";
import { ApplicationIcon } from "@/components/application-icon";
import { AssignedUserWorkloads } from "@/components/cases/assigned-user-workloads";
import { CaseKpis } from "@/components/cases/case-kpis";
import { CasesRegister } from "@/components/cases/cases-register";
import { PageHeader } from "@/components/ui";
import type { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import {
  getCaseDashboardCounts,
  matchesCaseRegisterFilters,
  normalizeCaseView,
  normalizeRawCaseStatus,
} from "@/lib/case-dashboard";
import { isIncompleteCompatibilityCaseStatus } from "@/lib/case-lifecycle";
import type { getCasesRegisterData } from "@/lib/data/case-repository";
import { normalizeCaseStatus } from "@/lib/operational-filters";

export type CasePageParams = {
  query?: string;
  status?: string;
  priority?: string;
  assignment?: string;
  view?: string;
  lifecycle?: string;
  assignee?: string;
};

type CaseDataPromise = ReturnType<typeof getCasesRegisterData>;
type AccessPromise = ReturnType<typeof getAccessContext>;

export async function resolveCasesPageModel(
  dataPromise: CaseDataPromise,
  searchParams: Promise<CasePageParams>,
) {
  const [data, filters] = await Promise.all([dataPromise, searchParams]);
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

  return {
    counts,
    dashboardStatus,
    dashboardTaxYear,
    filters,
    items,
    rawStatus,
    selectedLifecycle,
    selectedView,
    workloads: data.workloads,
  };
}

export type CasesPageModelPromise = ReturnType<typeof resolveCasesPageModel>;

export async function CasesHeaderServerSection({
  modelPromise,
  accessPromise,
}: {
  modelPromise: CasesPageModelPromise;
  accessPromise: AccessPromise;
}) {
  const [model, access] = await Promise.all([modelPromise, accessPromise]);
  const canCreate = hasPermission(access, "CREATE_CASE");

  return (
    <PageHeader
      eyebrow="Operations"
      title={model.dashboardTaxYear ? `${model.dashboardTaxYear} Cases` : "Cases"}
      action={
        canCreate ? (
          <Link className="primary-button" href="/cases/new">
            <ApplicationIcon name="add" />New Case
          </Link>
        ) : undefined
      }
    />
  );
}

export async function CaseKpisServerSection({
  modelPromise,
}: {
  modelPromise: CasesPageModelPromise;
}) {
  const model = await modelPromise;
  return (
    <CaseKpis
      counts={model.counts}
      filters={model.filters}
      selectedView={model.selectedView}
    />
  );
}

export async function CaseWorkloadServerSection({
  modelPromise,
}: {
  modelPromise: CasesPageModelPromise;
}) {
  const model = await modelPromise;
  return <AssignedUserWorkloads workloads={model.workloads} />;
}

export async function CaseRegisterServerSection({
  modelPromise,
}: {
  modelPromise: CasesPageModelPromise;
}) {
  const model = await modelPromise;

  return (
    <>
      <nav className="case-lifecycle-tabs" aria-label="Case lifecycle">
        <Link
          href={{
            pathname: "/cases",
            query: {
              ...model.filters,
              lifecycle: "active",
              status: undefined,
              view: undefined,
            },
          }}
          className={`case-lifecycle-tab case-lifecycle-tab-active${model.selectedLifecycle === "active" ? " active" : ""}`}
          aria-current={model.selectedLifecycle === "active" ? "page" : undefined}
        >
          List Active Cases
        </Link>
        <Link
          href={{
            pathname: "/cases",
            query: {
              ...model.filters,
              lifecycle: "completed",
              status: undefined,
              view: undefined,
            },
          }}
          className={`case-lifecycle-tab case-lifecycle-tab-completed${model.selectedLifecycle === "completed" ? " active" : ""}`}
          aria-current={model.selectedLifecycle === "completed" ? "page" : undefined}
        >
          List Completed Cases
        </Link>
      </nav>
      <CasesRegister
        items={model.items}
        filters={{
          ...model.filters,
          status: model.dashboardStatus ?? model.rawStatus ?? "ALL",
          view: model.selectedView,
        }}
      />
    </>
  );
}
