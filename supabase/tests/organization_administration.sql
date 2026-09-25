begin;
create or replace function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$ begin if not value then raise exception 'assertion failed: %',message; end if; end $$;

insert into auth.users(id,email) values
 ('50000000-0000-0000-0000-000000000001','platform@example.test'),
 ('50000000-0000-0000-0000-000000000002','owner1@example.test'),
 ('50000000-0000-0000-0000-000000000003','owner2@example.test'),
 ('50000000-0000-0000-0000-000000000004','owner3@example.test'),
 ('50000000-0000-0000-0000-000000000005','admin1@example.test'),
 ('50000000-0000-0000-0000-000000000006','admin2@example.test'),
 ('50000000-0000-0000-0000-000000000007','admin3@example.test'),
 ('50000000-0000-0000-0000-000000000008','manager@example.test'),
 ('50000000-0000-0000-0000-000000000009','staff@example.test'),
 ('50000000-0000-0000-0000-000000000010','pending@example.test'),
 ('50000000-0000-0000-0000-000000000011','manager2@example.test'),
 ('50000000-0000-0000-0000-000000000012','staff2@example.test');
insert into public.platform_user_roles(user_id,role) values('50000000-0000-0000-0000-000000000001','SUPER_ADMIN');

select pg_temp.assert_true(public.is_super_admin('50000000-0000-0000-0000-000000000001'),'active profile and active super admin role grant platform access');
update public.profiles set is_active=false where id='50000000-0000-0000-0000-000000000001';
select pg_temp.assert_true(not public.is_super_admin('50000000-0000-0000-0000-000000000001'),'inactive profile and active super admin role deny platform access');
update public.profiles set is_active=true where id='50000000-0000-0000-0000-000000000001';
update public.platform_user_roles set is_active=false where user_id='50000000-0000-0000-0000-000000000001' and role='SUPER_ADMIN';
select pg_temp.assert_true(not public.is_super_admin('50000000-0000-0000-0000-000000000001'),'active profile and inactive super admin role deny platform access');
select pg_temp.assert_true(not public.is_super_admin('50000000-0000-0000-0000-000000000002'),'profile without a super admin role denies platform access');
update public.platform_user_roles set is_active=true where user_id='50000000-0000-0000-0000-000000000001' and role='SUPER_ADMIN';

set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
select (public.create_organization('First Business','first-business')).id organization_id \gset
select pg_temp.assert_true(exists(select 1 from public.organizations where id=:'organization_id' and status='ACTIVE'),'super admin creates active organization visible in register');
select pg_temp.assert_true(public.is_super_admin() and not exists(select 1 from public.organization_members where organization_id=:'organization_id' and user_id=auth.uid()),'super admin enters without membership');

select public.provision_organization_member(:'organization_id','owner1@example.test','BUSINESS_OWNER');
select public.provision_organization_member(:'organization_id','owner2@example.test','BUSINESS_OWNER');
do $$ begin perform public.provision_organization_member((select id from public.organizations where slug='first-business'),'owner3@example.test','BUSINESS_OWNER');raise exception 'third owner accepted';exception when check_violation then null;end $$;
select public.provision_organization_member(:'organization_id','admin1@example.test','BUSINESS_ADMIN');
select public.provision_organization_member(:'organization_id','admin2@example.test','BUSINESS_ADMIN');
do $$ begin perform public.provision_organization_member((select id from public.organizations where slug='first-business'),'admin3@example.test','BUSINESS_ADMIN');raise exception 'third admin accepted';exception when check_violation then null;end $$;
select public.provision_organization_member(:'organization_id','manager@example.test','STAFF_MANAGER');
select public.provision_organization_member(:'organization_id','staff@example.test','STAFF_USER');
select public.provision_organization_member(:'organization_id','owner3@example.test','STAFF_MANAGER');
select public.provision_organization_member(:'organization_id','manager2@example.test','STAFF_MANAGER');
select public.provision_organization_member(:'organization_id','admin3@example.test','STAFF_USER');
select public.provision_organization_member(:'organization_id','staff2@example.test','STAFF_USER');
select pg_temp.assert_true((select count(*) from public.organization_members where organization_id=:'organization_id' and role='STAFF_MANAGER' and is_active)=3,'staff managers are not capped at two');
select pg_temp.assert_true((select count(*) from public.organization_members where organization_id=:'organization_id' and role='STAFF_USER' and is_active)=3,'staff users are not capped at two');
do $$ declare target uuid;begin select id into target from public.organization_members where user_id='50000000-0000-0000-0000-000000000004';perform public.update_organization_membership(target,'BUSINESS_OWNER',true);raise exception 'capped role change accepted';exception when check_violation then null;end $$;
do $$ begin perform public.provision_organization_member((select id from public.organizations where slug='first-business'),'staff@example.test','SUPER_ADMIN');raise exception 'super admin membership accepted';exception when invalid_parameter_value then null;end $$;

select id membership_id from public.organization_members where organization_id=:'organization_id' and user_id='50000000-0000-0000-0000-000000000009' \gset
select public.update_organization_membership(:'membership_id','STAFF_MANAGER',false);
select pg_temp.assert_true(not public.is_internal_member(:'organization_id','50000000-0000-0000-0000-000000000009'),'deactivation revokes tenant access');
select public.update_organization_membership(:'membership_id','STAFF_USER',true);
select pg_temp.assert_true(public.has_organization_role(:'organization_id',array['STAFF_USER']::public.application_role[],'50000000-0000-0000-0000-000000000009'),'role changes and reactivation work');

reset role;set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000009',true);
do $$ begin perform public.create_organization('Forbidden','forbidden');raise exception 'normal role created organization';exception when insufficient_privilege then null;end $$;
reset role;set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
select public.update_organization(:'organization_id','First Business','first-business','SUSPENDED');
select pg_temp.assert_true(not public.is_internal_member(:'organization_id','50000000-0000-0000-0000-000000000009'),'inactive organization revokes tenant workspace access');
select pg_temp.assert_true(exists(select 1 from public.profiles p where p.email='pending@example.test' and not exists(select 1 from public.platform_user_roles r where r.user_id=p.id and r.is_active) and not exists(select 1 from public.organization_members m where m.user_id=p.id and m.is_active) and not exists(select 1 from public.customer_portal_users c where c.user_id=p.id and c.is_active)),'pending profile is derivable');
reset role;
select 'DM3iQCM organization administration regression tests passed' result;
rollback;
