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
      {summary.kpis.map(item=><Link className={`operations-kpi tone-${item.tone}`} href={item.href} key={item.label} aria-label={`View ${item.label.toLowerCase()}`}>
        <span className="operations-kpi-icon" aria-hidden>{iconFor(item.label)}</span>
        <span className="operations-kpi-copy"><small>{item.label}</small><strong>{item.value}</strong><span>{item.detail}</span></span>
      </Link>)}
    </section>
    <div className="operations-visuals">
      <section className="panel operations-panel">
        <div className="section-head"><div><h2>Case Progress</h2><p>Authorized cases by current workflow state</p></div><Link href="/cases">View cases →</Link></div>
        <div className="case-progress-chart" role="group" aria-label={`Case progress: ${summary.caseProgress.map(item=>`${item.label} ${item.value}`).join(", ")}`}>
          {summary.caseProgress.map(item=><Link className="case-progress-column" href={item.href} aria-label={`View ${item.label.toLowerCase()} cases`} key={item.label}>
            <div className="case-progress-plot"><strong>{item.value}</strong><i style={{height:`${item.value/maxCases*100}%`}} /></div><span>{item.label}</span>
          </Link>)}
        </div>
      </section>
      <section className="panel operations-panel">
        <div className="section-head"><div><h2>Task Status</h2><p>Current task completion and exceptions</p></div><Link href="/tasks">View tasks →</Link></div>
        <div className="task-status-layout">
          <div className="task-ring" style={{"--task-progress":`${taskCompletion*3.6}deg`} as React.CSSProperties} role="img" aria-label={`${taskCompletion}% of applicable tasks completed`}><span><strong>{taskCompletion}%</strong><small>Complete</small></span></div>
          <div className="task-status-list">
            <Link href="/tasks?status=completed" aria-label="View completed tasks"><span><i className="status-dot completed"/>Completed</span><strong>{summary.tasks.completed}</strong></Link>
            <Link href="/tasks?status=open" aria-label="View open tasks"><span><i className="status-dot open"/>Open</span><strong>{summary.tasks.open}</strong></Link>
            <Link href="/tasks?status=blocked" aria-label="View blocked tasks"><span><i className="status-dot blocked"/>Blocked</span><strong>{summary.tasks.blocked}</strong></Link>
            <Link href="/tasks?due=overdue" aria-label="View overdue tasks"><span><i className="status-dot overdue"/>Overdue</span><strong>{summary.tasks.overdue}</strong></Link>
          </div>
        </div>
      </section>
    </div>
    <div className="operations-lower">
      <section className="panel needs-attention">
        <div className="section-head attention-heading"><span className="attention-heading-icon" aria-hidden>!</span><div><h2>Needs Attention</h2><p>Deterministic signals from current operational data</p></div></div>
        {summary.attention.length?<div className="attention-list">{summary.attention.map(item=><Link href={item.href} key={item.label}><i className={`attention-marker tone-${item.tone}`} aria-hidden/><span><strong>{item.label}</strong><small>Open the related workspace</small></span><b>{item.value}</b><em aria-hidden>→</em></Link>)}</div>:<div className="dashboard-healthy"><span aria-hidden>✓</span><div><strong>Nothing requires immediate attention</strong><p>No overdue, due-today, unassigned, awaiting-response, or unread signals are currently visible.</p></div></div>}
      </section>
      <section className="panel recent-activity">
        <div className="section-head"><div><h2>Recent Activity</h2><p>Latest authorized case workflow changes</p></div><Link href="/cases">View all →</Link></div>
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
