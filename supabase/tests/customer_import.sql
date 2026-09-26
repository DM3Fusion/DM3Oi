begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end
$$;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values (
  '97000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'customer-import-super@test.local',
  '{}',
  '{}',
  now(),
  now()
);

insert into public.platform_user_roles(user_id,role)
values ('97000000-0000-0000-0000-000000000001','SUPER_ADMIN');

insert into public.organizations(id,name,slug)
values (
  '97100000-0000-0000-0000-000000000001',
  'Customer Import Test',
  'customer-import-test'
);

insert into public.customers(
  organization_id,customer_number,type,name,email,phone,created_by_user_id,
  first_name,last_name,street_address,city,state,postal_code
) values (
  '97100000-0000-0000-0000-000000000001','I2000001','INDIVIDUAL',
  'Existing Person','existing@test.local','2125550100',
  '97000000-0000-0000-0000-000000000001',
  'Existing','Person','1 Existing Rd','Austin','TX','78701'
);

create temporary table customer_import_result(payload jsonb);
grant select,insert on customer_import_result to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '97000000-0000-0000-0000-000000000001',
  true
);

insert into customer_import_result(payload)
select public.super_admin_import_customers(
  '97100000-0000-0000-0000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'row_number',2,'first_name','Ava','last_name','Stone',
      'street_address','12 Main St','city','Austin','state','tx',
      'postal_code','78702','email','AVA.NEW@EXAMPLE.COM','phone','(512) 555-0100'
    ),
    jsonb_build_object(
      'row_number',3,'first_name','Mia','last_name','Reed',
      'street_address','4 Pine Rd','city','Dallas','state','TX',
      'postal_code','75201','email','mia.new@example.com','phone','214-555-0100'
    ),
    jsonb_build_object(
      'row_number',4,'first_name','Existing','last_name','Person',
      'street_address','1 Existing Rd','city','Austin','state','TX',
      'postal_code','78701','email','existing@test.local','phone','2125550100'
    ),
    jsonb_build_object(
      'row_number',5,'first_name','Bad','last_name','State',
      'street_address','9 Invalid Rd','city','Nowhere','state','XX',
      'postal_code','12345','email','bad-state@example.com','phone','3105550100'
    )
  )
);

select pg_temp.assert_true(
  (select (payload->>'created')::integer=2
     and (payload->>'skipped_exact')::integer=1
     and (payload->>'held_duplicates')::integer=0
     and (payload->>'invalid')::integer=1
   from customer_import_result),
  'import classifies the complete representative set and inserts only NEW rows'
);

select pg_temp.assert_true(
  (select count(*)=2
   from public.customers
   where organization_id='97100000-0000-0000-0000-000000000001'
     and email in ('ava.new@example.com','mia.new@example.com')),
  'NEW Customer rows are inserted after classification'
);

select pg_temp.assert_true(
  (select bool_and(
     customer_number ~ '^I[0-9]{4}[0-9]{3}$'
     and created_by_user_id='97000000-0000-0000-0000-000000000001'
     and phone ~ '^[0-9]{10}$'
   )
   from public.customers
   where organization_id='97100000-0000-0000-0000-000000000001'
     and email in ('ava.new@example.com','mia.new@example.com')),
  'import preserves canonical numbering, actor attribution, and normalization'
);

reset role;
select 'DM3Oi Customer import regression tests passed' result;
rollback;
