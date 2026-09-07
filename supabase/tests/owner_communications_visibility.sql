begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not value then raise exception 'assertion failed: %', message; end if;
end
$$;

insert into auth.users(id, email) values
  ('85000000-0000-0000-0000-000000000001', 'owner@oversight.test'),
  ('85000000-0000-0000-0000-000000000002', 'admin@oversight.test'),
  ('85000000-0000-0000-0000-000000000003', 'manager@oversight.test'),
  ('85000000-0000-0000-0000-000000000004', 'staff@oversight.test'),
  ('85000000-0000-0000-0000-000000000005', 'other-owner@oversight.test'),
  ('85000000-0000-0000-0000-000000000006', 'platform@oversight.test'),
  ('85000000-0000-0000-0000-000000000007', 'portal@oversight.test');

insert into public.organizations(id, name, slug) values
  ('86000000-0000-0000-0000-000000000001', 'Owner Oversight Tenant', 'owner-oversight-tenant'),
  ('86000000-0000-0000-0000-000000000002', 'Other Oversight Tenant', 'other-oversight-tenant');

insert into public.organization_members(organization_id, user_id, role) values
  ('86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', 'BUSINESS_OWNER'),
  ('86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000002', 'BUSINESS_ADMIN'),
  ('86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000003', 'STAFF_MANAGER'),
  ('86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000004', 'STAFF_USER'),
  ('86000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000005', 'BUSINESS_OWNER');

insert into public.platform_user_roles(user_id, role)
values ('85000000-0000-0000-0000-000000000006', 'SUPER_ADMIN');

insert into public.customers(id, organization_id, customer_number, type, name, created_by_user_id)
values (
  '86500000-0000-0000-0000-000000000001',
  '86000000-0000-0000-0000-000000000001',
  'CUST-OVERSIGHT',
  'BUSINESS',
  'Portal customer',
  '85000000-0000-0000-0000-000000000001'
);

insert into public.customer_portal_users(id, organization_id, customer_id, user_id)
values (
  '86550000-0000-0000-0000-000000000001',
  '86000000-0000-0000-0000-000000000001',
  '86500000-0000-0000-0000-000000000001',
  '85000000-0000-0000-0000-000000000007'
);

insert into public.notifications(
  id, organization_id, recipient_user_id, notification_type, category, title,
  message, source_domain, source_entity_id, source_event_id, destination_path
) values
  ('87000000-0000-0000-0000-000000000001', '86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', 'OWNER_EVENT', 'CASE', 'Owner event', 'Owner message', 'CASE', '88000000-0000-0000-0000-000000000001', '89000000-0000-0000-0000-000000000001', '/cases/88000000-0000-0000-0000-000000000001'),
  ('87000000-0000-0000-0000-000000000002', '86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000002', 'ADMIN_EVENT', 'CASE', 'Admin event', 'Admin message', 'CASE', '88000000-0000-0000-0000-000000000002', '89000000-0000-0000-0000-000000000002', '/cases/88000000-0000-0000-0000-000000000002'),
  ('87000000-0000-0000-0000-000000000003', '86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000003', 'MANAGER_EVENT', 'TASK', 'Manager event', 'Manager message', 'TASK', '88000000-0000-0000-0000-000000000003', '89000000-0000-0000-0000-000000000003', '/tasks'),
  ('87000000-0000-0000-0000-000000000004', '86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000004', 'STAFF_EVENT', 'SERVICE_REQUEST', 'Staff event', 'Staff message', 'SERVICE_REQUEST', '88000000-0000-0000-0000-000000000004', '89000000-0000-0000-0000-000000000004', '/service-desk/88000000-0000-0000-0000-000000000004'),
  ('87000000-0000-0000-0000-000000000005', '86000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000005', 'OTHER_EVENT', 'CASE', 'Other tenant event', 'Other message', 'CASE', '88000000-0000-0000-0000-000000000005', '89000000-0000-0000-0000-000000000005', '/cases/88000000-0000-0000-0000-000000000005'),
  ('87000000-0000-0000-0000-000000000006', '86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000006', 'PLATFORM_EVENT', 'OTHER', 'Platform event', 'Platform message', 'OTHER', '88000000-0000-0000-0000-000000000006', '89000000-0000-0000-0000-000000000006', '/admin');

set local role authenticated;
select set_config('request.jwt.claim.sub', '85000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true((select count(*) from public.notifications) = 4, 'Business Owner sees Owner, Admin, Manager, and Staff notifications in the active organization');
select pg_temp.assert_true(not exists(select 1 from public.notifications where organization_id = '86000000-0000-0000-0000-000000000002'), 'Business Owner cannot see another organization');
select pg_temp.assert_true(not exists(select 1 from public.notifications where recipient_user_id = '85000000-0000-0000-0000-000000000006'), 'Business Owner cannot see a platform recipient');
do $$begin
  perform public.set_notification_read_state('87000000-0000-0000-0000-000000000004', true);
  raise exception 'Owner changed Staff notification state';
exception when insufficient_privilege then null;
end$$;
select public.mark_all_notifications_read('86000000-0000-0000-0000-000000000001');
reset role;

select pg_temp.assert_true((select read_at is not null from public.notifications where id = '87000000-0000-0000-0000-000000000001'), 'Owner can mark the Owner notification read');
select pg_temp.assert_true((select read_at is null from public.notifications where id = '87000000-0000-0000-0000-000000000004'), 'Owner oversight does not mutate Staff read state');

set local role authenticated;
select set_config('request.jwt.claim.sub', '85000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true((select count(*) from public.notifications) = 1, 'Business Admin remains recipient scoped');
select set_config('request.jwt.claim.sub', '85000000-0000-0000-0000-000000000003', true);
select pg_temp.assert_true((select count(*) from public.notifications) = 1, 'Staff Manager remains recipient scoped');
select set_config('request.jwt.claim.sub', '85000000-0000-0000-0000-000000000004', true);
select pg_temp.assert_true((select count(*) from public.notifications) = 1, 'Staff User remains recipient scoped');
select set_config('request.jwt.claim.sub', '85000000-0000-0000-0000-000000000007', true);
select pg_temp.assert_true(not exists(select 1 from public.notifications), 'Customer Portal identity cannot read internal Communications');
select set_config('request.jwt.claim.sub', '85000000-0000-0000-0000-000000000006', true);
select pg_temp.assert_true((select count(*) from public.notifications) = 1, 'SUPER_ADMIN recipient behavior remains personal');
reset role;

select 'DM3Oi Owner Communications visibility regression tests passed' result;
rollback;
