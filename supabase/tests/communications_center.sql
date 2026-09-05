begin;
create or replace function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$begin if not value then raise exception 'assertion failed: %',message;end if;end$$;

insert into auth.users(id,email) values
  ('70000000-0000-0000-0000-000000000001','owner@communications.test'),
  ('70000000-0000-0000-0000-000000000002','assigned@communications.test'),
  ('70000000-0000-0000-0000-000000000003','other@communications.test'),
  ('70000000-0000-0000-0000-000000000004','customer@communications.test');
insert into public.organizations(id,name,slug) values
  ('71000000-0000-0000-0000-000000000001','Communications Tenant','communications-tenant'),
  ('71000000-0000-0000-0000-000000000002','Other Communications Tenant','other-communications-tenant');
insert into public.organization_members(organization_id,user_id,role) values
  ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','BUSINESS_OWNER'),
  ('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','STAFF_USER'),
  ('71000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003','BUSINESS_OWNER');
insert into public.customers(id,organization_id,customer_number,type,name,created_by_user_id) values
  ('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','CUST-COMMS','BUSINESS','Customer','70000000-0000-0000-0000-000000000001');
insert into public.customer_portal_users(id,organization_id,customer_id,user_id) values
  ('72500000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004');
insert into public.service_requests(id,organization_id,request_number,customer_id,subject,description,assigned_user_id,created_by_user_id) values
  ('73000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','SR-2026-9001','72000000-0000-0000-0000-000000000001','Test request','Opening message','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000004',true);
select id created_message_id from public.create_customer_service_request_message('73000000-0000-0000-0000-000000000001','Customer response') \gset
reset role;

select pg_temp.assert_true((select count(*) from public.notifications where source_event_id=:'created_message_id')=1,'successful customer message creates one notification');
select id notification_id from public.notifications where source_event_id=:'created_message_id' \gset
select pg_temp.assert_true(exists(select 1 from public.notifications where organization_id='71000000-0000-0000-0000-000000000001' and recipient_user_id='70000000-0000-0000-0000-000000000002' and source_domain='SERVICE_REQUEST' and source_entity_id='73000000-0000-0000-0000-000000000001' and destination_path='/service-desk/73000000-0000-0000-0000-000000000001' and read_at is null),'notification links assigned recipient to unread source');
select public.create_notification('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','CUSTOMER_RESPONSE_RECEIVED','SERVICE_REQUEST','Customer response received','Safe summary','SERVICE_REQUEST','73000000-0000-0000-0000-000000000001',:'created_message_id','/service-desk/73000000-0000-0000-0000-000000000001');
select pg_temp.assert_true((select count(*) from public.notifications where source_event_id=:'created_message_id' and recipient_user_id='70000000-0000-0000-0000-000000000002')=1,'source event recipient uniqueness prevents retry duplicates');

set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000004',true);
do $$begin perform public.create_customer_service_request_message('73000000-0000-0000-0000-000000000001','');raise exception 'invalid message accepted';exception when invalid_parameter_value then null;end$$;
select pg_temp.assert_true(not exists(select 1 from public.notifications),'PUBLIC_USER cannot query staff notifications');
reset role;
select pg_temp.assert_true((select count(*) from public.notifications)=1,'failed submission creates no additional notification');

set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*) from public.notifications)=1,'authorized recipient retrieves own notification');
select public.set_notification_read_state((select id from public.notifications limit 1),true);
select pg_temp.assert_true((select bool_and(read_at is not null) from public.notifications),'recipient marks notification read');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true(not exists(select 1 from public.notifications),'cross-organization notifications are hidden');
do $$begin perform public.set_notification_read_state(:'notification_id','false');raise exception 'other recipient altered notification';exception when insufficient_privilege then null;end$$;
reset role;
select pg_temp.assert_true((select bool_and(read_at is not null) from public.notifications),'another user cannot alter read state');

select 'DM3iQCM communications center regression tests passed' result;
rollback;
