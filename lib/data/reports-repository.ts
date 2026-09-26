import "server-only";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOperationalReport, isCanonicalReportParams, resolveReportingPeriod, startOfReportingDay } from "@/lib/reporting";

export class ReportsDataError extends Error {
  constructor() {
    super("Reports are temporarily unavailable.");
    this.name = "ReportsDataError";
  }
}

export type ReportSearchParams = { period?: string; compare?: string; from?: string; to?: string };

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
  const settings = await createAdminClient()
    .from("organization_settings")
    .select("timezone")
    .eq("organization_id", organizationId)
    .maybeSingle();
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
        .select("organization_id,customer_id,opened_at,completed_at,closed_at")
        .eq("organization_id", organizationId)
        .lt("created_at", end)
        .or(`opened_at.gte.${earliest},completed_at.gte.${earliest},closed_at.gte.${earliest}`)
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
        .in("status", ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"])
        .or(`status.eq.BLOCKED,due_at.lt.${currentDayStart}`)
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
    casesPromise,
    tasksPromise,
    currentTasksPromise,
    requestsPromise,
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
  const customerResult = customerIds.length
    ? await supabase
        .from("organization_customers")
        .select("id,organization_id,name")
        .eq("organization_id", organizationId)
        .in("id", customerIds)
    : { data: [], error: null };
  if (customerResult.error) {
    console.error("Reports customer query failed", {
      code: customerResult.error.code,
      message: customerResult.error.message,
    });
    throw new ReportsDataError();
  }
  return buildOperationalReport({
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
}

export type OperationalReport = Awaited<ReturnType<typeof getOperationalReport>>;
