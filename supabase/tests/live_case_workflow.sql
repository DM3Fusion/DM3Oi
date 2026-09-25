begin;
create or replace function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$begin if not coalesce(condition,false) then raise exception 'ASSERTION FAILED: %',message;end if;end$$;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('40000000-0000-0000-0000-000000000001','authenticated','authenticated','manager@test.local','{}','{}',now(),now()),
('40000000-0000-0000-0000-000000000002','authenticated','authenticated','staff@test.local','{}','{}',now(),now()),
('40000000-0000-0000-0000-000000000003','authenticated','authenticated','other@test.local','{}','{}',now(),now()),
('40000000-0000-0000-0000-000000000004','authenticated','authenticated','portal@test.local','{}','{}',now(),now()),
('40000000-0000-0000-0000-000000000005','authenticated','authenticated','super@test.local','{}','{}',now(),now());
insert into public.platform_user_roles(user_id,role) values('40000000-0000-0000-0000-000000000005','SUPER_ADMIN');
insert into public.organizations(id,name,slug) values('41000000-0000-0000-0000-000000000001','Workflow A','workflow-a'),('41000000-0000-0000-0000-000000000002','Workflow B','workflow-b');
insert into public.organization_members(organization_id,user_id,role) values
('41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','STAFF_MANAGER'),
('41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','STAFF_USER'),
('41000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003','STAFF_USER');
insert into public.customers(id,organization_id,customer_number,type,name,created_by_user_id) values('42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','CUST-EXISTING','INDIVIDUAL','Workflow Customer','40000000-0000-0000-0000-000000000001');
insert into public.customer_portal_users(organization_id,customer_id,user_id) values('41000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000004');
create temporary table test_ids(name text primary key,id uuid);
grant select,insert,update,delete on test_ids to authenticated;

set local role authenticated;select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
with created as(select public.create_case_workflow('41000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','Primary workflow case','Live workflow','General','HIGH',now()-interval '1 day',null,array['40000000-0000-0000-0000-000000000002'::uuid],'[]') item) insert into test_ids select 'primary',(item).id from created;
select pg_temp.assert_true((select (c.case_number~'^CASE-[0-9]{6}$') and exists(select 1 from public.case_activity a where a.case_id=c.id and a.event_type='CASE_CREATED') from public.cases c where c.id=(select id from test_ids where name='primary')),'create case returns generated number and event');
select public.set_case_assignment((select id from test_ids where name='primary'),'40000000-0000-0000-0000-000000000002','STAFF',true);
select pg_temp.assert_true((select count(*)=1 from public.case_assignments where case_id=(select id from test_ids where name='primary') and user_id='40000000-0000-0000-0000-000000000002' and is_active),'valid staff assignment succeeds');
select pg_temp.assert_true(exists(select 1 from public.case_activity where case_id=(select id from test_ids where name='primary') and event_type='CASE_ASSIGNED'),'assignment event recorded');
do $$begin begin perform public.set_case_assignment((select id from test_ids where name='primary'),'40000000-0000-0000-0000-000000000004','STAFF',true);raise exception 'ASSERTION FAILED: portal assignment succeeded';exception when check_violation then null;end;begin perform public.set_case_assignment((select id from test_ids where name='primary'),'40000000-0000-0000-0000-000000000003','STAFF',true);raise exception 'ASSERTION FAILED: cross-org assignment succeeded';exception when check_violation then null;end;end$$;
with task as(select public.create_case_task((select id from test_ids where name='primary'),'Required task','', '40000000-0000-0000-0000-000000000002',true,null) item) insert into test_ids select 'task',(item).id from task;
with task as(select public.create_case_task((select id from test_ids where name='primary'),'Not applicable task','',null,true,null) item) insert into test_ids select 'na-task',(item).id from task;
select public.update_case_task((select id from test_ids where name='na-task'),'Not applicable task','',null,'NOT_APPLICABLE',true,null);
select pg_temp.assert_true((select percentage=0 and total_required_tasks=1 from public.get_case_progress((select id from test_ids where name='primary'))),'NOT_APPLICABLE is excluded from progress');
do $$begin begin perform public.transition_case_status((select id from test_ids where name='primary'),'COMPLETED');raise exception 'ASSERTION FAILED: incomplete case completed';exception when check_violation then null;end;end$$;
select public.update_case_task((select id from test_ids where name='task'),'Required task','','40000000-0000-0000-0000-000000000002','COMPLETED',true,null);
select pg_temp.assert_true((select percentage=100 and completed_required_tasks=1 from public.get_case_progress((select id from test_ids where name='primary'))),'task completion produces correct progress');
select pg_temp.assert_true(exists(select 1 from public.case_activity where case_id=(select id from test_ids where name='primary') and event_type='TASK_COMPLETED'),'task completion event recorded');
select public.transition_case_status((select id from test_ids where name='primary'),'COMPLETED');
select pg_temp.assert_true((select completed_at is not null from public.cases where id=(select id from test_ids where name='primary')),'completion sets timestamp');
select pg_temp.assert_true(exists(select 1 from public.case_activity where case_id=(select id from test_ids where name='primary') and event_type='STATUS_CHANGED' and event_data->>'after'='COMPLETED'),'status before/after event recorded');
select public.transition_case_status((select id from test_ids where name='primary'),'IN_PROGRESS');
select pg_temp.assert_true((select completed_at is null from public.cases where id=(select id from test_ids where name='primary')),'explicit reopen clears completion timestamp');
select public.transition_case_status((select id from test_ids where name='primary'),'COMPLETED');select public.transition_case_status((select id from test_ids where name='primary'),'CLOSED');
select pg_temp.assert_true((select completed_at is not null and closed_at is not null from public.cases where id=(select id from test_ids where name='primary')),'close preserves completion and sets close timestamp');

with created as(select public.create_case_workflow('41000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','Task-only access case','','General','NORMAL',now()+interval '1 day',null,'{}',jsonb_build_array(jsonb_build_object('title','Assigned through task','assigned_user_id','40000000-0000-0000-0000-000000000002','required',true,'sequence',1))) item) insert into test_ids select 'task-only',(item).id from created;
with created as(select public.create_case_workflow('41000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','Unauthorized case','','General','NORMAL',now()+interval '2 days',null,'{}','[]') item) insert into test_ids select 'unauthorized',(item).id from created;
select pg_temp.assert_true((select count(*)=3 from public.cases),'manager sees all organization cases');
select pg_temp.assert_true((select count(*)=3 and count(*) filter(where status in ('COMPLETED','CLOSED'))=1 and count(*) filter(where status='UNASSIGNED')=2 and count(*) filter(where due_at<now() and status not in ('COMPLETED','CLOSED','CANCELLED'))=0 from public.cases),'dashboard metric source reflects live records');
reset role;

set local role authenticated;select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000005',true);
with created as(select public.create_customer_record('41000000-0000-0000-0000-000000000001','BUSINESS','Super Admin Customer',null,null,null) item) insert into test_ids select 'super-customer',(item).id from created;
with created as(select public.create_case_workflow('41000000-0000-0000-0000-000000000001',(select id from test_ids where name='super-customer'),'Super Admin Case','','General','NORMAL',null,null,'{}','[]') item) insert into test_ids select 'super-case',(item).id from created;
select pg_temp.assert_true(exists(select 1 from public.cases where id=(select id from test_ids where name='super-case')),'SUPER_ADMIN can operate in selected organization without membership');
reset role;

set local role authenticated;select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*)=2 from public.cases),'STAFF_USER sees directly assigned and task-assigned cases');
select pg_temp.assert_true(not exists(select 1 from public.cases where id=(select id from test_ids where name='unauthorized')),'STAFF_USER cannot see unauthorized case');
reset role;
set local role authenticated;select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000004',true);
select pg_temp.assert_true((select count(*)=0 from public.cases),'Customer Portal user cannot access internal cases');
reset role;
select 'DM3iQCM live case workflow regression tests passed' result;
rollback;
