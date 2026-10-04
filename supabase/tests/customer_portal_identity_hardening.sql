begin;

create or replace function pg_temp.assert_true(value boolean,message text)
returns void language plpgsql as $$
begin
  if not value then
    raise exception 'assertion failed: %',message;
  end if;
end
$$;

insert into auth.users(id,email) values
  ('91000000-0000-0000-0000-000000000001','current@example.test'),
  ('91000000-0000-0000-0000-000000000002','replacement@example.test'),
  ('91000000-0000-0000-0000-000000000003','shared@example.test'),
  ('91000000-0000-0000-0000-000000000004','unrelated@example.test');

insert into public.organizations(id,name,slug) values
  ('92000000-0000-0000-0000-000000000001','Portal Identity A','portal-identity-a'),
  ('92000000-0000-0000-0000-000000000002','Portal Identity B','portal-identity-b');

insert into public.organization_settings(organization_id,portal_enabled) values
  ('92000000-0000-0000-0000-000000000001',true),
  ('92000000-0000-0000-0000-000000000002',true);

insert into public.customers(
  id,organization_id,customer_number,type,name,email
) values
  ('93000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','IND-000001','INDIVIDUAL','Current A','current@example.test'),
  ('93000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001','IND-000002','INDIVIDUAL','Shared A1','shared@example.test'),
  ('93000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000001','IND-000003','INDIVIDUAL','Shared A2','shared@example.test'),
  ('93000000-0000-0000-0000-000000000004','92000000-0000-0000-0000-000000000002','IND-000001','INDIVIDUAL','Current B','current@example.test');

insert into public.customer_portal_users(
  id,organization_id,customer_id,user_id,is_active
) values
  ('94000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',true),
  ('94000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000003',true),
  ('94000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000003',true),
  ('94000000-0000-0000-0000-000000000004','92000000-0000-0000-0000-000000000002','93000000-0000-0000-0000-000000000004','91000000-0000-0000-0000-000000000001',true);

insert into public.customer_portal_invitations(
  id,organization_id,customer_id,user_id,recipient_email,status
) values
  ('95000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','current@example.test','SENT'),
  ('95000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000002','93000000-0000-0000-0000-000000000004','91000000-0000-0000-0000-000000000001','current@example.test','SENT');

set constraints customer_portal_identity_consistency_guard immediate;

-- No-op updates to watched columns must not invoke identity retirement.
update public.customers
set email=email
where id='93000000-0000-0000-0000-000000000001';

update public.profiles
set email=email,is_active=is_active
where id='91000000-0000-0000-0000-000000000001';

update auth.users
set email=email
where id='91000000-0000-0000-0000-000000000001';

select pg_temp.assert_true(
  exists (
    select 1
    from public.customer_portal_users
    where id='94000000-0000-0000-0000-000000000001'
      and is_active
  )
  and (
    select status='SENT'
    from public.customer_portal_invitations
    where id='95000000-0000-0000-0000-000000000001'
  ),
  'no-op identity updates preserve valid portal access and invitation state'
);

-- D/F: valid identities remain effective, and one Auth user may represent
-- multiple distinct Customers without violating per-Customer uniqueness.
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000003',true);
select pg_temp.assert_true(
  public.is_customer_portal_user(
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000002'
  ),
  'one valid current identity remains effective'
);
select pg_temp.assert_true(
  public.is_customer_portal_user(
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000003'
  ),
  'same user retains a second distinct valid Customer link'
);
reset role;

-- B/C/E/H: changing only Customer A invalidates its old identity, cancels its
-- live invitation, leaves the same user's other tenant link untouched, and
-- makes the stale identity fail the effective-access predicate and link RLS.
update public.customers
set email='replacement@example.test'
where organization_id='92000000-0000-0000-0000-000000000001'
  and id='93000000-0000-0000-0000-000000000001';

select pg_temp.assert_true(
  not exists (
    select 1 from public.customer_portal_users
    where organization_id='92000000-0000-0000-0000-000000000001'
      and customer_id='93000000-0000-0000-0000-000000000001'
      and is_active
  ),
  'no matching identity deactivates every active link for the Customer'
);
select pg_temp.assert_true(
  (
    select status='CANCELLED'
    from public.customer_portal_invitations
    where id='95000000-0000-0000-0000-000000000001'
  ),
  'superseded invitation is cancelled'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.customer_portal_users
    where id='94000000-0000-0000-0000-000000000004'
      and is_active
  )
  and (
    select status='SENT'
    from public.customer_portal_invitations
    where id='95000000-0000-0000-0000-000000000002'
  ),
  'cross-tenant link and invitation remain untouched'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
select pg_temp.assert_true(
  not public.is_customer_portal_user(
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001'
  ),
  'stale identity cannot satisfy effective portal access'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.customer_portal_users
    where id='94000000-0000-0000-0000-000000000001'
  ),
  'stale identity cannot enumerate its old portal link through RLS'
);
reset role;

insert into public.customer_portal_users(
  id,organization_id,customer_id,user_id,is_active
) values (
  '94000000-0000-0000-0000-000000000005',
  '92000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000002',
  true
);
set constraints customer_portal_identity_consistency_guard immediate;

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true(
  public.is_customer_portal_user(
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001'
  ),
  'replacement identity becomes the sole effective identity'
);
reset role;

-- G: the partial unique index rejects a second active link for the same
-- organization/customer before any deferred identity validation is relevant.
do $$
begin
  insert into public.customer_portal_users(
    organization_id,customer_id,user_id,is_active
  ) values (
    '92000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000004',
    true
  );
  raise exception 'second active Customer Portal identity was accepted';
exception when unique_violation then
  null;
end
$$;

select pg_temp.assert_true(
  not exists (
    select 1
    from public.customer_portal_users
    where is_active
    group by organization_id,customer_id
    having count(*)>1
  ),
  'at most one active identity exists per organization/customer'
);

select 'DM3Oi Customer Portal identity hardening regression tests passed' result;
rollback;
