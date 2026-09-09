import type { LiveCase } from "@/lib/data/case-repository";
import type { LiveServiceRequest } from "@/lib/data/case-repository";
import { startOfOrganizationDay } from "@/lib/organization-timezone";
import { isOpenTask } from "@/lib/operational-filters";
const terminal=new Set(["COMPLETED","CLOSED","CANCELLED"]);
export const isLiveCaseOverdue=(item:LiveCase,now=new Date())=>Boolean(item.due_at&&new Date(item.due_at)<now&&!terminal.has(item.status));
export const isLiveCaseDueSoon=(item:LiveCase,now=new Date())=>{if(!item.due_at||terminal.has(item.status))return false;const due=new Date(item.due_at);const end=new Date(now);end.setDate(end.getDate()+3);end.setHours(23,59,59,999);return due>=now&&due<=end;};
export const isLiveCaseActive=(item:LiveCase)=>!terminal.has(item.status);
export function getLiveDashboardMetrics(cases:LiveCase[],now=new Date()){return[{label:"Total Cases",value:cases.length,tone:"blue"},{label:"In Progress",value:cases.filter(c=>c.status==="IN_PROGRESS").length,tone:"cyan"},{label:"Completed",value:cases.filter(c=>c.status==="COMPLETED"||c.status==="CLOSED").length,tone:"green"},{label:"Unassigned",value:cases.filter(c=>c.status==="UNASSIGNED"||(!c.manager_user_id&&!c.assignedStaff.length)).length,tone:"amber"},{label:"Overdue",value:cases.filter(c=>isLiveCaseOverdue(c,now)).length,tone:"red"},{label:"In Review",value:cases.filter(c=>c.status==="REVIEW").length,tone:"violet"},{label:"Waiting",value:cases.filter(c=>c.status==="WAITING").length,tone:"slate"},{label:"Due Soon",value:cases.filter(c=>isLiveCaseDueSoon(c,now)).length,tone:"orange"}] as const;}
export const isLiveServiceRequestActive=(item:LiveServiceRequest)=>["NEW","OPEN","PENDING_CUSTOMER","PENDING_STAFF","ON_HOLD"].includes(item.status as string);
export function getServiceRequestMetrics(items:LiveServiceRequest[]){const active=items.filter(isLiveServiceRequestActive);return [{label:"Urgent",value:active.filter(item=>item.priority==="URGENT").length,tone:"red",href:"/service-desk/requests?priority=URGENT"},{label:"Open",value:active.length,tone:"blue",href:"/service-desk/requests?status=open"},{label:"New",value:items.filter(item=>item.status==="NEW").length,tone:"cyan",href:"/service-desk/requests?status=NEW"},{label:"Waiting on Customer",value:items.filter(item=>item.status==="PENDING_CUSTOMER").length,tone:"amber",href:"/service-desk/requests?status=PENDING_CUSTOMER"},{label:"On Hold",value:items.filter(item=>(item.status as string)==="ON_HOLD").length,tone:"slate",href:"/service-desk/requests?status=ON_HOLD"},{label:"Unassigned",value:active.filter(item=>!item.assigned_user_id).length,tone:"orange",href:"/service-desk/requests?assignment=unassigned"},{label:"Resolved",value:items.filter(item=>["RESOLVED","CLOSED"].includes(item.status)).length,tone:"green",href:"/service-desk/requests?status=resolved"},{label:"Total Requests",value:items.length,tone:"violet",href:"/service-desk/requests"}] as const;}

export function getOperationalDashboardMetrics(cases:LiveCase[],serviceRequests:LiveServiceRequest[],customers:number,unreadCommunications:number,timezone:string,now=new Date()){
  const tasks=cases.flatMap(item=>item.tasks);
  const dayStart=startOfOrganizationDay(now,timezone);
  const nextDay=startOfOrganizationDay(new Date(dayStart.getTime()+36*60*60*1000),timezone);
  const dueToday=tasks.filter(task=>task.due_at&&isOpenTask(task)&&new Date(task.due_at)>=dayStart&&new Date(task.due_at)<nextDay).length;
  const overdueTasks=tasks.filter(task=>task.due_at&&isOpenTask(task)&&new Date(task.due_at)<dayStart).length;
  const openTasks=tasks.filter(isOpenTask).length;
  const completedTasks=tasks.filter(task=>task.status==="COMPLETED").length;
  const blockedTasks=tasks.filter(task=>task.status==="BLOCKED").length;
  const activeCases=cases.filter(isLiveCaseActive).length;
  const openRequests=serviceRequests.filter(isLiveServiceRequestActive).length;
  const unassignedRequests=serviceRequests.filter(item=>isLiveServiceRequestActive(item)&&!item.assigned_user_id).length;
  const awaitingStaff=serviceRequests.filter(item=>item.status==="PENDING_STAFF").length;
  return {
    kpis:[
      {label:"Active Cases",value:activeCases,href:"/cases?status=active",detail:"Current authorized caseload",tone:"blue"},
      {label:"Open Tasks",value:openTasks,href:"/tasks?status=open",detail:"Not completed or excluded",tone:"cyan"},
      {label:"Due Today",value:dueToday,href:"/tasks?due=today",detail:"Organization-local date",tone:dueToday?"amber":"slate"},
      {label:"Open Service Requests",value:openRequests,href:"/service-desk/requests?status=open",detail:"Active Service Desk workload",tone:"violet"},
      {label:"Unread Communications",value:unreadCommunications,href:"/communications?status=unread",detail:"Your unread notifications",tone:unreadCommunications?"red":"slate"},
      {label:"Customers",value:customers,href:"/customers",detail:"Visible organization records",tone:"green"},
    ],
    caseProgress:[
      {label:"New",value:cases.filter(item=>item.status==="NEW").length,href:"/cases?status=new"},
      {label:"Assigned",value:cases.filter(item=>["UNASSIGNED","ASSIGNED"].includes(item.status)).length,href:"/cases?status=assigned"},
      {label:"In Progress",value:cases.filter(item=>["IN_PROGRESS","REVIEW"].includes(item.status)).length,href:"/cases?status=in-progress"},
      {label:"Waiting",value:cases.filter(item=>item.status==="WAITING").length,href:"/cases?status=waiting"},
      {label:"Completed",value:cases.filter(item=>["COMPLETED","CLOSED"].includes(item.status)).length,href:"/cases?status=completed"},
    ],
    tasks:{total:tasks.filter(task=>task.status!=="NOT_APPLICABLE").length,completed:completedTasks,open:openTasks,blocked:blockedTasks,overdue:overdueTasks},
    attention:[
      {label:"Overdue tasks",value:overdueTasks,href:"/tasks?due=overdue",tone:"red"},
      {label:"Tasks due today",value:dueToday,href:"/tasks?due=today",tone:"amber"},
      {label:"Unassigned service requests",value:unassignedRequests,href:"/service-desk/requests?assignment=unassigned",tone:"orange"},
      {label:"Requests awaiting staff response",value:awaitingStaff,href:"/service-desk/requests?status=PENDING_STAFF",tone:"blue"},
      {label:"Unread communications",value:unreadCommunications,href:"/communications?status=unread",tone:"violet"},
    ].filter(item=>item.value>0),
  } as const;
}
