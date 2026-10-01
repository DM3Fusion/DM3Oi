import type { LiveCase } from "./data/case-repository.ts";
import type { LiveServiceRequest } from "./data/case-repository.ts";
import { isCanonicalCompletedCaseStatus, isIncompleteCompatibilityCaseStatus } from "./case-lifecycle.ts";
import { startOfOrganizationDay } from "./organization-timezone.ts";
import { isOpenTask } from "./operational-filters.ts";
import { getCustomerTenureMetrics } from "./customer-tenure.ts";
export const isLiveCaseOverdue=(item:LiveCase,now=new Date())=>Boolean(item.due_at&&new Date(item.due_at)<now&&isIncompleteCompatibilityCaseStatus(item.status));
export const isLiveCaseDueSoon=(item:LiveCase,now=new Date())=>{if(!item.due_at||!isIncompleteCompatibilityCaseStatus(item.status))return false;const due=new Date(item.due_at);const end=new Date(now);end.setDate(end.getDate()+3);end.setHours(23,59,59,999);return due>=now&&due<=end;};
export const isLiveCaseActive=(item:LiveCase)=>isIncompleteCompatibilityCaseStatus(item.status);
export function getLiveDashboardMetrics(cases:LiveCase[],now=new Date()){return[{label:"Total Cases",value:cases.length,tone:"blue"},{label:"In Progress",value:cases.filter(c=>c.status==="IN_PROGRESS").length,tone:"cyan"},{label:"Completed",value:cases.filter(c=>isCanonicalCompletedCaseStatus(c.status)).length,tone:"green"},{label:"Unassigned",value:cases.filter(c=>c.status==="UNASSIGNED"||(!c.manager_user_id&&!c.assignedStaff.length)).length,tone:"amber"},{label:"Overdue",value:cases.filter(c=>isLiveCaseOverdue(c,now)).length,tone:"red"},{label:"In Review",value:cases.filter(c=>c.status==="REVIEW").length,tone:"violet"},{label:"Waiting",value:cases.filter(c=>c.status==="WAITING").length,tone:"slate"},{label:"Due Soon",value:cases.filter(c=>isLiveCaseDueSoon(c,now)).length,tone:"orange"}] as const;}
export const isLiveServiceRequestActive=(item:LiveServiceRequest)=>["NEW","OPEN","PENDING_CUSTOMER","PENDING_STAFF","ON_HOLD"].includes(item.status as string);
export function getServiceRequestMetrics(items:LiveServiceRequest[]){const active=items.filter(isLiveServiceRequestActive);return [{label:"Urgent",value:active.filter(item=>item.priority==="URGENT").length,tone:"red",href:"/service-desk/requests?priority=URGENT"},{label:"Open",value:active.length,tone:"blue",href:"/service-desk/requests?status=open"},{label:"New",value:items.filter(item=>item.status==="NEW").length,tone:"cyan",href:"/service-desk/requests?status=NEW"},{label:"Waiting on Customer",value:items.filter(item=>item.status==="PENDING_CUSTOMER").length,tone:"amber",href:"/service-desk/requests?status=PENDING_CUSTOMER"},{label:"On Hold",value:items.filter(item=>(item.status as string)==="ON_HOLD").length,tone:"slate",href:"/service-desk/requests?status=ON_HOLD"},{label:"Unassigned",value:active.filter(item=>!item.assigned_user_id).length,tone:"orange",href:"/service-desk/requests?assignment=unassigned"},{label:"Resolved",value:items.filter(item=>["RESOLVED","CLOSED"].includes(item.status)).length,tone:"green",href:"/service-desk/requests?status=resolved"},{label:"Total Requests",value:items.length,tone:"violet",href:"/service-desk/requests"}] as const;}

export function getOperationalDashboardMetrics(cases:LiveCase[],serviceRequests:LiveServiceRequest[],customers:Array<{id:string}>,unreadCommunications:number,timezone:string,now=new Date()){
  const tasks=cases.flatMap(item=>item.tasks);
  const dayStart=startOfOrganizationDay(now,timezone);
  const nextDay=startOfOrganizationDay(new Date(dayStart.getTime()+36*60*60*1000),timezone);
  const dueToday=tasks.filter(task=>task.due_at&&isOpenTask(task)&&new Date(task.due_at)>=dayStart&&new Date(task.due_at)<nextDay).length;
  const overdueTasks=tasks.filter(task=>task.due_at&&isOpenTask(task)&&new Date(task.due_at)<dayStart).length;
  const openTasks=tasks.filter(isOpenTask).length;
  const completedTasks=tasks.filter(task=>task.status==="COMPLETED").length;
  const waitingOnCustomerTasks=tasks.filter(task=>task.status==="WAITING_ON_CUSTOMER").length;
  const openCases=cases.filter(isLiveCaseActive).length;
  const openRequests=serviceRequests.filter(isLiveServiceRequestActive).length;
  const unassignedRequests=serviceRequests.filter(item=>isLiveServiceRequestActive(item)&&!item.assigned_user_id).length;
  const awaitingStaff=serviceRequests.filter(item=>item.status==="PENDING_STAFF").length;
  const customerMetrics=getCustomerTenureMetrics(customers,cases);
  const activeCaseCustomerIds=new Set(
    cases.filter(isLiveCaseActive).map(item=>item.customer_id),
  );
  const customersWithoutActiveCase=customers.filter(
    customer=>!activeCaseCustomerIds.has(customer.id),
  ).length;
  return {
    actionKpis:[
      {label:"Due Today",value:dueToday,href:"/tasks?due=today",detail:"Organization-local date",tone:dueToday?"amber":"slate"},
      {label:"Open Cases",value:openCases,href:"/cases?status=active",detail:"Open lifecycle statuses",tone:"blue"},
      {label:"Open Tasks",value:openTasks,href:"/tasks?status=open",detail:"Not completed or excluded",tone:"cyan"},
      {label:"Open Requests",value:openRequests,href:"/service-desk/requests?status=open",detail:"Active Service Desk workload",tone:"violet"},
    ],
    customerKpis:[
      {
        label:"Tax-Year Case Coverage",
        value:customerMetrics.currentTaxYearCustomers
          ? Math.round(
              cases.filter(item=>item.tax_year===customerMetrics.currentTaxYear).length
              / customerMetrics.currentTaxYearCustomers
              * 100,
            )
          : 0,
        valueSuffix:"%",
        href:"/cases",
        detail:customerMetrics.currentTaxYear
          ? `${cases.filter(item=>item.tax_year===customerMetrics.currentTaxYear).length} Cases / ${customerMetrics.currentTaxYearCustomers} Customers · ${customerMetrics.currentTaxYear}`
          : "No tax-year Case data",
        tone:
          customerMetrics.currentTaxYearCustomers &&
          cases.filter(item=>item.tax_year===customerMetrics.currentTaxYear).length >
            customerMetrics.currentTaxYearCustomers
            ? "red"
            : "blue",
      },
      {label:"Current Tax-Year Customers",value:customerMetrics.currentTaxYearCustomers,href:"/customers",detail:customerMetrics.currentTaxYear?String(customerMetrics.currentTaxYear):"No tax-year Case data",tone:"cyan"},
      {label:"Prior Tax-Year Customers",value:customerMetrics.priorTaxYearCustomers,href:"/customers",detail:customerMetrics.priorTaxYear?String(customerMetrics.priorTaxYear):"No tax-year Case data",tone:"slate"},
      {label:"Repeat Customers",value:customerMetrics.repeatCustomers,href:"/customers",detail:"Served in adjacent tax years",tone:"violet"},
      {label:"New Customers",value:customerMetrics.newCustomers,href:"/customers",detail:customerMetrics.currentTaxYear?`First represented tax year · ${customerMetrics.currentTaxYear}`:"No tax-year Case data",tone:"blue"},
      {label:"Inactive Prior-Year Customers",value:customerMetrics.inactivePriorYearCustomers,href:"/customers",detail:customerMetrics.priorTaxYear&&customerMetrics.currentTaxYear?`${customerMetrics.priorTaxYear} without ${customerMetrics.currentTaxYear} Case`:"No tax-year Case data",tone:"amber"},
      {label:"Customers Without an Active Case",value:customersWithoutActiveCase,href:"/customers",detail:"No non-terminal Case",tone:"orange"},
      {label:"Lifetime Customers",value:customerMetrics.lifetimeCustomers,href:"/customers",detail:"Distinct organization Customers",tone:"green"},
    ],
    caseProgress:[
      {label:"New",value:cases.filter(item=>item.status==="NEW").length,href:"/cases?status=new"},
      {label:"Assigned",value:cases.filter(item=>["UNASSIGNED","ASSIGNED"].includes(item.status)).length,href:"/cases?status=assigned"},
      {label:"In Progress",value:cases.filter(item=>["IN_PROGRESS","REVIEW"].includes(item.status)).length,href:"/cases?status=in-progress"},
      {label:"Waiting",value:cases.filter(item=>item.status==="WAITING").length,href:"/cases?status=waiting"},
      {label:"Completed",value:cases.filter(item=>isCanonicalCompletedCaseStatus(item.status)).length,href:"/cases?status=completed"},
    ],
    tasks:{total:tasks.filter(task=>!["NOT_APPLICABLE","REQUIRED_UNAVAILABLE"].includes(task.status)).length,completed:completedTasks,open:openTasks,waitingOnCustomer:waitingOnCustomerTasks,overdue:overdueTasks},
    attention:[
      {label:"Overdue tasks",value:overdueTasks,href:"/tasks?due=overdue",tone:"red"},
      {label:"Tasks due today",value:dueToday,href:"/tasks?due=today",tone:"amber"},
      {label:"Unassigned service requests",value:unassignedRequests,href:"/service-desk/requests?assignment=unassigned",tone:"orange"},
      {label:"Requests awaiting staff response",value:awaitingStaff,href:"/service-desk/requests?status=PENDING_STAFF",tone:"blue"},
      {label:"Unread communications",value:unreadCommunications,href:"/communications?status=unread",tone:"violet"},
    ].filter(item=>item.value>0),
  } as const;
}
