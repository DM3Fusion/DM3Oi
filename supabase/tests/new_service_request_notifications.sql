begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin
  if not value then raise exception 'assertion failed: %', message; end if;
end
$$;

create or replace function pg_temp.assert_recipients(request_id uuid, expected uuid[], message text)
returns void language plpgsql as $$
declare actual uuid[];
begin
  select coalesce(array_agg(n.recipient_user_id order by n.recipient_user_id), '{}'::uuid[])
  into actual
  from public.notifications n
  where n.notification_type = 'NEW_SERVICE_REQUEST_RECEIVED'
    and n.source_domain = 'SERVICE_REQUEST'
    and n.source_entity_id = request_id
    and n.source_event_id = request_id;
  if actual is distinct from expected then
    raise exception 'assertion failed: % (expected %, received %)', message, expected, actual;
  end if;
end
$$;

insert into auth.users(id, email) values
  ('81000000-0000-0000-0000-000000000001', 'owner@new-request.test'),
  ('81000000-0000-0000-0000-000000000002', 'admin@new-request.test'),
  ('81000000-0000-0000-0000-000000000003', 'manager@new-request.test'),
  ('81000000-0000-0000-0000-000000000004', 'staff@new-request.test'),
  ('81000000-0000-0000-0000-000000000005', 'other-tenant@new-request.test'),
  ('81000000-0000-0000-0000-000000000006', 'platform@new-request.test'),
  ('81000000-0000-0000-0000-000000000007', 'portal@new-request.test');

insert into public.organizations(id, name, slug) values
  ('82000000-0000-0000-0000-000000000001', 'New Request Tenant', 'new-request-tenant'),
  ('82000000-0000-0000-0000-000000000002', 'Other New Request Tenant', 'other-new-request-tenant');

insert into public.organization_members(organization_id, user_id, role) values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'BUSINESS_OWNER'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', 'BUSINESS_ADMIN'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000003', 'STAFF_MANAGER'),
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000004', 'STAFF_USER'),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000005', 'BUSINESS_OWNER');

insert into public.platform_user_roles(user_id, role)
values ('81000000-0000-0000-0000-000000000006', 'SUPER_ADMIN');

insert into public.customers(id, organization_id, customer_number, type, name, created_by_user_id) values
  ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'CUST-NOTIFY', 'BUSINESS', 'Notification Customer', '81000000-0000-0000-0000-000000000001');

insert into public.customer_portal_users(id, organization_id, customer_id, user_id) values
  ('83500000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000007');

insert into public.service_requests(id, organization_id, request_number, customer_id, subject, description, assigned_user_id, created_by_user_id) values
  ('84000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'SR-NOTIFY-1', '83000000-0000-0000-0000-000000000001', 'Assigned owner', 'Test', '81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001'),
  ('84000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', 'SR-NOTIFY-2', '83000000-0000-0000-0000-000000000001', 'Assigned admin', 'Test', '81000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001'),
  ('84000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001', 'SR-NOTIFY-3', '83000000-0000-0000-0000-000000000001', 'Assigned manager', 'Test', '81000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000001'),
  ('84000000-0000-0000-0000-000000000004', '82000000-0000-0000-0000-000000000001', 'SR-NOTIFY-4', '83000000-0000-0000-0000-000000000001', 'Assigned staff', 'Test', '81000000-0000-0000-0000-000000000004', '81000000-0000-0000-0000-000000000001'),
  ('84000000-0000-0000-0000-000000000005', '82000000-0000-0000-0000-000000000001', 'SR-NOTIFY-5', '83000000-0000-0000-0000-000000000001', 'Unassigned', 'Test', null, '81000000-0000-0000-0000-000000000004');

select pg_temp.assert_recipients(
  '84000000-0000-0000-0000-000000000001',
  array['81000000-0000-0000-0000-000000000001'::uuid],
  'a self-assigned Business Owner is the sole recipient'
);
select pg_temp.assert_recipients(
  '84000000-0000-0000-0000-000000000002',
  array['81000000-0000-0000-0000-000000000002'::uuid],
  'an assigned Business Admin is the sole recipient'
);
select pg_temp.assert_recipients(
  '84000000-0000-0000-0000-000000000003',
  array['81000000-0000-0000-0000-000000000003'::uuid],
  'an assigned Staff Manager is the sole recipient'
);
select pg_temp.assert_recipients(
  '84000000-0000-0000-0000-000000000004',
  array['81000000-0000-0000-0000-000000000004'::uuid],
  'an assigned Staff User is the sole recipient'
);
select pg_temp.assert_recipients(
  '84000000-0000-0000-0000-000000000005',
  array[
    '81000000-0000-0000-0000-000000000001'::uuid,
    '81000000-0000-0000-0000-000000000002'::uuid,
    '81000000-0000-0000-0000-000000000003'::uuid
  ],
  'an unassigned request reaches only effective management recipients'
);

select pg_temp.assert_true(
  not exists (
    select 1 from public.notifications
    where recipient_user_id in (
      '81000000-0000-0000-0000-000000000005',
      '81000000-0000-0000-0000-000000000006',
      '81000000-0000-0000-0000-000000000007'
    )
  ),
  'cross-tenant, platform, and portal identities are excluded'
);

select pg_temp.assert_true(
  not exists (
    select source_entity_id, recipient_user_id
    from public.notifications
    where notification_type = 'NEW_SERVICE_REQUEST_RECEIVED'
    group by source_entity_id, recipient_user_id
    having count(*) > 1
  ),
  'one logical notification exists per intended recipient and event'
);

select 'DM3Oi new Service Request recipient regression tests passed' result;
rollback;
