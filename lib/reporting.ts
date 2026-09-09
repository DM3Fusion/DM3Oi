import { isValidTimeZone } from "./organization-timezone.ts";

export const reportPeriodKeys = [
  "7d", "30d", "90d", "this_month", "last_month",
  "this_quarter", "last_quarter", "this_year", "custom",
] as const;
export type ReportPeriodKey = (typeof reportPeriodKeys)[number];
export type ReportComparison = "none" | "previous";
export type ReportBucket = "day" | "week" | "month";

export const reportPeriodLabels: Record<ReportPeriodKey, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  last_quarter: "Last quarter",
  this_year: "This year",
  custom: "Custom date range",
};

export type DateRange = {
  from: string;
  to: string;
  start: Date;
  endExclusive: Date;
  days: number;
};

export type ReportingPeriod = {
  key: ReportPeriodKey;
  label: string;
  range: DateRange;
  comparison: ReportComparison;
  previous: DateRange | null;
  bucket: ReportBucket;
  timezone: string;
  canonicalQuery: string;
};

type ReportParams = { period?: string; compare?: string; from?: string; to?: string };
const dayMs = 86_400_000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const partsFor = (value: Date, timeZone: string) => Object.fromEntries(
  new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(value)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]),
) as Record<string, number>;

const dateKey = (value: Date, timeZone: string) => {
  const parts = partsFor(value, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

const parseDateKey = (value: string) => {
  if (!datePattern.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null;
};

const keyFromUtcCalendar = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

export const addReportDays = (key: string, days: number) => {
  const parts = parseDateKey(key);
  if (!parts) throw new Error("Invalid reporting date.");
  return keyFromUtcCalendar(new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days)));
};

const startOfLocalDate = (key: string, timezone: string) => {
  const parts = parseDateKey(key);
  if (!parts) throw new Error("Invalid reporting date.");
  const target = Date.UTC(parts.year, parts.month - 1, parts.day);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = Object.fromEntries(
      formatter.formatToParts(new Date(instant))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<string, number>;
    const representedInstant = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    instant -= representedInstant - target;
  }
  return new Date(instant);
};

const range = (from: string, to: string, timezone: string): DateRange => {
  const fromParts = parseDateKey(from);
  const toParts = parseDateKey(to);
  if (!fromParts || !toParts || from > to) throw new Error("Invalid reporting range.");
  const days = Math.round((Date.UTC(toParts.year, toParts.month - 1, toParts.day) - Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day)) / dayMs) + 1;
  return { from, to, start: startOfLocalDate(from, timezone), endExclusive: startOfLocalDate(addReportDays(to, 1), timezone), days };
};

const monthStart = (key: string, offset = 0) => {
  const parts = parseDateKey(key)!;
  return keyFromUtcCalendar(new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1)));
};
const monthEnd = (key: string, offset = 0) => {
  const parts = parseDateKey(key)!;
  return keyFromUtcCalendar(new Date(Date.UTC(parts.year, parts.month + offset, 0)));
};
const quarterStart = (key: string, offset = 0) => {
  const parts = parseDateKey(key)!;
  const startMonth = Math.floor((parts.month - 1) / 3) * 3 + offset * 3;
  return keyFromUtcCalendar(new Date(Date.UTC(parts.year, startMonth, 1)));
};
const quarterEnd = (key: string, offset = 0) => {
  const parts = parseDateKey(key)!;
  const startMonth = Math.floor((parts.month - 1) / 3) * 3 + offset * 3;
  return keyFromUtcCalendar(new Date(Date.UTC(parts.year, startMonth + 3, 0)));
};

export function resolveReportingPeriod(params: ReportParams, timezone?: string | null, now = new Date()): ReportingPeriod {
  const timeZone = isValidTimeZone(timezone) ? timezone : "UTC";
  let key = reportPeriodKeys.includes(params.period as ReportPeriodKey) ? params.period as ReportPeriodKey : "30d";
  const comparison: ReportComparison = params.compare === "previous" ? "previous" : "none";
  const today = dateKey(now, timeZone);
  let from: string;
  let to = today;
  if (key === "7d" || key === "30d" || key === "90d") from = addReportDays(today, -(Number(key.slice(0, -1)) - 1));
  else if (key === "this_month") from = monthStart(today);
  else if (key === "last_month") { from = monthStart(today, -1); to = monthEnd(today, -1); }
  else if (key === "this_quarter") from = quarterStart(today);
  else if (key === "last_quarter") { from = quarterStart(today, -1); to = quarterEnd(today, -1); }
  else if (key === "this_year") from = `${today.slice(0, 4)}-01-01`;
  else {
    const validCustom = params.from && params.to && parseDateKey(params.from) && parseDateKey(params.to) && params.from <= params.to;
    if (validCustom) { from = params.from!; to = params.to!; }
    else { key = "30d"; from = addReportDays(today, -29); to = today; }
  }
  const current = range(from, to, timeZone);
  let previous: DateRange | null = null;
  if (comparison === "previous") {
    let previousFrom: string;
    let previousTo: string;
    if (key === "this_month") {
      previousFrom = monthStart(today, -1);
      previousTo = [addReportDays(previousFrom, current.days - 1), monthEnd(today, -1)].sort()[0];
    } else if (key === "last_month") {
      previousFrom = monthStart(today, -2);
      previousTo = monthEnd(today, -2);
    } else if (key === "this_quarter") {
      previousFrom = quarterStart(today, -1);
      previousTo = [addReportDays(previousFrom, current.days - 1), quarterEnd(today, -1)].sort()[0];
    } else if (key === "last_quarter") {
      previousFrom = quarterStart(today, -2);
      previousTo = quarterEnd(today, -2);
    } else if (key === "this_year") {
      const previousYear = Number(today.slice(0, 4)) - 1;
      previousFrom = `${previousYear}-01-01`;
      const sameCalendarDay = `${previousYear}-${today.slice(5)}`;
      previousTo = parseDateKey(sameCalendarDay) ? sameCalendarDay : `${previousYear}-02-28`;
    } else {
      previousFrom = addReportDays(from, -current.days);
      previousTo = addReportDays(from, -1);
    }
    previous = range(previousFrom, previousTo, timeZone);
  }
  const bucket: ReportBucket = current.days <= 45 ? "day" : current.days <= 180 ? "week" : "month";
  const canonical = new URLSearchParams({ period: key });
  if (key === "custom") { canonical.set("from", from); canonical.set("to", to); }
  if (comparison === "previous") canonical.set("compare", "previous");
  return { key, label: reportPeriodLabels[key], range: current, comparison, previous, bucket, timezone: timeZone, canonicalQuery: canonical.toString() };
}

export const isCanonicalReportParams = (params: ReportParams, period: ReportingPeriod) => {
  const supplied = new URLSearchParams();
  if (params.period) supplied.set("period", params.period);
  if (params.from) supplied.set("from", params.from);
  if (params.to) supplied.set("to", params.to);
  if (params.compare) supplied.set("compare", params.compare);
  return supplied.toString() === period.canonicalQuery;
};

export type ReportCase = { organization_id: string; customer_id: string; opened_at: string; completed_at: string | null; closed_at: string | null };
export type ReportTask = { organization_id: string; title: string; status: string; created_at: string; completed_at: string | null; due_at: string | null; generated_by_rule: boolean; assigned_user_id: string | null };
export type ReportRequest = { organization_id: string; case_id: string | null; opened_at: string; resolved_at: string | null };
export type ReportCustomer = { id: string; organization_id: string; name: string };
export type ReportCapabilities = { cases: boolean; tasks: boolean; serviceRequests: boolean; customers: boolean; questions: boolean; rules: boolean };

const inRange = (value: string | null | undefined, valueRange: DateRange) => Boolean(value && new Date(value) >= valueRange.start && new Date(value) < valueRange.endExclusive);
const durationDays = (start: string, end: string) => Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / dayMs);
const median = (values: number[]) => {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};

export type ReportDelta = { absolute: number; percent: number | null };
export const reportDelta = (current: number, previous: number): ReportDelta => ({
  absolute: current - previous,
  percent: previous === 0 ? null : Math.round(((current - previous) / previous) * 100),
});

type Summary = {
  opened: number; completed: number; completionRate: number; averageDuration: number | null;
  medianDuration: number | null; customers: number; tasksCompleted: number; requestsReceived: number;
};
const summarize = (valueRange: DateRange, cases: ReportCase[], tasks: ReportTask[], requests: ReportRequest[]): Summary => {
  const opened = cases.filter((item) => inRange(item.opened_at, valueRange));
  const completed = cases.filter((item) => inRange(item.completed_at, valueRange));
  const cohortCompleted = opened.filter((item) => item.completed_at && new Date(item.completed_at) < valueRange.endExclusive);
  const durations = completed.map((item) => durationDays(item.opened_at, item.completed_at!));
  return {
    opened: opened.length,
    completed: completed.length,
    completionRate: opened.length ? Math.round((cohortCompleted.length / opened.length) * 100) : 0,
    averageDuration: durations.length ? durations.reduce((total, item) => total + item, 0) / durations.length : null,
    medianDuration: median(durations),
    customers: new Set([...opened, ...completed].map((item) => item.customer_id)).size,
    tasksCompleted: tasks.filter((item) => inRange(item.completed_at, valueRange)).length,
    requestsReceived: requests.filter((item) => inRange(item.opened_at, valueRange)).length,
  };
};

const localBucketKey = (local: string, period: ReportingPeriod) => {
  if (period.bucket === "month") return `${local.slice(0, 7)}-01`;
  if (period.bucket === "week") {
    const offset = Math.floor((Date.parse(`${local}T00:00:00Z`) - Date.parse(`${period.range.from}T00:00:00Z`)) / dayMs / 7) * 7;
    return addReportDays(period.range.from, Math.max(0, offset));
  }
  return local;
};
const bucketKey = (timestamp: string, period: ReportingPeriod) => localBucketKey(dateKey(new Date(timestamp), period.timezone), period);

export function buildOperationalReport({ organizationId, timezone, period, cases, tasks, requests, customers, capabilities, now = new Date() }: {
  organizationId: string; timezone: string; period: ReportingPeriod; cases: ReportCase[]; tasks: ReportTask[];
  requests: ReportRequest[]; customers: ReportCustomer[]; capabilities: ReportCapabilities; now?: Date;
}) {
  const scopedCases = cases.filter((item) => item.organization_id === organizationId);
  const scopedTasks = capabilities.tasks ? tasks.filter((item) => item.organization_id === organizationId) : [];
  const scopedRequests = capabilities.serviceRequests ? requests.filter((item) => item.organization_id === organizationId) : [];
  const scopedCustomers = capabilities.customers ? customers.filter((item) => item.organization_id === organizationId) : [];
  const current = summarize(period.range, scopedCases, scopedTasks, scopedRequests);
  const prior = period.previous ? summarize(period.previous, scopedCases, scopedTasks, scopedRequests) : null;
  const kpiValues = [
    ["Cases Opened", "Cases with an opening timestamp in the period", current.opened, prior?.opened, null],
    ["Cases Completed", "Cases with a completion timestamp in the period", current.completed, prior?.completed, null],
    ["Completion Rate", "Cases opened in the period and completed by period end ÷ Cases opened", current.completionRate, prior?.completionRate, null],
    ["Average Case Duration", "Mean elapsed time for Cases completed in the period", current.averageDuration, prior?.averageDuration, null],
    ["Customers Served", "Distinct customers with Case openings or completions in the period", capabilities.customers ? current.customers : null, capabilities.customers ? prior?.customers : undefined, capabilities.customers ? "/customers" : null],
    ["Tasks Completed", "Tasks with a completion timestamp in the period", capabilities.tasks ? current.tasksCompleted : null, capabilities.tasks ? prior?.tasksCompleted : undefined, null],
    ["Service Requests Received", "Requests with an opening timestamp in the period", capabilities.serviceRequests ? current.requestsReceived : null, capabilities.serviceRequests ? prior?.requestsReceived : undefined, null],
    ["Median Case Duration", "Median elapsed time for Cases completed in the period", current.medianDuration, prior?.medianDuration, null],
  ] as const;
  const kpis = kpiValues.map(([label, description, value, previous, href]) => ({ label, description, value, href, delta: prior && value !== null && previous !== undefined && previous !== null ? reportDelta(value, previous) : null }));

  const bucketMap = new Map<string, { key: string; opened: number; completed: number }>();
  for (let cursor = period.range.from; cursor <= period.range.to; cursor = addReportDays(cursor, 1)) {
    const key = localBucketKey(cursor, period);
    if (!bucketMap.has(key)) bucketMap.set(key, { key, opened: 0, completed: 0 });
  }
  const addBucket = (timestamp: string, field: "opened" | "completed") => {
    if (!inRange(timestamp, period.range)) return;
    const key = bucketKey(timestamp, period);
    const bucket = bucketMap.get(key) ?? { key, opened: 0, completed: 0 };
    bucket[field] += 1;
    bucketMap.set(key, bucket);
  };
  scopedCases.forEach((item) => { addBucket(item.opened_at, "opened"); if (item.completed_at) addBucket(item.completed_at, "completed"); });
  const caseVolume = [...bucketMap.values()].sort((left, right) => left.key.localeCompare(right.key));
  const outcome = {
    completed: scopedCases.filter((item) => inRange(item.completed_at, period.range)).length,
    closed: scopedCases.filter((item) => inRange(item.closed_at, period.range)).length,
  };
  const completedDurations = scopedCases.filter((item) => inRange(item.completed_at, period.range)).map((item) => durationDays(item.opened_at, item.completed_at!));
  const durationsByBucket = new Map<string, number[]>();
  scopedCases.filter((item) => inRange(item.completed_at, period.range)).forEach((item) => {
    const key = bucketKey(item.completed_at!, period);
    const values = durationsByBucket.get(key) ?? [];
    values.push(durationDays(item.opened_at, item.completed_at!));
    durationsByBucket.set(key, values);
  });
  const durationTrend = [...durationsByBucket].sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => ({
    key,
    average: values.reduce((total, value) => total + value, 0) / values.length,
    completed: values.length,
  }));
  const taskPeriod = scopedTasks.filter((item) => inRange(item.created_at, period.range) || inRange(item.completed_at, period.range));
  const overdueBoundary = startOfLocalDate(dateKey(now, timezone), timezone);
  const overdue = scopedTasks.filter((item) => item.due_at && new Date(item.due_at) < overdueBoundary && !["COMPLETED", "NOT_APPLICABLE"].includes(item.status));
  const taskPerformance = {
    completed: current.tasksCompleted,
    blocked: taskPeriod.filter((item) => item.status === "BLOCKED").length,
    overdue: overdue.length,
    manual: capabilities.rules ? taskPeriod.filter((item) => !item.generated_by_rule).length : null,
    generated: capabilities.rules ? taskPeriod.filter((item) => item.generated_by_rule).length : null,
  };
  const requestPerformance = {
    received: current.requestsReceived,
    resolved: scopedRequests.filter((item) => inRange(item.resolved_at, period.range)).length,
    linked: scopedRequests.filter((item) => item.case_id && (inRange(item.opened_at, period.range) || inRange(item.resolved_at, period.range))).length,
  };
  const requestBuckets = new Map(caseVolume.map((item) => [item.key, { key: item.key, received: 0, resolved: 0 }]));
  scopedRequests.forEach((item) => {
    if (inRange(item.opened_at, period.range)) {
      const key = bucketKey(item.opened_at, period);
      requestBuckets.get(key)!.received += 1;
    }
    if (inRange(item.resolved_at, period.range)) {
      const key = bucketKey(item.resolved_at!, period);
      requestBuckets.get(key)!.resolved += 1;
    }
  });
  const requestVolume = [...requestBuckets.values()];
  const customerNames = new Map(scopedCustomers.map((item) => [item.id, item.name]));
  const customerCounts = new Map<string, number>();
  scopedCases.filter((item) => inRange(item.opened_at, period.range) || inRange(item.completed_at, period.range)).forEach((item) => customerCounts.set(item.customer_id, (customerCounts.get(item.customer_id) ?? 0) + 1));
  const topCustomers = capabilities.customers ? [...customerCounts].map(([id, count]) => ({ id, label: customerNames.get(id) ?? "Customer", count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 5) : [];
  const bottlenecks = [...new Map(overdue.concat(taskPeriod.filter((item) => item.status === "BLOCKED")).map((item) => [item.title.trim().toLowerCase(), item.title])).entries()]
    .map(([key, label]) => ({ key, label, count: overdue.concat(taskPeriod.filter((item) => item.status === "BLOCKED")).filter((item) => item.title.trim().toLowerCase() === key).length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 5);
  const workDistribution = {
    assigned: taskPeriod.filter((item) => item.assigned_user_id).length,
    unassigned: taskPeriod.filter((item) => !item.assigned_user_id).length,
  };
  return { period, capabilities, kpis, caseVolume, outcome, completion: { average: current.averageDuration, median: median(completedDurations), count: completedDurations.length }, durationTrend, taskPerformance, requestPerformance, requestVolume, topCustomers, bottlenecks, workDistribution };
}
