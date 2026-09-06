import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source=(path:string)=>readFileSync(path,"utf8");

test("authenticated shell presents DM3Oi branding and preserves operational navigation",()=>{
  const shell=source("components/layout/app-shell.tsx");
  assert.match(shell,/<strong>DM3Oi™<\/strong>/);
  assert.match(shell,/<span>Operational Intelligence<\/span>/);
  for(const label of ["Dashboard","Cases","Service Desk","Communications","Customers","Tasks","Questions & Rules","Reports","Users","Administration","Settings"])assert.match(shell,new RegExp(`label: "${label}"`));
  assert.match(shell,/aria-label="Administration navigation"/);
  assert.doesNotMatch(shell,/Case Management Intelligence/);
});

test("operational dashboard exposes six linked primary KPIs",()=>{
  const metrics=source("lib/live-dashboard-metrics.ts");
  for(const [label,href] of [["Active Cases","/cases"],["Open Tasks","/tasks"],["Due Today","/tasks"],["Open Service Requests","/service-desk"],["Unread Communications","/communications?status=unread"],["Customers","/customers"]]){
    assert.match(metrics,new RegExp(`label:\\"${label}\\",value:[^,]+,href:\\"${href.replace(/[?]/g,"\\?")}\\"`));
  }
});

test("dashboard includes deterministic attention, progress, task status, and linked recent activity",()=>{
  const dashboard=source("components/dashboard/dashboard.tsx");
  const metrics=source("lib/live-dashboard-metrics.ts");
  for(const heading of ["Work Progress","Task Status","Needs Attention","Recent Activity"])assert.match(dashboard,new RegExp(`>${heading}<`));
  for(const signal of ["Overdue tasks","Tasks due today","Unassigned service requests","Requests awaiting staff response","Unread communications"])assert.match(metrics,new RegExp(signal));
  assert.match(dashboard,/href=\{`\/cases\/\$\{activity\.case_id\}`\}/);
  assert.match(dashboard,/formatOrganizationDateTime\(activity\.created_at,data\.timezone\)/);
  assert.match(dashboard,/Future Operational Pulse insights/);
});

test("dashboard queries remain authorized and recipient scoped",()=>{
  const page=source("app/page.tsx");
  const repository=source("lib/data/case-repository.ts");
  const communications=source("lib/data/communications-repository.ts");
  assert.match(page,/getLiveOrganizationData\(\)/);
  assert.match(page,/getUnreadNotificationCount\(\{organizationId:access\.activeOrganization!/);
  assert.match(repository,/hasTenantInternalAccess\(access\)/);
  assert.match(repository,/\.eq\("organization_id", organizationId\)/);
  assert.match(communications,/\.eq\("recipient_user_id", userId\)/);
});

test("dashboard layout has responsive six, three, and two-column KPI states",()=>{
  const css=source("app/globals.css");
  assert.match(css,/\.operations-kpis\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:1300px\)\{\.operations-kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:620px\)\{\.operations-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css,/route-progress|navigation-progress/);
});
