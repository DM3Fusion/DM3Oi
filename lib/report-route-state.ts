const reportPeriods = new Set([
  "7d",
  "30d",
  "90d",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "custom",
]);
const reachStatuses = new Set(["mapped", "empty", "error"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export type ReportRouteState = {
  period?: string;
  compare?: string;
  from?: string;
  to?: string;
  reach?: string;
};

export function buildReportRouteHref(pathname: "/reports" | "/reports/unmapped-customers", state: ReportRouteState) {
  const params = new URLSearchParams();
  if (state.period && reportPeriods.has(state.period)) params.set("period", state.period);
  if (state.compare === "none" || state.compare === "previous") params.set("compare", state.compare);
  if (state.from && datePattern.test(state.from)) params.set("from", state.from);
  if (state.to && datePattern.test(state.to)) params.set("to", state.to);
  if (state.reach && reachStatuses.has(state.reach)) params.set("reach", state.reach);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}
