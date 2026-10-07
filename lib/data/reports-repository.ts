import "server-only";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  isCanonicalReportParams,
  reportBucketKeys,
  reportDelta,
  resolveReportingPeriod,
  startOfReportingDay,
  type ReportCapabilities,
  type ReportingPeriod,
} from "@/lib/reporting";
import {
  failedBusinessReach,
  normalizeBusinessReachPayload,
  normalizeBusinessReachUnmappedCustomers,
  unavailableBusinessReach,
} from "@/lib/business-reach";

export class ReportsDataError extends Error {
  constructor() {
    super("Reports are temporarily unavailable.");
    this.name = "ReportsDataError";
  }
}

export type ReportSearchParams = { period?: string; compare?: string; from?: string; to?: string };

type AggregateSummary = {
  opened: number;
  completed: number;
  cohort_completed: number;
  customers: number;
  average_duration: number | null;
  median_duration: number | null;
  tasks_completed: number;
  requests_received: number;
};

type OperationalReportAggregate = {
  capabilities: ReportCapabilities;
  current: AggregateSummary;
  previous: AggregateSummary | null;
  caseVolume: Array<{ key: string; opened: number; completed: number }>;
  durationTrend: Array<{ key: string; average: number; completed: number }>;
  taskPerformance: {
    waitingOnCustomer: number;
    overdue: number;
    manual: number | null;
    generated: number | null;
  };
  requestPerformance: { resolved: number; linked: number };
  requestVolume: Array<{ key: string; received: number; resolved: number }>;
  topCustomers: Array<{ id: string; label: string; count: number }>;
  bottlenecks: Array<{ key: string; label: string; count: number }>;
  workDistribution: { assigned: number; unassigned: number };
};

function operationalReportFromAggregate(
  period: ReportingPeriod,
  aggregate: OperationalReportAggregate,
) {
  const { capabilities, current, previous } = aggregate;
  const completionRate = current.opened
    ? Math.round(current.cohort_completed / current.opened * 100)
    : 0;
  const previousCompletionRate = previous?.opened
    ? Math.round(previous.cohort_completed / previous.opened * 100)
    : 0;
  const caseValue = <T,>(value: T) => capabilities.cases ? value : null;
  const values = [
    ["Cases Opened", "Cases with an opening timestamp in the period", caseValue(current.opened), caseValue(previous?.opened), null],
    ["Cases Completed", "Cases with a completion timestamp in the period", caseValue(current.completed), caseValue(previous?.completed), null],
    ["Completion Rate", "Cases opened in the period and completed by period end ÷ Cases opened", caseValue(completionRate), caseValue(previousCompletionRate), null],
    ["Average Case Duration", "Mean elapsed time for Cases completed in the period", caseValue(current.average_duration), caseValue(previous?.average_duration), null],
    ["Customers Served", "Distinct customers with Case openings or completions in the period", capabilities.cases && capabilities.customers ? current.customers : null, capabilities.cases && capabilities.customers ? previous?.customers : null, capabilities.cases && capabilities.customers ? "/customers" : null],
    ["Tasks Completed", "Tasks with a completion timestamp in the period", capabilities.tasks ? current.tasks_completed : null, capabilities.tasks ? previous?.tasks_completed : undefined, null],
    ["Service Requests Received", "Requests with an opening timestamp in the period", capabilities.serviceRequests ? current.requests_received : null, capabilities.serviceRequests ? previous?.requests_received : undefined, null],
    ["Median Case Duration", "Median elapsed time for Cases completed in the period", caseValue(current.median_duration), caseValue(previous?.median_duration), null],
  ] as const;
  const kpis = values.map(([label, description, value, prior, href]) => ({
    label,
    description,
    value,
    href,
    delta: previous && value !== null && prior !== undefined && prior !== null
      ? reportDelta(value, prior)
      : null,
  }));
  const caseVolumeByKey = new Map(aggregate.caseVolume.map((item) => [item.key, item]));
  const requestVolumeByKey = new Map(aggregate.requestVolume.map((item) => [item.key, item]));
  const bucketKeys = reportBucketKeys(period);
  return {
    period,
    capabilities,
    kpis,
    caseVolume: bucketKeys.map((key) => caseVolumeByKey.get(key) ?? { key, opened: 0, completed: 0 }),
    completion: {
      average: current.average_duration,
      median: current.median_duration,
      count: current.completed,
    },
    durationTrend: aggregate.durationTrend,
    taskPerformance: {
      completed: current.tasks_completed,
      ...aggregate.taskPerformance,
    },
    requestPerformance: {
      received: current.requests_received,
      ...aggregate.requestPerformance,
    },
    requestVolume: bucketKeys.map((key) => requestVolumeByKey.get(key) ?? { key, received: 0, resolved: 0 }),
    topCustomers: aggregate.topCustomers,
    bottlenecks: aggregate.bottlenecks,
    workDistribution: aggregate.workDistribution,
  };
}

export async function getBusinessReach() {
  const access = await getAccessContext();
  if (!access?.activeOrganization || !hasPermission(access, "VIEW_REPORTS")) redirect("/");
  const canViewCustomers = hasPermission(access, "VIEW_CUSTOMERS");
  const canRefresh = canViewCustomers && hasPermission(access, "EDIT_CUSTOMER");
  if (!canViewCustomers) return unavailableBusinessReach(false);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_business_reach" as never, {
    target_organization_id: access.activeOrganization.id,
  } as never);
  if (error) {
    console.error("Business Reach query failed", { code: error.code, message: error.message });
    return failedBusinessReach(canRefresh);
  }

  return normalizeBusinessReachPayload(data, canRefresh);
}

export async function getBusinessReachUnmappedCustomers() {
  const access = await getAccessContext();
  if (!access?.activeOrganization || !hasPermission(access, "VIEW_REPORTS")) redirect("/");
  if (!hasPermission(access, "VIEW_CUSTOMERS")) redirect("/reports");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_business_reach_unmapped_customers" as never, {
    target_organization_id: access.activeOrganization.id,
  } as never);
  if (error) {
    console.error("Business Reach unmapped customer query failed", {
      code: error.code,
      message: error.message,
    });
    return { customers: [], loadError: true };
  }

  return {
    customers: normalizeBusinessReachUnmappedCustomers(data),
    loadError: false,
  };
}

export async function getOperationalReport(params: ReportSearchParams, now = new Date()) {
  const access = await getAccessContext();
  if (!access?.activeOrganization || !hasPermission(access, "VIEW_REPORTS")) redirect("/");
  const organizationId = access.activeOrganization.id;
  const capabilities = {
    cases: hasPermission(access, "VIEW_CASES"),
    tasks: hasPermission(access, "VIEW_TASKS"),
    serviceRequests: hasPermission(access, "VIEW_SERVICE_DESK"),
    customers: hasPermission(access, "VIEW_CUSTOMERS"),
    questions: hasPermission(access, "VIEW_QUESTIONS"),
    rules: hasPermission(access, "VIEW_RULES"),
  };
  const supabase = await createClient();
  const settings = await supabase
    .from("organization_settings")
    .select("timezone")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (settings.error) throw new ReportsDataError();
  const period = resolveReportingPeriod(params, settings.data?.timezone ?? "UTC", now);
  if (!isCanonicalReportParams(params, period)) redirect(`/reports?${period.canonicalQuery}`);
  const currentDayStart = startOfReportingDay(now, period.timezone).toISOString();
  const result = await supabase.rpc("get_operational_report_aggregate" as never, {
    target_organization_id: organizationId,
    range_start: period.range.start.toISOString(),
    range_end: period.range.endExclusive.toISOString(),
    previous_start: period.previous?.start.toISOString() ?? null,
    previous_end: period.previous?.endExclusive.toISOString() ?? null,
    current_day_start: currentDayStart,
    target_timezone: period.timezone,
    target_bucket: period.bucket,
  } as never);
  if (result.error) {
    console.error("Reports aggregate query failed", {
      code: result.error.code,
      message: result.error.message,
    });
    throw new ReportsDataError();
  }
  const aggregate = result.data as OperationalReportAggregate;
  return operationalReportFromAggregate(period, {
    ...aggregate,
    capabilities,
  });
}

export type OperationalReport = Awaited<ReturnType<typeof getOperationalReport>>;
export type BusinessReachReport = Awaited<ReturnType<typeof getBusinessReach>>;
