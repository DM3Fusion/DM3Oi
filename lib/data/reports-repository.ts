import "server-only";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOperationalReport, isCanonicalReportParams, resolveReportingPeriod, startOfReportingDay } from "@/lib/reporting";
import {
  failedBusinessReach,
  normalizeBusinessReachPayload,
  normalizeBusinessReachUnmappedCustomers,
  unavailableBusinessReach,
} from "@/lib/business-reach";
import { logServerPerformance, measureServerPerformance } from "@/lib/server-performance";

export class ReportsDataError extends Error {
  constructor() {
    super("Reports are temporarily unavailable.");
    this.name = "ReportsDataError";
  }
}

export type ReportSearchParams = { period?: string; compare?: string; from?: string; to?: string };

export async function getBusinessReach() {
  return measureServerPerformance("/reports", "repository.businessReach.total", async () => {
  const access = await measureServerPerformance(
    "/reports",
    "repository.businessReach.accessContext",
    () => getAccessContext(),
  );
  if (!access?.activeOrganization || !hasPermission(access, "VIEW_REPORTS")) redirect("/");
  const organizationId = access.activeOrganization.id;
  const canViewCustomers = hasPermission(access, "VIEW_CUSTOMERS");
  const canRefresh = canViewCustomers && hasPermission(access, "EDIT_CUSTOMER");
  if (!canViewCustomers) return unavailableBusinessReach(false);

  const supabase = await createClient();
  const { data, error } = await measureServerPerformance(
    "/reports",
    "repository.businessReach.getBusinessReachRpc",
    () => supabase.rpc("get_business_reach" as never, {
      target_organization_id: organizationId,
    } as never),
  );
  if (error) {
    console.error("Business Reach query failed", { code: error.code, message: error.message });
    return failedBusinessReach(canRefresh);
  }

  return normalizeBusinessReachPayload(data, canRefresh);
  });
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
  return measureServerPerformance("/reports", "repository.operationalReport.total", async () => {
  const access = await measureServerPerformance(
    "/reports",
    "repository.operationalReport.accessContext",
    () => getAccessContext(),
  );
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
  const settings = await measureServerPerformance(
    "/reports",
    "repository.operationalReport.organizationSettings",
    () => createAdminClient()
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  );
  if (settings.error) throw new ReportsDataError();
  const period = resolveReportingPeriod(params, settings.data?.timezone ?? "UTC", now);
  if (!isCanonicalReportParams(params, period)) redirect(`/reports?${period.canonicalQuery}`);
  const supabase = await createClient();
  const earliest = (period.previous?.start ?? period.range.start).toISOString();
  const end = period.range.endExclusive.toISOString();
  const currentDayStart = startOfReportingDay(now, period.timezone).toISOString();
  const casesPromise = capabilities.cases
    ? supabase
        .from("organization_cases")
        .select("organization_id,customer_id,opened_at,completed_at")
        .eq("organization_id", organizationId)
        .lt("created_at", end)
        .or(`opened_at.gte.${earliest},completed_at.gte.${earliest}`)
    : Promise.resolve({ data: [], error: null });
  const tasksPromise = !capabilities.tasks
    ? Promise.resolve({ data: [], error: null })
    : capabilities.rules
      ? supabase
        .from("organization_case_tasks")
        .select("organization_id,title,status,created_at,completed_at,due_at,generated_by_rule,assigned_user_id")
        .eq("organization_id", organizationId)
        .or(`and(created_at.gte.${earliest},created_at.lt.${end}),and(completed_at.gte.${earliest},completed_at.lt.${end})`)
      : supabase
        .from("organization_case_tasks")
        .select("organization_id,title,status,created_at,completed_at,due_at,assigned_user_id")
        .eq("organization_id", organizationId)
        .or(`and(created_at.gte.${earliest},created_at.lt.${end}),and(completed_at.gte.${earliest},completed_at.lt.${end})`);
  const currentTasksPromise = capabilities.tasks
    ? supabase
        .from("organization_case_tasks")
        .select("organization_id,title,status,due_at")
        .eq("organization_id", organizationId)
        .in("status", ["NOT_STARTED", "IN_PROGRESS", "WAITING_ON_CUSTOMER"])
        .or(`status.eq.WAITING_ON_CUSTOMER,due_at.lt.${currentDayStart}`)
    : Promise.resolve({ data: [], error: null });
  const requestsPromise = capabilities.serviceRequests
    ? supabase
        .from("organization_service_requests")
        .select("organization_id,case_id,opened_at,resolved_at")
        .eq("organization_id", organizationId)
        .lt("created_at", end)
        .or(`opened_at.gte.${earliest},resolved_at.gte.${earliest},closed_at.gte.${earliest}`)
    : Promise.resolve({ data: [], error: null });
  const [caseResult, taskResult, currentTaskResult, requestResult] = await Promise.all([
    measureServerPerformance(
      "/reports",
      "repository.operationalReport.cases",
      () => casesPromise,
    ),
    measureServerPerformance(
      "/reports",
      "repository.operationalReport.periodTasks",
      () => tasksPromise,
    ),
    measureServerPerformance(
      "/reports",
      "repository.operationalReport.currentTasks",
      () => currentTasksPromise,
    ),
    measureServerPerformance(
      "/reports",
      "repository.operationalReport.serviceRequests",
      () => requestsPromise,
    ),
  ]);
  const error = caseResult.error ?? taskResult.error ?? currentTaskResult.error ?? requestResult.error;
  if (error) {
    console.error("Reports query failed", { code: error.code, message: error.message });
    throw new ReportsDataError();
  }
  const cases = caseResult.data ?? [];
  const customerIds = capabilities.cases && capabilities.customers
    ? [...new Set(cases.map((item) => item.customer_id))]
    : [];
  const customerResult = await measureServerPerformance(
    "/reports",
    "repository.operationalReport.customers",
    () => customerIds.length
      ? supabase
          .from("organization_customers")
          .select("id,organization_id,name")
          .eq("organization_id", organizationId)
          .in("id", customerIds)
      : { data: [], error: null },
  );
  if (customerResult.error) {
    console.error("Reports customer query failed", {
      code: customerResult.error.code,
      message: customerResult.error.message,
    });
    throw new ReportsDataError();
  }
  const buildStartedAt = performance.now();
  const report = buildOperationalReport({
    organizationId,
    timezone: period.timezone,
    period,
    cases,
    tasks: (taskResult.data ?? []).map((item) => ({
      ...item,
      generated_by_rule: "generated_by_rule" in item && typeof item.generated_by_rule === "boolean"
        ? item.generated_by_rule
        : false,
    })),
    currentTasks: currentTaskResult.data ?? [],
    requests: requestResult.data ?? [],
    customers: (customerResult.data ?? []).flatMap((customer) =>
      customer.id && customer.organization_id && customer.name
        ? [{
            id: customer.id,
            organization_id: customer.organization_id,
            name: customer.name,
          }]
        : [],
    ),
    capabilities,
  });
  logServerPerformance(
    "/reports",
    "repository.operationalReport.buildReport",
    buildStartedAt,
  );
  return report;
  });
}

export type OperationalReport = Awaited<ReturnType<typeof getOperationalReport>>;
export type BusinessReachReport = Awaited<ReturnType<typeof getBusinessReach>>;
