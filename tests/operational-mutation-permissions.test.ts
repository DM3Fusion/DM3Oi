import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasPermission, type ApplicationRole, type Permission } from "../lib/auth/permissions.ts";

const source=(path:string)=>readFileSync(path,"utf8");
const permissionMigration=source("supabase/migrations/20260906120000_dm3oi_organization_role_permissions.sql");
const functionSql=(name:string)=>{
 const marker=`create or replace function public.${name}(`;
 const start=permissionMigration.lastIndexOf(marker);
 assert.notEqual(start,-1,`${name} definition`);
 const next=permissionMigration.indexOf("create or replace function public.",start+marker.length);
 return permissionMigration.slice(start,next===-1?undefined:next);
};
const roles:ApplicationRole[]=["SUPER_ADMIN","BUSINESS_OWNER","BUSINESS_ADMIN","STAFF_MANAGER","STAFF_USER","PUBLIC_USER"];
const access=(role:ApplicationRole,active=true)=>({isSuperAdmin:role==="SUPER_ADMIN",internalAccess:role!=="PUBLIC_USER",activeOrganization:active&&role!=="PUBLIC_USER"?{role}:null});
const allowed=(permission:Permission,expected:ApplicationRole[])=>{for(const role of roles)assert.equal(hasPermission(access(role),permission),expected.includes(role),`${role} ${permission}`)};
const managers:ApplicationRole[]=["SUPER_ADMIN","BUSINESS_OWNER","BUSINESS_ADMIN","STAFF_MANAGER"];
const internal:ApplicationRole[]=[...managers,"STAFF_USER"];

test("operational capabilities preserve manager and worker distinctions",()=>{
 allowed("CREATE_CASE",managers);allowed("WORK_CASES",internal);allowed("ASSIGN_CASES",managers);allowed("REASSIGN_CASE_CUSTOMER",managers);
 allowed("WORK_TASKS",internal);allowed("MANAGE_TASKS",managers);allowed("ASSIGN_TASKS",managers);
 allowed("CREATE_SERVICE_REQUEST",internal);allowed("WORK_SERVICE_REQUEST",internal);allowed("RESPOND_SERVICE_REQUEST",internal);allowed("MANAGE_SERVICE_REQUEST",managers);allowed("ASSIGN_SERVICE_REQUEST",managers);
 allowed("CREATE_CUSTOMER",internal);allowed("EDIT_CUSTOMER",internal);allowed("VIEW_COMMUNICATIONS",internal);
});

test("SUPER_ADMIN needs active organization context and PUBLIC_USER has no internal mutation",()=>{
 for(const permission of ["CREATE_CASE","REASSIGN_CASE_CUSTOMER","WORK_TASKS","CREATE_SERVICE_REQUEST","EDIT_CUSTOMER","VIEW_COMMUNICATIONS"] as Permission[]){assert.equal(hasPermission(access("SUPER_ADMIN",false),permission),false);assert.equal(hasPermission(access("PUBLIC_USER"),permission),false);}
});

test("case task and customer actions enforce centralized capabilities before writes",()=>{
 const actions=source("lib/data/case-actions.ts");
 for(const capability of ["CREATE_CASE","WORK_CASES","ASSIGN_CASES","MANAGE_TASKS","WORK_TASKS","CREATE_CUSTOMER"])assert.match(actions,new RegExp(`requirePermission\\("${capability}"\\)`));
 assert.match(source("lib/data/customer-actions.ts"),/requirePermission\("EDIT_CUSTOMER"\)/);
 const questions=source("lib/data/question-actions.ts");
 assert.match(questions,/requireInternalContext\(\)[\s\S]*hasPermission\(access,"MANAGE_QUESTIONS"\)/);
 assert.match(questions,/requirePermission\("WORK_CASES"\)/);
 assert.match(actions,/hasPermission\(context, "MANAGE_TASKS"\)/);
 assert.match(actions,/hasPermission\(context, "ASSIGN_TASKS"\)/);
 assert.match(actions,/\.eq\("organization_id", context\.activeOrganization\.id\)/);
});

test("Service Desk actions separate creation work assignment and response",()=>{
 const actions=source("lib/data/service-request-actions.ts");
 for(const capability of ["CREATE_SERVICE_REQUEST","WORK_SERVICE_REQUEST","ASSIGN_SERVICE_REQUEST","RESPOND_SERVICE_REQUEST"])assert.match(actions,new RegExp(`requirePermission\\("${capability}"\\)`));
 assert.match(actions,/assignedUserId[\s\S]*hasPermission\(context, "ASSIGN_SERVICE_REQUEST"\)/);
 const detail=source("app/service-desk/[serviceRequestId]/page.tsx");
 assert.match(detail,/hasPermission\(access, "WORK_SERVICE_REQUEST"\)/);
 assert.match(detail,/hasPermission\(access, "RESPOND_SERVICE_REQUEST"\)/);
 assert.match(detail,/assignedToCurrentUser/);
});

test("Communications mutations combine module capability with recipient-scoped RPCs",()=>{
 const actions=source("lib/data/communications-actions.ts");
 assert.match(actions,/requirePermission\("VIEW_COMMUNICATIONS"\)/);
 for(const name of ["set_notification_read_state","mark_all_notifications_read","archive_notification"]){
  const definition=functionSql(name);
  assert.match(definition,/has_effective_organization_permission\([^\n]*'VIEW_COMMUNICATIONS'\)/);
  assert.match(definition,/recipient_user_id=actor/);
 }
 assert.match(functionSql("mark_all_notifications_read"),/archived_at is null/);
});

test("customer create and update use effective permissions instead of broad member RLS",()=>{
 assert.equal(hasPermission(access("STAFF_USER"),"CREATE_CUSTOMER"),true);
 assert.equal(hasPermission(access("STAFF_USER"),"EDIT_CUSTOMER"),true);
 assert.match(functionSql("create_customer_record"),/has_effective_organization_permission\(target_organization_id,'CREATE_CUSTOMER'\)/);
 assert.match(permissionMigration,/drop policy if exists customers_internal_write on public\.customers/);
 assert.match(permissionMigration,/create policy customers_effective_update[\s\S]*has_effective_organization_permission\(organization_id,'EDIT_CUSTOMER'\)[\s\S]*with check\(public\.has_effective_organization_permission\(organization_id,'EDIT_CUSTOMER'\)\)/);
 assert.match(permissionMigration,/revoke insert,update,delete on public\.customers from authenticated/);
 assert.match(permissionMigration,/grant update\(name,email,phone,notes,status\) on public\.customers to authenticated/);
});

test("UI mutation controls consume capabilities without changing record visibility",()=>{
 assert.match(source("app/cases/page.tsx"),/hasPermission\(access, "CREATE_CASE"\)/);
 assert.match(source("app/cases/[caseId]/page.tsx"),/hasPermission\(access, "MANAGE_TASKS"\)/);
 assert.match(source("app/service-desk/page.tsx"),/hasPermission\(access, "CREATE_SERVICE_REQUEST"\)/);
 assert.match(source("components/service-request-form.tsx"),/canAssign/);
 assert.match(source("app/customers/page.tsx"),/hasPermission\(access, "CREATE_CUSTOMER"\)/);
 assert.match(source("app/customers/[customerId]/page.tsx"),/hasPermission\(access, "EDIT_CUSTOMER"\)/);
});

test("database RPCs retain record-scope authorization backstops",()=>{
 assert.match(functionSql("transition_case_status"),/has_effective_organization_permission\(item\.organization_id,'WORK_CASES'\)[\s\S]*can_access_case/);
 for(const name of ["set_case_assignment","create_case_task"]){
  assert.match(functionSql(name),/has_effective_organization_permission[\s\S]*can_access_case/);
 }
 for(const name of ["delete_case_task","move_case_task"]){
  assert.match(functionSql(name),/has_effective_organization_permission[\s\S]*can_access_case/);
 }
 const updateTask=functionSql("update_case_task");
 assert.match(updateTask,/has_effective_organization_permission\(existing\.organization_id,'WORK_TASKS'\)/);
 assert.match(updateTask,/can_access_case\(existing\.case_id,existing\.organization_id,actor\)/);
 assert.match(updateTask,/existing\.assigned_user_id<>actor[\s\S]*'MANAGE_TASKS'/);
 for(const name of ["update_service_request_status","update_service_request_priority","set_service_request_assignment","create_internal_service_request_message"]){
  assert.match(functionSql(name),/has_effective_organization_permission[\s\S]*can_manage_service_request/);
 }
});

test("effective SQL permission resolver is tenant-scoped identity-safe and fail-closed",()=>{
 const helper=functionSql("has_effective_organization_permission");
 assert.match(helper,/actor uuid:=auth\.uid\(\)/);
 assert.doesNotMatch(helper,/target_user_id/);
 assert.match(helper,/m\.organization_id=target_organization_id and m\.user_id=actor and m\.is_active/);
 assert.match(helper,/m\.role in \('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER'\)/);
 assert.match(helper,/effective_organization_role_permission\(target_organization_id,actor_role,target_permission\)/);
 assert.match(helper,/exception when others then\s+return false/);
 assert.match(permissionMigration,/grant execute on function public\.has_effective_organization_permission\(uuid,text\) to authenticated/);
 assert.doesNotMatch(permissionMigration,/has_effective_organization_permission\(uuid,text,uuid\)/);
});

test("all internal operational RPCs enforce the same effective capabilities as server actions",()=>{
 const expected:Record<string,string[]>={
  create_case_workflow:["CREATE_CASE"],transition_case_status:["WORK_CASES"],set_case_assignment:["ASSIGN_CASES"],
  create_case_task:["MANAGE_TASKS"],update_case_task:["WORK_TASKS","MANAGE_TASKS","ASSIGN_TASKS"],delete_case_task:["MANAGE_TASKS"],move_case_task:["MANAGE_TASKS"],
  create_service_request:["CREATE_SERVICE_REQUEST","ASSIGN_SERVICE_REQUEST"],update_service_request_status:["WORK_SERVICE_REQUEST"],update_service_request_priority:["WORK_SERVICE_REQUEST"],set_service_request_assignment:["ASSIGN_SERVICE_REQUEST"],create_internal_service_request_message:["RESPOND_SERVICE_REQUEST"],
  create_customer_record:["CREATE_CUSTOMER"],save_question_definition:["MANAGE_QUESTIONS"],save_case_question_response:["WORK_CASES"],
  set_notification_read_state:["VIEW_COMMUNICATIONS"],mark_all_notifications_read:["VIEW_COMMUNICATIONS"],archive_notification:["VIEW_COMMUNICATIONS"],
 };
 for(const [name,capabilities] of Object.entries(expected))for(const capability of capabilities){
  assert.match(functionSql(name),new RegExp(`has_effective_organization_permission\\([^;]*'${capability}'\\)`),`${name} ${capability}`);
 }
});

test("PUBLIC_USER portal authorization stays separate from internal capabilities",()=>{
 const helper=functionSql("has_effective_organization_permission");
 assert.doesNotMatch(helper,/PUBLIC_USER/);
 assert.doesNotMatch(permissionMigration,/create or replace function public\.create_customer_service_request\(/);
 assert.doesNotMatch(permissionMigration,/create or replace function public\.create_customer_service_request_message\(/);
 const portal=source("lib/data/customer-portal-actions.ts");
 assert.match(portal,/create_customer_service_request/);
 assert.match(portal,/create_customer_service_request_message/);
 assert.doesNotMatch(portal,/requirePermission\(/);
});
