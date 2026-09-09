import Link from "next/link";
import type { OperationalReport } from "@/lib/data/reports-repository";
import { reportPeriodKeys, reportPeriodLabels } from "@/lib/reporting";

const formatDays = (value: number | null) => value === null ? "—" : `${value.toFixed(value < 10 ? 1 : 0)} days`;
const formatKpi = (label: string, value: number | null) => {
  if (value === null) return "Restricted";
  if (label.includes("Rate")) return `${Math.round(value)}%`;
  if (label.includes("Duration")) return formatDays(value);
  return value.toLocaleString("en-US");
};
const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const deltaText = (label: string, delta: { absolute: number; percent: number | null }) => {
  const sign = delta.absolute > 0 ? "+" : "";
  const amount = Number.isInteger(delta.absolute) ? delta.absolute : delta.absolute.toFixed(1);
  const unit = label.includes("Rate") ? " points" : label.includes("Duration") ? " days" : "";
  return `${sign}${amount}${unit}${delta.percent === null ? "" : ` (${delta.percent > 0 ? "+" : ""}${delta.percent}%)`} vs previous`;
};

function BarList({ rows, empty }: { rows: Array<{ key: string; label: string; value: number }>; empty: string }) {
  const maximum = Math.max(1, ...rows.map((item) => item.value));
  return rows.some((item) => item.value > 0) ? <div className="report-bars" role="list">{rows.map((item) => <div key={item.key} role="listitem"><span>{item.label}</span><i aria-hidden><b style={{ width: `${item.value / maximum * 100}%` }} /></i><strong>{item.value}</strong></div>)}</div> : <div className="no-results">{empty}</div>;
}

function CompactTrend({ label, rows }: { label: string; rows: Array<{ key: string; primary: string; secondary?: string }> }) {
  return rows.length ? <div className="report-compact-trend" role="list" aria-label={label}>{rows.map((item) => <div key={item.key} role="listitem"><span>{item.key}</span><strong>{item.primary}</strong>{item.secondary ? <small>{item.secondary}</small> : null}</div>)}</div> : <div className="no-results">No trend is available for this period.</div>;
}

export function ReportsDashboard({ report }: { report: OperationalReport }) {
  const { period, capabilities } = report;
  const maximumVolume = Math.max(1, ...report.caseVolume.flatMap((item) => [item.opened, item.completed]));
  return <div className="reports-dashboard">
    <form className="report-controls panel" method="get">
      <label><span>Reporting period</span><select name="period" defaultValue={period.key}>{reportPeriodKeys.map((key) => <option key={key} value={key}>{reportPeriodLabels[key]}</option>)}</select></label>
      <label><span>Comparison</span><select name="compare" defaultValue={period.comparison}><option value="none">No comparison</option><option value="previous">Previous equivalent period</option></select></label>
      <label className="report-custom-date"><span>From</span><input type="date" name="from" defaultValue={period.key === "custom" ? period.range.from : ""} /></label>
      <label className="report-custom-date"><span>To</span><input type="date" name="to" defaultValue={period.key === "custom" ? period.range.to : ""} /></label>
      <button className="primary-button" type="submit">Apply</button>
    </form>
    <div className="report-period-summary"><strong>{period.label}</strong><span>{formatDate(period.range.from)}–{formatDate(period.range.to)} · {period.timezone} · {period.bucket === "day" ? "Daily" : period.bucket === "week" ? "Weekly" : "Monthly"} buckets</span></div>

    {!capabilities.cases ? <section className="panel"><div className="no-results">Case performance requires Case access.</div></section> : <>
      <section className="report-kpis" aria-label="Historical performance summary">{report.kpis.map((kpi) => {
        const content = <><small>{kpi.label}</small><strong>{formatKpi(kpi.label, kpi.value)}</strong><em>{kpi.description}</em>{kpi.delta ? <span className={kpi.delta.absolute > 0 ? "delta-up" : kpi.delta.absolute < 0 ? "delta-down" : "delta-flat"}>{deltaText(kpi.label, kpi.delta)}</span> : <span>{period.comparison === "previous" ? "No comparable value" : "Selected period"}</span>}</>;
        return kpi.href ? <Link className="report-kpi" href={kpi.href} key={kpi.label}>{content}</Link> : <div className="report-kpi" key={kpi.label}>{content}</div>;
      })}</section>

      <div className="report-grid">
        <section className="panel report-panel report-wide"><div className="section-head"><div><h2>Case Volume</h2><p>Cases opened and completed by {period.bucket}</p></div></div>{report.caseVolume.some((item) => item.opened || item.completed) ? <div className="report-volume-chart" role="img" aria-label={report.caseVolume.map((item) => `${item.key}: ${item.opened} opened, ${item.completed} completed`).join("; ")}>{report.caseVolume.map((item) => <div key={item.key}><div><i className="opened" style={{ height: `${item.opened ? Math.max(3, item.opened / maximumVolume * 100) : 0}%` }} title={`${item.opened} opened`} /><i className="completed" style={{ height: `${item.completed ? Math.max(3, item.completed / maximumVolume * 100) : 0}%` }} title={`${item.completed} completed`} /></div><span>{item.key}</span><small>O {item.opened} · C {item.completed}</small></div>)}</div> : <div className="no-results">No Case volume was recorded in this period.</div>}<div className="report-legend"><span><i className="opened" />Opened</span><span><i className="completed" />Completed</span></div><p className="report-note">An active-workload trend is omitted because historical status transitions are not stored.</p></section>
        <section className="panel report-panel"><div className="section-head"><div><h2>Case Outcomes</h2><p>Timestamped terminal outcomes in period</p></div></div><BarList rows={[{ key: "completed", label: "Completed", value: report.outcome.completed }, { key: "closed", label: "Closed", value: report.outcome.closed }]} empty="No timestamped Case outcomes in this period." /><p className="report-note">Cancellation history cannot be reconstructed because no cancellation timestamp is stored.</p></section>
      </div>

      <div className="report-grid report-three">
        <section className="panel report-panel"><div className="section-head"><div><h2>Completion Performance</h2><p>Completed Case duration</p></div></div><dl className="report-stat-list"><div><dt>Average</dt><dd>{formatDays(report.completion.average)}</dd></div><div><dt>Median</dt><dd>{formatDays(report.completion.median)}</dd></div><div><dt>Completed sample</dt><dd>{report.completion.count}</dd></div></dl><h3 className="report-subheading">Duration trend</h3><CompactTrend label="Average Case completion duration by period bucket" rows={report.durationTrend.map((item) => ({ key: item.key, primary: formatDays(item.average), secondary: `${item.completed} completed` }))} /></section>
        <section className="panel report-panel"><div className="section-head"><div><h2>Task Performance</h2><p>Authorized Task activity and current exceptions</p></div>{capabilities.tasks ? <Link href="/tasks?due=overdue">View overdue →</Link> : null}</div>{capabilities.tasks ? <BarList rows={[{ key: "completed", label: "Completed", value: report.taskPerformance.completed }, { key: "blocked", label: "Blocked", value: report.taskPerformance.blocked }, { key: "overdue", label: "Currently overdue", value: report.taskPerformance.overdue }]} empty="No Task activity in this period." /> : <div className="no-results">Task reporting requires Task access.</div>}{capabilities.tasks && capabilities.rules ? <p className="report-note">{report.taskPerformance.manual} manual · {report.taskPerformance.generated} Rule-generated Tasks in scope</p> : null}</section>
        <section className="panel report-panel"><div className="section-head"><div><h2>Service Requests</h2><p>Intake and resolution throughput</p></div></div>{capabilities.serviceRequests ? <><BarList rows={[{ key: "received", label: "Received", value: report.requestPerformance.received }, { key: "resolved", label: "Resolved", value: report.requestPerformance.resolved }, { key: "linked", label: "Currently linked", value: report.requestPerformance.linked }]} empty="No Service Request activity in this period." /><h3 className="report-subheading">Throughput trend</h3><CompactTrend label="Service Request throughput by period bucket" rows={report.requestVolume.filter((item) => item.received || item.resolved).map((item) => ({ key: item.key, primary: `${item.received} received`, secondary: `${item.resolved} resolved` }))} /></> : <div className="no-results">Service Request reporting requires Service Desk access.</div>}</section>
      </div>

      <div className="report-grid report-three">
        <section className="panel report-panel"><div className="section-head"><div><h2>Customer Activity</h2><p>Customers with Case activity</p></div>{capabilities.customers ? <Link href="/customers">View Customers →</Link> : null}</div>{capabilities.customers ? <BarList rows={report.topCustomers.map((item) => ({ key: item.id, label: item.label, value: item.count }))} empty="No customer Case activity in this period." /> : <div className="no-results">Customer reporting requires Customer access.</div>}</section>
        <section className="panel report-panel"><div className="section-head"><div><h2>Operational Bottlenecks</h2><p>Current blocked or overdue Task patterns in period scope</p></div>{capabilities.tasks ? <Link href="/tasks?status=blocked">View blocked →</Link> : null}</div>{capabilities.tasks ? <BarList rows={report.bottlenecks.map((item) => ({ key: item.key, label: item.label, value: item.count }))} empty="No blocked or overdue Task patterns in scope." /> : <div className="no-results">Bottleneck detail requires Task access.</div>}</section>
        <section className="panel report-panel"><div className="section-head"><div><h2>Work Distribution</h2><p>Current assignment coverage for Tasks in period scope</p></div></div>{capabilities.tasks ? <BarList rows={[{ key: "assigned", label: "Assigned", value: report.workDistribution.assigned }, { key: "unassigned", label: "Unassigned", value: report.workDistribution.unassigned }]} empty="No Tasks are available for distribution reporting." /> : <div className="no-results">Work distribution requires Task access.</div>}<p className="report-note">Historical assignee changes are not stored; this section uses current assignment only.</p></section>
      </div>
      <p className="report-limitations">Historical readiness, Question response state, and historical Rule truth are not reconstructed because point-in-time snapshots are not stored. Readiness remains a current-state calculation, and Rule provenance appears only when VIEW_RULES is available.</p>
    </>}
  </div>;
}
