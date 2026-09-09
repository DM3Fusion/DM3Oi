begin;

create or replace function pg_temp.assert_true(value boolean,message text)
returns void language plpgsql as $$begin if not coalesce(value,false) then raise exception 'assertion failed: %',message;end if;end$$;

insert into auth.users(id,email) values
  ('95000000-0000-0000-0000-000000000001','owner@rules.test'),
  ('95000000-0000-0000-0000-000000000002','manager@rules.test'),
  ('95000000-0000-0000-0000-000000000003','other-owner@rules.test');
insert into public.organizations(id,name,slug) values
  ('95100000-0000-0000-0000-000000000001','Rule Tenant','rule-tenant'),
  ('95100000-0000-0000-0000-000000000002','Other Rule Tenant','other-rule-tenant');
insert into public.organization_members(organization_id,user_id,role) values
  ('95100000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000001','BUSINESS_OWNER'),
  ('95100000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000002','STAFF_MANAGER'),
  ('95100000-0000-0000-0000-000000000002','95000000-0000-0000-0000-000000000003','BUSINESS_OWNER');

insert into public.question_definitions(id,organization_id,question_text,response_type,active,display_order,created_by_user_id) values
  ('95200000-0000-0000-0000-000000000001','95100000-0000-0000-0000-000000000001','Installation type','SINGLE_SELECT',true,10,'95000000-0000-0000-0000-000000000001'),
  ('95200000-0000-0000-0000-000000000002','95100000-0000-0000-0000-000000000001','Field verified','YES_NO',true,20,'95000000-0000-0000-0000-000000000001'),
  ('95200000-0000-0000-0000-000000000003','95100000-0000-0000-0000-000000000001','Permit received','YES_NO',true,30,'95000000-0000-0000-0000-000000000001'),
  ('95200000-0000-0000-0000-000000000004','95100000-0000-0000-0000-000000000001','Cycle A','YES_NO',true,40,'95000000-0000-0000-0000-000000000001'),
  ('95200000-0000-0000-0000-000000000005','95100000-0000-0000-0000-000000000001','Cycle B','YES_NO',true,50,'95000000-0000-0000-0000-000000000001'),
  ('95200000-0000-0000-0000-000000000006','95100000-0000-0000-0000-000000000002','Other tenant target','YES_NO',true,10,'95000000-0000-0000-0000-000000000003');
insert into public.question_options(id,organization_id,question_id,option_label,option_value,display_order) values
  ('95300000-0000-0000-0000-000000000001','95100000-0000-0000-0000-000000000001','95200000-0000-0000-0000-000000000001','Regulatory','REGULATORY',10);

set local role authenticated;
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000002',true);
do $$begin
  perform public.save_rule_definition('95100000-0000-0000-0000-000000000001',null,'Forbidden Rule','','95200000-0000-0000-0000-000000000002','IS_YES',null,true,0,'[{"action_type":"SHOW_QUESTION","target_question_id":"95200000-0000-0000-0000-000000000003","task_title":"","task_description":"","task_priority":"NORMAL","task_required":true,"task_blocking":false}]',null);
  raise exception 'manager without MANAGE_RULES saved a Rule';
exception when insufficient_privilege then null;end$$;

select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000001',true);
select (public.save_rule_definition(
  '95100000-0000-0000-0000-000000000001',null,'Require verification','Live Builder payload',
  '95200000-0000-0000-0000-000000000001','EQUALS','95300000-0000-0000-0000-000000000001',true,0,
  '[{"action_type":"REQUIRE_QUESTION","target_question_id":"95200000-0000-0000-0000-000000000002","task_title":"","task_description":"","task_priority":"NORMAL","task_required":true,"task_blocking":false}]',null
)).id require_rule_id \gset
select (public.save_rule_definition(
  '95100000-0000-0000-0000-000000000001',null,'Show permit','Live Builder payload',
  '95200000-0000-0000-0000-000000000002','IS_YES',null,true,1,
  '[{"action_type":"SHOW_QUESTION","target_question_id":"95200000-0000-0000-0000-000000000003","task_title":"not allowed","task_description":"not allowed","task_priority":"NORMAL","task_required":true,"task_blocking":false}]',null
)).id show_rule_id \gset
select (public.save_rule_definition(
  '95100000-0000-0000-0000-000000000001',null,'Create field task','Task payload',
  '95200000-0000-0000-0000-000000000003','IS_YES',null,true,2,
  '[{"action_type":"CREATE_TASK","target_question_id":"95200000-0000-0000-0000-000000000002","task_title":"Verify field","task_description":"Confirm the installation site.","task_priority":"HIGH","task_required":false,"task_blocking":true}]',null
)).id task_rule_id \gset
select set_config('dm3oi.test.require_rule_id',:'require_rule_id',true);

reset role;
select pg_temp.assert_true(exists(
  select 1 from public.rule_actions where rule_definition_id=:'require_rule_id'
    and action_type='REQUIRE_QUESTION' and target_question_id='95200000-0000-0000-0000-000000000002'
    and task_title is null and task_description is null and task_priority is null and task_required is null and task_blocking is null
),'REQUIRE_QUESTION normalizes every task-only field to NULL');
select pg_temp.assert_true(exists(
  select 1 from public.rule_actions where rule_definition_id=:'show_rule_id'
    and action_type='SHOW_QUESTION' and target_question_id='95200000-0000-0000-0000-000000000003'
    and task_title is null and task_description is null and task_priority is null and task_required is null and task_blocking is null
),'SHOW_QUESTION normalizes every task-only field to NULL');
select pg_temp.assert_true(exists(
  select 1 from public.rule_actions where rule_definition_id=:'task_rule_id'
    and action_type='CREATE_TASK' and target_question_id is null and task_title='Verify field'
    and task_description='Confirm the installation site.' and task_priority='HIGH' and not task_required and task_blocking
),'CREATE_TASK preserves task fields and normalizes its target Question to NULL');

set local role authenticated;
select set_config('request.jwt.claim.sub','95000000-0000-0000-0000-000000000001',true);
do $$begin
  perform public.save_rule_definition('95100000-0000-0000-0000-000000000001',null,'Atomic failure','','95200000-0000-0000-0000-000000000002','IS_YES',null,true,3,'[{"action_type":"REQUIRE_QUESTION","target_question_id":"95900000-0000-0000-0000-000000000001","task_priority":"NORMAL","task_required":true,"task_blocking":false}]',null);
  raise exception 'invalid action saved';
exception when check_violation then null;end$$;
do $$begin
  perform public.save_rule_definition('95100000-0000-0000-0000-000000000001',null,'Cross tenant target','','95200000-0000-0000-0000-000000000002','IS_YES',null,true,4,'[{"action_type":"SHOW_QUESTION","target_question_id":"95200000-0000-0000-0000-000000000006","task_priority":"NORMAL"}]',null);
  raise exception 'cross-tenant target saved';
exception when check_violation then null;end$$;
do $$begin
  perform public.save_rule_definition('95100000-0000-0000-0000-000000000001',null,'Invalid option','','95200000-0000-0000-0000-000000000001','EQUALS','95900000-0000-0000-0000-000000000002',true,5,'[{"action_type":"SHOW_QUESTION","target_question_id":"95200000-0000-0000-0000-000000000002","task_priority":"NORMAL"}]',null);
  raise exception 'invalid condition option saved';
exception when foreign_key_violation then null;end$$;
do $$begin
  perform public.save_rule_definition('95100000-0000-0000-0000-000000000001',null,'Self reference','','95200000-0000-0000-0000-000000000002','IS_YES',null,true,6,'[{"action_type":"REQUIRE_QUESTION","target_question_id":"95200000-0000-0000-0000-000000000002","task_priority":"NORMAL"}]',null);
  raise exception 'direct self-reference saved';
exception when check_violation then null;end$$;

select (public.save_rule_definition('95100000-0000-0000-0000-000000000001',null,'Cycle first','','95200000-0000-0000-0000-000000000004','IS_YES',null,true,7,'[{"action_type":"SHOW_QUESTION","target_question_id":"95200000-0000-0000-0000-000000000005","task_priority":"NORMAL"}]',null)).id cycle_rule_id \gset
do $$begin
  perform public.save_rule_definition('95100000-0000-0000-0000-000000000001',null,'Cycle rejected','','95200000-0000-0000-0000-000000000005','IS_YES',null,true,8,'[{"action_type":"SHOW_QUESTION","target_question_id":"95200000-0000-0000-0000-000000000004","task_priority":"NORMAL"}]',null);
  raise exception 'recursive cycle saved';
exception when check_violation then null;end$$;
do $$begin
  perform public.save_rule_definition(
    '95100000-0000-0000-0000-000000000001',
    current_setting('dm3oi.test.require_rule_id')::uuid,
    'Stale update','','95200000-0000-0000-0000-000000000001','EQUALS','95300000-0000-0000-0000-000000000001',true,0,
    '[{"action_type":"REQUIRE_QUESTION","target_question_id":"95200000-0000-0000-0000-000000000002","task_priority":"NORMAL"}]','2000-01-01T00:00:00Z'
  );
  raise exception 'stale optimistic update saved';
exception when serialization_failure then null;end$$;

reset role;
select pg_temp.assert_true(not exists(select 1 from public.rule_definitions where name in ('Forbidden Rule','Atomic failure','Cross tenant target','Invalid option','Self reference','Cycle rejected')),'failed Rule saves roll back definitions atomically');
select pg_temp.assert_true((select count(*) from public.rule_actions where rule_definition_id=:'cycle_rule_id')=1,'failed cycle preserves the valid existing graph');
select pg_temp.assert_true((select name from public.rule_definitions where id=:'require_rule_id')='Require verification','stale update preserves the existing Rule');
select 'DM3Oi Rule Builder database regression tests passed' result;
rollback;
