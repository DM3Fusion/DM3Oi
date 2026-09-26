import Link from "next/link";
import type { LiveOrganizationData } from "@/lib/data/case-repository";
import { displayName } from "@/lib/data/case-repository";
import { formatActivity } from "@/lib/activity-format";
import { getOperationalDashboardMetrics } from "@/lib/live-dashboard-metrics";
import { formatOrganizationDateTime } from "@/lib/organization-timezone";
import { CasesNeedingAttention, OperationalIntelligenceSection } from "@/components/dashboard/operational-intelligence";
import type { AuthorizedOperationalIntelligence } from "@/lib/data/operational-intelligence-repository";
import { ApplicationIcon } from "@/components/application-icon";

function AttentionSummaryRing({items}:{items:ReadonlyArray<{value:number;tone:string}>}){
  const total=items.reduce((sum,item)=>sum+item.value,0);
  const segments=items.map((item,index)=>{
    const percent=total?(item.value/total)*100:0;
    const offset=total?items.slice(0,index).reduce((sum,preceding)=>sum+preceding.value,0)/total*100:0;
    return {...item,percent,offset};
  });
  return <div className="attention-summary-ring" role="img" aria-label={`${total} current attention items`}>
    <svg viewBox="0 0 42 42" aria-hidden="true" focusable="false">
      <circle className="attention-ring-track" cx="21" cy="21" r="16" pathLength="100" />
      {segments.map((segment,index)=><circle className={`attention-ring-segment tone-${segment.tone}`} cx="21" cy="21" r="16" pathLength="100" strokeDasharray={`${segment.percent} ${100-segment.percent}`} strokeDashoffset={-segment.offset} key={`${segment.tone}-${index}`} />)}
    </svg>
    <span><strong>{total}</strong><small>Items</small></span>
  </div>;
}

export function Dashboard({data,unreadCommunications,intelligence}:{data:LiveOrganizationData;unreadCommunications:number;intelligence:AuthorizedOperationalIntelligence|null}){
  const summary=getOperationalDashboardMetrics(data.cases,data.serviceRequests,data.customers,unreadCommunications,data.timezone);
  const maxCases=Math.max(1,...summary.caseProgress.map(item=>item.value));
  const taskCompletion=summary.tasks.total?Math.round((summary.tasks.completed/summary.tasks.total)*100):0;
  return <div className="operations-dashboard">
    <section className="operations-kpis" aria-label="Action and workload summary">
      {summary.actionKpis.map(item=><Link className={`operations-kpi tone-${item.tone}`} href={item.href} key={item.label} aria-label={`View ${item.label.toLowerCase()}`}>
        <span className="operations-kpi-label">{item.label}</span>
        <strong>{item.value}</strong>
      </Link>)}
    </section>
    <section className="operations-kpis customer-kpis" aria-label="Customer summary">
      {summary.customerKpis.map(item=><Link className={`operations-kpi tone-${item.tone}`} href={item.href} key={item.label} aria-label={`View ${item.label.toLowerCase()}`}>
        <span className="operations-kpi-label">{item.label}</span>
        <strong>{item.value}</strong>
        <small>{item.detail}</small>
      </Link>)}
    </section>
    <div className="operations-visuals">
      <section className="panel operations-panel">
        <div className="section-head"><h2>Case Progress</h2><Link href="/cases">View cases <ApplicationIcon name="forward" /></Link></div>
        <div className="case-progress-chart" role="group" aria-label={`Case progress: ${summary.caseProgress.map(item=>`${item.label} ${item.value}`).join(", ")}`}>
          {summary.caseProgress.map(item=><Link className="case-progress-column" href={item.href} aria-label={`View ${item.label.toLowerCase()} cases`} key={item.label}>
            <div className="case-progress-plot"><strong>{item.value}</strong><i style={{height:`${item.value/maxCases*100}%`}} /></div><span>{item.label}</span>
          </Link>)}
        </div>
      </section>
      <section className="panel operations-panel">
        <div className="section-head"><h2>Task Status</h2><Link href="/tasks">View tasks <ApplicationIcon name="forward" /></Link></div>
        <div className="task-status-layout">
          <div className="task-ring" style={{"--task-progress":`${taskCompletion*3.6}deg`} as React.CSSProperties} role="img" aria-label={`${taskCompletion}% of applicable tasks completed`}><span><strong>{taskCompletion}%</strong><small>Complete</small></span></div>
          <div className="task-status-list">
            <Link href="/tasks?status=completed" aria-label="View completed tasks"><span><ApplicationIcon name="completed" className="status-icon completed"/>Completed</span><strong>{summary.tasks.completed}</strong></Link>
            <Link href="/tasks?status=open" aria-label="View open tasks"><span><ApplicationIcon name="status" className="status-icon open"/>Open</span><strong>{summary.tasks.open}</strong></Link>
            <Link href="/tasks?status=blocked" aria-label="View blocked tasks"><span><ApplicationIcon name="blocked" className="status-icon blocked"/>Blocked</span><strong>{summary.tasks.blocked}</strong></Link>
            <Link href="/tasks?due=overdue" aria-label="View overdue tasks"><span><ApplicationIcon name="overdue" className="status-icon overdue"/>Overdue</span><strong>{summary.tasks.overdue}</strong></Link>
          </div>
        </div>
      </section>
    </div>
    <div className="operations-lower">
      <section className={`panel needs-attention${summary.attention.length ? " has-attention-summary" : ""}`}>
        <div className={`section-head attention-heading${summary.attention.length ? " attention-summary-heading" : ""}`}>
          {summary.attention.length ? <AttentionSummaryRing items={summary.attention} /> : <span className="attention-heading-icon"><ApplicationIcon name="warning" /></span>}
          <h2>All Needing Attention</h2>
        </div>
        {summary.attention.length?<div className="attention-summary-layout"><div className="attention-list">{summary.attention.map(item=><Link href={item.href} key={item.label}><i className={`attention-marker tone-${item.tone}`} aria-hidden/><span><strong>{item.label}</strong></span><b>{item.value}</b><em><ApplicationIcon name="forward" /></em></Link>)}</div></div>:<div className="dashboard-healthy"><span><ApplicationIcon name="completed" /></span><div><strong>Nothing requires immediate attention</strong><p>No overdue, due-today, unassigned, awaiting-response, or unread signals are currently visible.</p></div></div>}
      </section>
      {intelligence ? <OperationalIntelligenceSection intelligence={intelligence} /> : null}
      {intelligence ? <CasesNeedingAttention intelligence={intelligence} /> : null}
      <section className="panel recent-activity">
        <div className="section-head"><h2>Recent Activity</h2><Link href="/cases">View all <ApplicationIcon name="forward" /></Link></div>
        {data.activities.length?<div className="activity-list">{data.activities.slice(0,8).map(activity=><Link href={`/cases/${activity.case_id}`} key={activity.id}>
          <span className={`activity-dot ${activity.event_type.toLowerCase()}`}>{activity.event_type.includes("COMPLETED")?<ApplicationIcon name="completed" />:<ApplicationIcon name="status" />}</span>
          <span className="activity-copy"><strong>{formatActivity(activity.event_type,activity.event_data)}</strong><small>{activity.caseNumber} · {displayName(activity.actor)}</small></span>
          <time dateTime={activity.created_at}>{formatOrganizationDateTime(activity.created_at,data.timezone)}</time>
        </Link>)}</div>:<div className="no-results">No case activity yet.</div>}
      </section>
    </div>
  </div>;
}
