begin;

create or replace function pg_temp.assert_true(value boolean,message text)
returns void language plpgsql as $$begin if not coalesce(value,false) then raise exception 'assertion failed: %',message;end if;end$$;

insert into auth.users(id,email) values
  ('96000000-0000-0000-0000-000000000001','owner@rule-tasks.test'),
  ('96000000-0000-0000-0000-000000000002','staff@rule-tasks.test'),
  ('96000000-0000-0000-0000-000000000003','portal@rule-tasks.test'),
  ('96000000-0000-0000-0000-000000000004','other-owner@rule-tasks.test');
insert into public.organizations(id,name,slug) values
  ('96100000-0000-0000-0000-000000000001','Rule Task Tenant','rule-task-tenant'),
  ('96100000-0000-0000-0000-000000000002','Other Rule Task Tenant','other-rule-task-tenant');
insert into public.organization_members(organization_id,user_id,role) values
  ('96100000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000001','BUSINESS_OWNER'),
  ('96100000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000002','STAFF_USER'),
  ('96100000-0000-0000-0000-000000000002','96000000-0000-0000-0000-000000000004','BUSINESS_OWNER');
insert into public.customers(id,organization_id,customer_number,type,name,created_by_user_id) values
  ('96200000-0000-0000-0000-000000000001','96100000-0000-0000-0000-000000000001','CUST-RT-1','BUSINESS','Rule Task Customer','96000000-0000-0000-0000-000000000001'),
  ('96200000-0000-0000-0000-000000000002','96100000-0000-0000-0000-000000000002','CUST-RT-2','BUSINESS','Other Customer','96000000-0000-0000-0000-000000000004');
insert into public.question_definitions(id,organization_id,question_text,response_type,active,display_order,created_by_user_id) values
  ('96300000-0000-0000-0000-000000000001','96100000-0000-0000-0000-000000000001','Regulatory installation','YES_NO',true,0,'96000000-0000-0000-0000-000000000001'),
  ('96300000-0000-0000-0000-000000000002','96100000-0000-0000-0000-000000000001','Field verified','YES_NO',true,1,'96000000-0000-0000-0000-000000000001'),
  ('96300000-0000-0000-0000-000000000003','96100000-0000-0000-0000-000000000002','Other source','YES_NO',true,0,'96000000-0000-0000-0000-000000000004');
insert into public.cases(id,organization_id,case_number,customer_id,title,case_type,created_by_user_id) values
  ('96400000-0000-0000-0000-000000000001','96100000-0000-0000-0000-000000000001','CASE-RT-1','96200000-0000-0000-0000-000000000001','Rule Task Case 1','General','96000000-0000-0000-0000-000000000001'),
  ('96400000-0000-0000-0000-000000000002','96100000-0000-0000-0000-000000000001','CASE-RT-2','96200000-0000-0000-0000-000000000001','Rule Task Case 2','General','96000000-0000-0000-0000-000000000001'),
  ('96400000-0000-0000-0000-000000000003','96100000-0000-0000-0000-000000000002','CASE-RT-3','96200000-0000-0000-0000-000000000002','Other Case','General','96000000-0000-0000-0000-000000000004');

set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
select (public.save_rule_definition(
  '96100000-0000-0000-0000-000000000001',null,'Regulatory Installation Task','',
  '96300000-0000-0000-0000-000000000001','IS_YES',null,true,0,
  '[{"action_type":"CREATE_TASK","task_title":"Verify regulatory sign installation","task_description":"Confirm the installation in the field.","task_priority":"HIGH","task_required":true,"task_blocking":true}]',null
)).id task_rule_id \gset
reset role;
select id task_action_id from public.rule_actions where rule_definition_id=:'task_rule_id' and retired_at is null \gset

set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000004',true);
select (public.save_rule_definition(
  '96100000-0000-0000-0000-000000000002',null,'Other Task Rule','',
  '96300000-0000-0000-0000-000000000003','IS_YES',null,true,0,
  '[{"action_type":"CREATE_TASK","task_title":"Other tenant task","task_description":"","task_priority":"NORMAL","task_required":false,"task_blocking":false}]',null
)).id other_rule_id \gset
reset role;
select id other_action_id from public.rule_actions where rule_definition_id=:'other_rule_id' and retired_at is null \gset
select set_config('dm3oi.test.task_rule_id',:'task_rule_id',true);
select set_config('dm3oi.test.task_action_id',:'task_action_id',true);
select set_config('dm3oi.test.other_rule_id',:'other_rule_id',true);
select set_config('dm3oi.test.other_action_id',:'other_action_id',true);

-- Browser roles cannot invoke the trusted synchronization surface.
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
do $$begin
  perform public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001',array[current_setting('dm3oi.test.task_action_id')::uuid],'96000000-0000-0000-0000-000000000001');
  raise exception 'authenticated invoked service-only synchronization';
exception when insufficient_privilege then null;end$$;
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001',array[:'task_action_id'::uuid],'96000000-0000-0000-0000-000000000001');
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001',array[:'task_action_id'::uuid],'96000000-0000-0000-0000-000000000001');
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000002',array[:'task_action_id'::uuid],'96000000-0000-0000-0000-000000000001');
reset role;

select id generated_task_id from public.case_tasks where case_id='96400000-0000-0000-0000-000000000001' and source_rule_action_id=:'task_action_id' \gset
select id second_generated_task_id from public.case_tasks where case_id='96400000-0000-0000-0000-000000000002' and source_rule_action_id=:'task_action_id' \gset
select pg_temp.assert_true((select count(*)=2 from public.case_tasks where source_rule_action_id=:'task_action_id'),'one generated Task exists for each Case after repeated synchronization');
select pg_temp.assert_true((select title='Verify regulatory sign installation' and description='Confirm the installation in the field.' and priority='HIGH' and required and blocking and status='NOT_STARTED' and source_rule_id=:'task_rule_id' from public.case_tasks where id=:'generated_task_id'),'trusted Rule template and provenance create a NOT_STARTED Task');
select pg_temp.assert_true((select count(*)=1 from public.case_activity where case_id='96400000-0000-0000-0000-000000000001' and event_type='RULE_TASK_CREATED'),'creation audit is emitted once across no-op retries');

do $$begin
  insert into public.case_tasks(organization_id,case_id,title,created_by_user_id,source_rule_id,source_rule_action_id)
  values('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001','Duplicate','96000000-0000-0000-0000-000000000001',current_setting('dm3oi.test.task_rule_id')::uuid,current_setting('dm3oi.test.task_action_id')::uuid);
  raise exception 'duplicate Rule Task lineage inserted';
exception when unique_violation then null;end$$;
do $$begin
  insert into public.case_tasks(organization_id,case_id,title,created_by_user_id,source_rule_id,source_rule_action_id)
  values('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001','Cross tenant provenance','96000000-0000-0000-0000-000000000001',current_setting('dm3oi.test.other_rule_id')::uuid,current_setting('dm3oi.test.other_action_id')::uuid);
  raise exception 'cross-tenant Rule Task provenance inserted';
exception when foreign_key_violation then null;end$$;

insert into public.case_tasks(id,organization_id,case_id,title,status,sequence,created_by_user_id)
values('96500000-0000-0000-0000-000000000001','96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001','Manual Task','IN_PROGRESS',99,'96000000-0000-0000-0000-000000000001');

update public.case_tasks set status='IN_PROGRESS' where id=:'generated_task_id';
set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001','{}','96000000-0000-0000-0000-000000000001');
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001','{}','96000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.assert_true((select status='NOT_APPLICABLE' and prior_actionable_status='IN_PROGRESS' from public.case_tasks where id=:'generated_task_id'),'false restores provenance-aware IN_PROGRESS history into NOT_APPLICABLE');
select pg_temp.assert_true((select status='IN_PROGRESS' from public.case_tasks where id='96500000-0000-0000-0000-000000000001'),'manual Task is untouched');
select pg_temp.assert_true((select count(*)=1 from public.case_activity where case_id='96400000-0000-0000-0000-000000000001' and event_type='RULE_TASK_NOT_APPLICABLE'),'not-applicable audit is emitted only on transition');

set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001',array[:'task_action_id'::uuid],'96000000-0000-0000-0000-000000000001');
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001',array[:'task_action_id'::uuid],'96000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.assert_true((select id=:'generated_task_id' and status='IN_PROGRESS' and prior_actionable_status is null from public.case_tasks where id=:'generated_task_id'),'true restores the same Task to IN_PROGRESS');
select pg_temp.assert_true((select count(*)=1 from public.case_activity where case_id='96400000-0000-0000-0000-000000000001' and event_type='RULE_TASK_REACTIVATED'),'reactivation audit is emitted only on transition');

update public.case_tasks set status='BLOCKED' where id=:'generated_task_id';
set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001','{}','96000000-0000-0000-0000-000000000001');
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001',array[:'task_action_id'::uuid],'96000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.assert_true((select status='BLOCKED' from public.case_tasks where id=:'generated_task_id'),'BLOCKED status restores on renewed truth');

update public.case_tasks set status='COMPLETED',completed_at=now(),completed_by_user_id='96000000-0000-0000-0000-000000000001' where id=:'generated_task_id';
set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001','{}','96000000-0000-0000-0000-000000000001');
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001',array[:'task_action_id'::uuid],'96000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.assert_true((select status='COMPLETED' from public.case_tasks where id=:'generated_task_id'),'COMPLETED Task is neither downgraded nor reopened');

-- A retained CREATE_TASK keeps its UUID through template edits; existing Tasks
-- retain their operational fields and synchronization cannot duplicate them.
set local role authenticated;select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
select updated_at task_rule_updated_at from public.organization_rule_definitions where id=:'task_rule_id' \gset
select public.save_rule_definition(
  '96100000-0000-0000-0000-000000000001',:'task_rule_id','Regulatory Installation Task','',
  '96300000-0000-0000-0000-000000000001','IS_YES',null,true,0,
  jsonb_build_array(jsonb_build_object('id',:'task_action_id','action_type','CREATE_TASK','task_title','Edited future title','task_description','Edited future description','task_priority','URGENT','task_required',false,'task_blocking',false)),
  :'task_rule_updated_at'
);
reset role;
select pg_temp.assert_true((select id=:'task_action_id' and retired_at is null from public.rule_actions where id=:'task_action_id'),'retained CREATE_TASK UUID survives a template edit');
set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001',array[:'task_action_id'::uuid],'96000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.assert_true((select count(*)=1 and min(title)='Verify regulatory sign installation' from public.case_tasks where case_id='96400000-0000-0000-0000-000000000001' and source_rule_action_id=:'task_action_id'),'template edits neither rewrite nor duplicate an existing generated Task');

-- Rule deactivation makes unfinished generated work inapplicable; completion is historical.
set local role authenticated;select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
select updated_at task_rule_updated_at from public.organization_rule_definitions where id=:'task_rule_id' \gset
select public.save_rule_definition(
  '96100000-0000-0000-0000-000000000001',:'task_rule_id','Regulatory Installation Task','',
  '96300000-0000-0000-0000-000000000001','IS_YES',null,false,0,
  jsonb_build_array(jsonb_build_object('id',:'task_action_id','action_type','CREATE_TASK','task_title','Edited future title','task_description','Edited future description','task_priority','URGENT','task_required',false,'task_blocking',false)),
  :'task_rule_updated_at'
);
reset role;
set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001','{}','96000000-0000-0000-0000-000000000001');
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000002','{}','96000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.assert_true((select status='COMPLETED' from public.case_tasks where id=:'generated_task_id'),'deactivation preserves completed Task');
select pg_temp.assert_true((select status='NOT_APPLICABLE' from public.case_tasks where id=:'second_generated_task_id'),'deactivation makes unfinished generated Task not applicable');

-- Rule reactivation restores the same unfinished Task before a later action
-- removal makes that same historical Task not applicable again.
set local role authenticated;select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
select updated_at task_rule_updated_at from public.organization_rule_definitions where id=:'task_rule_id' \gset
select public.save_rule_definition(
  '96100000-0000-0000-0000-000000000001',:'task_rule_id','Regulatory Installation Task','',
  '96300000-0000-0000-0000-000000000001','IS_YES',null,true,0,
  jsonb_build_array(jsonb_build_object('id',:'task_action_id','action_type','CREATE_TASK','task_title','Edited future title','task_description','Edited future description','task_priority','URGENT','task_required',false,'task_blocking',false)),
  :'task_rule_updated_at'
);
reset role;
set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000002',array[:'task_action_id'::uuid],'96000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.assert_true((select id=:'second_generated_task_id' and status='NOT_STARTED' from public.case_tasks where id=:'second_generated_task_id'),'Rule reactivation restores the same unfinished Task');

-- Removing the CREATE_TASK action retires it instead of breaking provenance.
set local role authenticated;select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
select updated_at task_rule_updated_at from public.organization_rule_definitions where id=:'task_rule_id' \gset
select public.save_rule_definition(
  '96100000-0000-0000-0000-000000000001',:'task_rule_id','Regulatory Installation Task','',
  '96300000-0000-0000-0000-000000000001','IS_YES',null,true,0,
  '[{"action_type":"SHOW_QUESTION","target_question_id":"96300000-0000-0000-0000-000000000002"}]',
  :'task_rule_updated_at'
);
reset role;
set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
select public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000002','{}','96000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.assert_true((select retired_at is not null and action_type='CREATE_TASK' from public.rule_actions where id=:'task_action_id'),'removed CREATE_TASK remains as retired historical provenance');
select pg_temp.assert_true(not exists(select 1 from public.organization_rule_actions where id=:'task_action_id'),'retired action is absent from current organization configuration');
select pg_temp.assert_true((select count(*)=1 and min(status)='NOT_APPLICABLE' from public.case_tasks where id=:'second_generated_task_id'),'action removal inactivates but never deletes generated Task history');

do $$begin
  delete from public.rule_actions where id=current_setting('dm3oi.test.task_action_id')::uuid;
  raise exception 'historical Rule Action was deleted';
exception when foreign_key_violation then null;end$$;

-- Invalid/cross-tenant requested actions and invalid actors fail closed.
set local role service_role;select set_config('request.jwt.claim.role','service_role',true);
do $$begin
  perform public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000003','{}','96000000-0000-0000-0000-000000000001');
  raise exception 'cross-tenant Case accepted';
exception when no_data_found then null;end$$;
do $$begin
  perform public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001',array[current_setting('dm3oi.test.other_action_id')::uuid],'96000000-0000-0000-0000-000000000001');
  raise exception 'cross-tenant effective action accepted';
exception when check_violation then null;end$$;
do $$begin
  perform public.synchronize_case_rule_tasks('96100000-0000-0000-0000-000000000001','96400000-0000-0000-0000-000000000001','{}','96000000-0000-0000-0000-000000000003');
  raise exception 'PUBLIC_USER synchronization actor accepted';
exception when insufficient_privilege then null;end$$;
reset role;

set local role authenticated;select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true(not exists(select 1 from public.organization_case_tasks where organization_id='96100000-0000-0000-0000-000000000001'),'PUBLIC_USER cannot read generated internal Tasks');
reset role;

select pg_temp.assert_true(not exists(
  select 1 from public.case_activity where event_type like 'RULE_TASK_%'
    and (event_data ? 'source_rule_id' or event_data ? 'source_rule_action_id')
),'Rule lifecycle activity exposes no technical Rule UUIDs');
select 'DM3Oi Rule-generated Task database regression tests passed' result;
rollback;
