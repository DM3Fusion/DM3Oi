import Link from "next/link";
import type { LiveOrganizationData } from "@/lib/data/case-repository";
import { displayName } from "@/lib/data/case-repository";
import { formatActivity } from "@/lib/activity-format";
import { getOperationalDashboardMetrics } from "@/lib/live-dashboard-metrics";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";

const iconFor=(label:string)=>({"Active Cases":"▤","Open Tasks":"✓","Due Today":"◷","Open Service Requests":"⌁","Unread Communications":"●","Customers":"◎"}[label]??"•");

export function Dashboard({data,unreadCommunications}:{data:LiveOrganizationData;unreadCommunications:number}){
  const summary=getOperationalDashboardMetrics(data.cases,data.serviceRequests,data.customers.length,unreadCommunications,data.timezone);
  const maxCases=Math.max(1,...summary.caseProgress.map(item=>item.value));
  const taskCompletion=summary.tasks.total?Math.round((summary.tasks.completed/summary.tasks.total)*100):0;
  return <div className="operations-dashboard">
    <section className="operations-kpis" aria-label="Operational summary">
      {summary.kpis.map(item=><Link className={`operations-kpi tone-${item.tone}`} href={item.href} key={item.label}>
        <span className="operations-kpi-icon" aria-hidden>{iconFor(item.label)}</span>
        <span className="operations-kpi-copy"><small>{item.label}</small><strong>{item.value}</strong><span>{item.detail}</span></span>
      </Link>)}
    </section>
    <div className="operations-visuals">
      <section className="panel operations-panel">
        <div className="section-head"><div><h2>Work Progress</h2><p>Authorized cases by current workflow state</p></div><Link href="/cases">View cases →</Link></div>
        <div className="progress-distribution">
          {summary.caseProgress.map(item=><div className="progress-distribution-row" key={item.label}>
            <span>{item.label}</span><div className="distribution-track"><i style={{width:`${item.value/maxCases*100}%`}} /></div><strong>{item.value}</strong>
          </div>)}
        </div>
      </section>
      <section className="panel operations-panel">
        <div className="section-head"><div><h2>Task Status</h2><p>Current task completion and exceptions</p></div><Link href="/tasks">View tasks →</Link></div>
        <div className="task-status-layout">
          <div className="task-ring" style={{"--task-progress":`${taskCompletion*3.6}deg`} as React.CSSProperties} role="img" aria-label={`${taskCompletion}% of applicable tasks completed`}><span><strong>{taskCompletion}%</strong><small>Complete</small></span></div>
          <dl className="task-status-list">
            <div><dt><i className="status-dot completed"/>Completed</dt><dd>{summary.tasks.completed}</dd></div>
            <div><dt><i className="status-dot open"/>Open</dt><dd>{summary.tasks.open}</dd></div>
            <div><dt><i className="status-dot blocked"/>Blocked</dt><dd>{summary.tasks.blocked}</dd></div>
            <div><dt><i className="status-dot overdue"/>Overdue</dt><dd>{summary.tasks.overdue}</dd></div>
          </dl>
        </div>
      </section>
    </div>
    <div className="operations-lower">
      <section className="panel needs-attention">
        <div className="section-head"><div><span className="attention-label">Priority view</span><h2>Needs Attention</h2><p>Deterministic signals from current operational data</p></div></div>
        {summary.attention.length?<div className="attention-list">{summary.attention.map(item=><Link href={item.href} key={item.label}><i className={`attention-marker tone-${item.tone}`} aria-hidden/><span><strong>{item.label}</strong><small>Open the related workspace</small></span><b>{item.value}</b><em aria-hidden>→</em></Link>)}</div>:<div className="dashboard-healthy"><span aria-hidden>✓</span><div><strong>Nothing requires immediate attention</strong><p>No overdue, due-today, unassigned, awaiting-response, or unread signals are currently visible.</p></div></div>}
      </section>
      <section className="panel recent-activity">
        <div className="section-head"><div><h2>Recent Activity</h2><p>Latest authorized case workflow changes</p></div><Link href="/cases">View cases →</Link></div>
        {data.activities.length?<div className="activity-list">{data.activities.slice(0,8).map(activity=><Link href={`/cases/${activity.case_id}`} key={activity.id}>
          <span className={`activity-dot ${activity.event_type.toLowerCase()}`} aria-hidden>{activity.event_type.includes("COMPLETED")?"✓":"•"}</span>
          <span className="activity-copy"><strong>{formatActivity(activity.event_type,activity.event_data)}</strong><small>{activity.caseNumber} · {displayName(activity.actor)}</small></span>
          <time dateTime={activity.created_at}>{formatOrganizationDateTime(activity.created_at,data.timezone)}</time>
        </Link>)}</div>:<div className="no-results">No case activity yet.</div>}
      </section>
    </div>
    {/* Future Operational Pulse insights belong below the deterministic dashboard summary. */}
  </div>;
}
