-- SUPER_ADMIN Customer Data Management: structured identity, safe import, and atomic merge.

alter table public.customers
  add column first_name text,
  add column last_name text,
  add column street_address text,
  add column city text,
  add column state text,
  add column postal_code text;

create or replace function public.normalize_customer_structured_fields()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  derived_name text;
  phone_source text;
begin
  new.first_name:=nullif(trim(new.first_name),'');
  new.last_name:=nullif(trim(new.last_name),'');
  new.street_address:=nullif(trim(new.street_address),'');
  new.city:=nullif(trim(new.city),'');
  new.state:=nullif(upper(trim(new.state)),'');
  new.postal_code:=nullif(trim(new.postal_code),'');
  new.email:=nullif(lower(trim(new.email)),'');
  phone_source:=nullif(trim(new.phone),'');
  if phone_source is not null
     and phone_source !~ '^([0-9]{10}|1[0-9]{10}|[0-9]{3}[- ][0-9]{3}[- ][0-9]{4}|\([0-9]{3}\)[ -][0-9]{3}[- ][0-9]{4}|\+1[ -][0-9]{3}[- ][0-9]{3}[- ][0-9]{4}|\+1[ -]\([0-9]{3}\)[ -][0-9]{3}[- ][0-9]{4})$' then
    raise exception 'invalid customer phone' using errcode='22023';
  end if;
  new.phone:=nullif(regexp_replace(coalesce(phone_source,''),'[^0-9]','','g'),'');
  new.notes:=nullif(trim(new.notes),'');

  derived_name:=nullif(trim(concat_ws(' ',new.first_name,new.last_name)),'');
  if tg_op='INSERT' then
    new.name:=coalesce(derived_name,trim(new.name));
  elsif new.first_name is distinct from old.first_name
     or new.last_name is distinct from old.last_name then
    new.name:=coalesce(derived_name,trim(new.name));
  else
    -- Preserve an explicit display-name choice and legacy name-only records when
    -- structured identity fields did not change.
    new.name:=trim(new.name);
  end if;

  if new.state is not null and new.state !~ '^[A-Z]{2}$' then
    raise exception 'invalid customer state' using errcode='22023';
  end if;
  if new.state is not null and not (new.state=any(array[
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
  ]::text[])) then
    raise exception 'invalid U.S. state code' using errcode='22023';
  end if;
  if new.postal_code is not null and new.postal_code !~ '^[0-9]{5}(-[0-9]{4})?$' then
    raise exception 'invalid customer postal code' using errcode='22023';
  end if;
  if new.email is not null and new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid customer email' using errcode='22023';
  end if;
  if new.phone is not null and (length(new.phone) not in (10,11)
      or (length(new.phone)=11 and left(new.phone,1)<>'1')) then
    raise exception 'invalid customer phone' using errcode='22023';
  end if;
  return new;
end
$$;

create trigger customers_normalize_structured_fields
before insert or update of first_name,last_name,name,email,phone,notes,street_address,city,state,postal_code
on public.customers
for each row execute function public.normalize_customer_structured_fields();

revoke all on function public.normalize_customer_structured_fields()
  from public,anon,authenticated;

create or replace view public.organization_customers with (security_barrier=true) as
select c.id,c.organization_id,c.customer_number,c.type,c.name,c.email,c.phone,c.status,c.notes,
  public.organization_actor_id(c.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(c.created_by_user_id) as created_by_display_name,c.created_at,c.updated_at,
  c.first_name,c.last_name,c.street_address,c.city,c.state,c.postal_code
from public.customers c
where public.is_super_admin(auth.uid()) or public.is_internal_member(c.organization_id,auth.uid())
  or public.is_customer_portal_user(c.organization_id,c.id,auth.uid());

grant select on public.organization_customers to authenticated;
grant select(first_name,last_name,street_address,city,state,postal_code)
  on public.customers to authenticated;

drop policy if exists customers_effective_update on public.customers;
create policy customers_effective_update
on public.customers for update to authenticated
using(public.has_effective_organization_permission(organization_id,'EDIT_CUSTOMER'))
with check(public.has_effective_organization_permission(organization_id,'EDIT_CUSTOMER'));

-- Direct Customer edits remain RLS-gated by customers_effective_update. Clear
-- every possible column UPDATE grant before granting only the editable fields.
revoke update(
  id,organization_id,customer_number,type,name,email,phone,status,notes,
  created_by_user_id,created_at,updated_at,
  first_name,last_name,street_address,city,state,postal_code
) on public.customers from authenticated;
grant update(
  type,name,email,phone,status,notes,
  first_name,last_name,street_address,city,state,postal_code
) on public.customers to authenticated;

create or replace function public.create_customer_record(
  target_organization_id uuid,
  target_type public.customer_type,
  target_name text,
  target_email text,
  target_phone text,
  target_notes text,
  target_first_name text,
  target_last_name text,
  target_street_address text,
  target_city text,
  target_state text,
  target_postal_code text
) returns public.customers
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  normalized_email text:=lower(trim(coalesce(target_email,'')));
  phone_source text:=trim(coalesce(target_phone,''));
  normalized_phone text;
  display_name text:=nullif(trim(concat_ws(' ',nullif(trim(target_first_name),''),nullif(trim(target_last_name),''))),'');
  created public.customers;
begin
  if actor is null or not public.has_effective_organization_permission(target_organization_id,'CREATE_CUSTOMER') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if target_type is null or target_type not in ('INDIVIDUAL','BUSINESS') then
    raise exception 'invalid customer type' using errcode='22023';
  end if;
  display_name:=coalesce(display_name,nullif(trim(target_name),''));
  if display_name is null then raise exception 'invalid customer name' using errcode='22023'; end if;
  if normalized_email='' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid customer email' using errcode='22023';
  end if;
  if phone_source !~ '^([0-9]{10}|[0-9]{3}[- ][0-9]{3}[- ][0-9]{4}|\([0-9]{3}\)[ -][0-9]{3}[- ][0-9]{4}|\+1[ -][0-9]{3}[- ][0-9]{3}[- ][0-9]{4}|\+1[ -]\([0-9]{3}\)[ -][0-9]{3}[- ][0-9]{4})$' then
    raise exception 'invalid customer phone' using errcode='22023';
  end if;
  normalized_phone:=regexp_replace(phone_source,'[^0-9]','','g');
  if length(normalized_phone) not in (10,11)
     or (length(normalized_phone)=11 and left(normalized_phone,1)<>'1') then
    raise exception 'invalid customer phone' using errcode='22023';
  end if;

  insert into public.customers(
    organization_id,customer_number,type,name,email,phone,notes,created_by_user_id,
    first_name,last_name,street_address,city,state,postal_code
  ) values (
    target_organization_id,public.next_customer_number(target_organization_id,target_type),
    target_type,display_name,normalized_email,normalized_phone,nullif(trim(target_notes),''),actor,
    target_first_name,target_last_name,target_street_address,target_city,target_state,target_postal_code
  ) returning * into created;
  return created;
end
$$;

revoke all on function public.create_customer_record(
  uuid,public.customer_type,text,text,text,text,text,text,text,text,text,text
) from public,anon;
grant execute on function public.create_customer_record(
  uuid,public.customer_type,text,text,text,text,text,text,text,text,text,text
) to authenticated;

comment on function public.create_customer_record(
  uuid,public.customer_type,text,text,text,text,text,text,text,text,text,text
) is 'Structured Customer creation using effective tenant permission and canonical annual numbering. The legacy six-argument overload remains compatible.';

create table public.customer_merge_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  surviving_customer_id uuid not null,
  merged_customer_id uuid not null,
  surviving_customer_number text not null,
  merged_customer_number text not null,
  surviving_customer_snapshot jsonb not null check(jsonb_typeof(surviving_customer_snapshot)='object'),
  merged_customer_snapshot jsonb not null check(jsonb_typeof(merged_customer_snapshot)='object'),
  field_resolution jsonb not null check(jsonb_typeof(field_resolution)='object'),
  dependency_move_summary jsonb not null check(jsonb_typeof(dependency_move_summary)='object'),
  performed_by_user_id uuid not null,
  performed_at timestamptz not null default now(),
  check(surviving_customer_id<>merged_customer_id)
);

create index customer_merge_history_organization_performed_idx
  on public.customer_merge_history(organization_id,performed_at desc);

alter table public.customer_merge_history enable row level security;
create policy customer_merge_history_super_admin_select
on public.customer_merge_history for select to authenticated
using(public.is_super_admin(auth.uid()));
revoke all on public.customer_merge_history from public,anon,authenticated;
grant select on public.customer_merge_history to authenticated;

comment on table public.customer_merge_history is
  'Durable SUPER_ADMIN Customer merge audit. Customer UUIDs are deliberately not foreign keys so deletion cannot erase or block history.';

-- Permit the merge transaction to move portal identity links and their requester-bound
-- Service Requests together without a transient composite-FK violation.
alter table public.service_requests
  drop constraint service_requests_organization_id_customer_id_requester_use_fkey;
alter table public.service_requests
  add constraint service_requests_organization_id_customer_id_requester_use_fkey
  foreign key(organization_id,customer_id,requester_user_id)
  references public.customer_portal_users(organization_id,customer_id,user_id)
  deferrable initially immediate;

create or replace function public.is_known_customer_foreign_key(
  target_constraint_oid oid
) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  constraint_row pg_catalog.pg_constraint;
  source_columns name[];
  target_columns name[];
begin
  select * into constraint_row
  from pg_catalog.pg_constraint
  where oid=target_constraint_oid
    and contype='f'
    and confrelid='public.customers'::regclass;
  if not found then return false; end if;

  select array_agg(attribute.attname order by key_position.position)
  into source_columns
  from unnest(constraint_row.conkey) with ordinality as key_position(attnum,position)
  join pg_catalog.pg_attribute attribute
    on attribute.attrelid=constraint_row.conrelid
   and attribute.attnum=key_position.attnum;

  select array_agg(attribute.attname order by key_position.position)
  into target_columns
  from unnest(constraint_row.confkey) with ordinality as key_position(attnum,position)
  join pg_catalog.pg_attribute attribute
    on attribute.attrelid=constraint_row.confrelid
   and attribute.attnum=key_position.attnum;

  return coalesce(target_columns=array['organization_id','id']::name[] and (
    (constraint_row.conrelid='public.cases'::regclass
      and constraint_row.conname='cases_organization_id_customer_id_fkey'
      and source_columns=array['organization_id','customer_id']::name[])
    or (constraint_row.conrelid='public.service_requests'::regclass
      and constraint_row.conname='service_requests_organization_id_customer_id_fkey'
      and source_columns=array['organization_id','customer_id']::name[])
    or (constraint_row.conrelid='public.guided_case_intake_drafts'::regclass
      and constraint_row.conname='guided_case_intake_drafts_organization_id_customer_id_fkey'
      and source_columns=array['organization_id','customer_id']::name[])
    or (constraint_row.conrelid='public.customer_portal_users'::regclass
      and constraint_row.conname='customer_portal_users_organization_id_customer_id_fkey'
      and source_columns=array['organization_id','customer_id']::name[])
  ),false);
end
$$;

alter function public.is_known_customer_foreign_key(oid) owner to postgres;
revoke all on function public.is_known_customer_foreign_key(oid)
  from public,anon,authenticated;

create or replace function public.super_admin_customer_merge_preview(
  target_organization_id uuid,
  target_surviving_customer_id uuid,
  target_merged_customer_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  survivor public.customers;
  merged public.customers;
  survivor_portal_count bigint;
  merged_portal_count bigint;
  unknown_dependencies text[];
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if target_surviving_customer_id=target_merged_customer_id then
    raise exception 'customers must be different' using errcode='22023';
  end if;

  select * into survivor from public.customers
  where id=target_surviving_customer_id and organization_id=target_organization_id;
  select * into merged from public.customers
  where id=target_merged_customer_id and organization_id=target_organization_id;
  if survivor.id is null or merged.id is null then
    raise exception 'customer not found in target organization' using errcode='P0002';
  end if;

  select array_agg(
    format('%s.%I: %s',conrelid::regclass::text,conname,pg_catalog.pg_get_constraintdef(oid,true))
    order by conrelid::regclass::text,conname
  )
  into unknown_dependencies
  from pg_catalog.pg_constraint
  where contype='f' and confrelid='public.customers'::regclass
    and not public.is_known_customer_foreign_key(oid);

  select count(*) into survivor_portal_count from public.customer_portal_users
  where organization_id=target_organization_id and customer_id=survivor.id;
  select count(*) into merged_portal_count from public.customer_portal_users
  where organization_id=target_organization_id and customer_id=merged.id;

  return jsonb_build_object(
    'eligible',unknown_dependencies is null and not (survivor_portal_count>0 and merged_portal_count>0),
    'survivor',to_jsonb(survivor),
    'merged',to_jsonb(merged),
    'unknown_dependencies',coalesce(to_jsonb(unknown_dependencies),'[]'::jsonb),
    'portal_collision',survivor_portal_count>0 and merged_portal_count>0,
    'dependency_counts',jsonb_build_object(
      'cases',(select count(*) from public.cases where organization_id=target_organization_id and customer_id=merged.id),
      'service_requests',(select count(*) from public.service_requests where organization_id=target_organization_id and customer_id=merged.id),
      'guided_intake_drafts',(select count(*) from public.guided_case_intake_drafts where organization_id=target_organization_id and customer_id=merged.id),
      'portal_links',merged_portal_count,
      'survivor_portal_links',survivor_portal_count
    )
  );
end
$$;

create or replace function public.super_admin_merge_customers(
  target_organization_id uuid,
  target_surviving_customer_id uuid,
  target_merged_customer_id uuid,
  target_field_resolution jsonb,
  target_confirmation text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  survivor public.customers;
  merged public.customers;
  resolved jsonb:=coalesce(target_field_resolution->'values','{}'::jsonb);
  notes_strategy text:=coalesce(target_field_resolution->>'notes_strategy','COMBINE');
  resolved_notes text;
  case_count bigint;
  request_count bigint;
  draft_count bigint;
  portal_count bigint;
  survivor_portal_count bigint;
  unknown_dependencies text[];
  audit_id uuid;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if coalesce(jsonb_typeof(target_field_resolution),'null')<>'object'
     or coalesce(jsonb_typeof(target_field_resolution->'values'),'null')<>'object' then
    raise exception 'invalid field resolution' using errcode='22023';
  end if;
  if target_surviving_customer_id=target_merged_customer_id then
    raise exception 'customers must be different' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text,0));
  select * into survivor from public.customers
  where id=target_surviving_customer_id and organization_id=target_organization_id for update;
  select * into merged from public.customers
  where id=target_merged_customer_id and organization_id=target_organization_id for update;
  if survivor.id is null or merged.id is null then
    raise exception 'customer not found in target organization' using errcode='P0002';
  end if;
  if target_confirmation<>format('MERGE %s INTO %s',merged.customer_number,survivor.customer_number) then
    raise exception 'merge confirmation does not match' using errcode='22023';
  end if;

  select array_agg(
    format('%s.%I: %s',conrelid::regclass::text,conname,pg_catalog.pg_get_constraintdef(oid,true))
    order by conrelid::regclass::text,conname
  )
  into unknown_dependencies
  from pg_catalog.pg_constraint
  where contype='f' and confrelid='public.customers'::regclass
    and not public.is_known_customer_foreign_key(oid);
  if unknown_dependencies is not null then
    raise exception 'unhandled customer dependencies' using errcode='23514',detail=to_jsonb(unknown_dependencies)::text;
  end if;

  select count(*) into survivor_portal_count from public.customer_portal_users
  where organization_id=target_organization_id and customer_id=survivor.id;
  select count(*) into portal_count from public.customer_portal_users
  where organization_id=target_organization_id and customer_id=merged.id;
  if survivor_portal_count>0 and portal_count>0 then
    raise exception 'both customers have portal identities; resolve portal access before merge'
      using errcode='23514';
  end if;

  if notes_strategy='SURVIVOR' then
    resolved_notes:=survivor.notes;
  elsif notes_strategy='MERGED' then
    resolved_notes:=merged.notes;
  elsif notes_strategy='CUSTOM' then
    resolved_notes:=nullif(trim(resolved->>'notes'),'');
  elsif notes_strategy='COMBINE' then
    if nullif(trim(coalesce(survivor.notes,'')),'') is null then resolved_notes:=merged.notes;
    elsif nullif(trim(coalesce(merged.notes,'')),'') is null or survivor.notes=merged.notes then resolved_notes:=survivor.notes;
    else resolved_notes:=format('[%s]%s%s%s[%s]%s%s',survivor.customer_number,E'\n',survivor.notes,E'\n\n',merged.customer_number,E'\n',merged.notes);
    end if;
  else
    raise exception 'invalid notes strategy' using errcode='22023';
  end if;

  set constraints service_requests_organization_id_customer_id_requester_use_fkey deferred;
  update public.customer_portal_users set customer_id=survivor.id
  where organization_id=target_organization_id and customer_id=merged.id;
  get diagnostics portal_count=row_count;
  update public.service_requests set customer_id=survivor.id
  where organization_id=target_organization_id and customer_id=merged.id;
  get diagnostics request_count=row_count;
  update public.cases set customer_id=survivor.id
  where organization_id=target_organization_id and customer_id=merged.id;
  get diagnostics case_count=row_count;
  update public.guided_case_intake_drafts set customer_id=survivor.id
  where organization_id=target_organization_id and customer_id=merged.id;
  get diagnostics draft_count=row_count;

  update public.customers set
    first_name=case when resolved ? 'first_name' then nullif(trim(resolved->>'first_name'),'') else survivor.first_name end,
    last_name=case when resolved ? 'last_name' then nullif(trim(resolved->>'last_name'),'') else survivor.last_name end,
    name=coalesce(nullif(trim(resolved->>'name'),''),survivor.name),
    email=case when resolved ? 'email' then nullif(lower(trim(resolved->>'email')),'') else survivor.email end,
    phone=case when resolved ? 'phone' then nullif(regexp_replace(resolved->>'phone','[^0-9]','','g'),'') else survivor.phone end,
    street_address=case when resolved ? 'street_address' then nullif(trim(resolved->>'street_address'),'') else survivor.street_address end,
    city=case when resolved ? 'city' then nullif(trim(resolved->>'city'),'') else survivor.city end,
    state=case when resolved ? 'state' then nullif(upper(trim(resolved->>'state')),'') else survivor.state end,
    postal_code=case when resolved ? 'postal_code' then nullif(trim(resolved->>'postal_code'),'') else survivor.postal_code end,
    type=coalesce(nullif(resolved->>'type','')::public.customer_type,survivor.type),
    status=coalesce(nullif(resolved->>'status','')::public.customer_status,survivor.status),
    notes=resolved_notes
  where id=survivor.id and organization_id=target_organization_id;

  -- The normalizer derives a name when structured names change. A merge may
  -- deliberately resolve the compatibility display name separately, so apply
  -- that explicit choice in a name-only update after structured normalization.
  if nullif(trim(resolved->>'name'),'') is not null then
    update public.customers set name=trim(resolved->>'name')
    where id=survivor.id and organization_id=target_organization_id;
  end if;

  if exists(select 1 from public.customer_portal_users where organization_id=target_organization_id and customer_id=merged.id)
    or exists(select 1 from public.cases where organization_id=target_organization_id and customer_id=merged.id)
    or exists(select 1 from public.service_requests where organization_id=target_organization_id and customer_id=merged.id)
    or exists(select 1 from public.guided_case_intake_drafts where organization_id=target_organization_id and customer_id=merged.id) then
    raise exception 'customer still has references after reparenting' using errcode='23514';
  end if;

  insert into public.customer_merge_history(
    organization_id,surviving_customer_id,merged_customer_id,
    surviving_customer_number,merged_customer_number,
    surviving_customer_snapshot,merged_customer_snapshot,field_resolution,
    dependency_move_summary,performed_by_user_id
  ) values (
    target_organization_id,survivor.id,merged.id,survivor.customer_number,merged.customer_number,
    to_jsonb(survivor),to_jsonb(merged),target_field_resolution,
    jsonb_build_object('cases',case_count,'service_requests',request_count,'guided_intake_drafts',draft_count,'portal_links',portal_count),actor
  ) returning id into audit_id;

  delete from public.customers where id=merged.id and organization_id=target_organization_id;
  if not found then raise exception 'merged customer delete failed' using errcode='P0001'; end if;
  set constraints service_requests_organization_id_customer_id_requester_use_fkey immediate;

  return jsonb_build_object(
    'merged',true,'audit_id',audit_id,'surviving_customer_id',survivor.id,
    'merged_customer_id',merged.id,
    'dependency_move_summary',jsonb_build_object('cases',case_count,'service_requests',request_count,'guided_intake_drafts',draft_count,'portal_links',portal_count)
  );
end
$$;

create or replace function public.super_admin_import_customers(
  target_organization_id uuid,
  target_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  item jsonb;
  other_item jsonb;
  input_position bigint;
  row_number integer;
  first_name text;
  last_name text;
  street_address text;
  city_name text;
  state_code text;
  postal text;
  email_address text;
  phone_number text;
  display_name text;
  reason text;
  classification text;
  existing_number text;
  created_customer public.customers;
  prepared_rows jsonb:='[]'::jsonb;
  classified_rows jsonb:='[]'::jsonb;
  outcomes jsonb:='[]'::jsonb;
  created_count integer:=0;
  exact_count integer:=0;
  duplicate_count integer:=0;
  invalid_count integer:=0;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if not exists(select 1 from public.organizations where id=target_organization_id and status='ACTIVE') then
    raise exception 'target organization is not active' using errcode='23514';
  end if;
  if coalesce(jsonb_typeof(target_rows),'null')<>'array' then
    raise exception 'import rows must be a JSON array' using errcode='22023';
  end if;
  if jsonb_array_length(target_rows)=0 or jsonb_array_length(target_rows)>500 then
    raise exception 'import must contain between 1 and 500 rows' using errcode='22023';
  end if;

  -- PHASE A1: normalize and validate every input row. No Customer writes occur.
  for item,input_position in
    select value,ordinality
    from jsonb_array_elements(target_rows) with ordinality
  loop
    row_number:=(input_position+1)::integer;
    reason:=null;
    if coalesce(jsonb_typeof(item),'null')<>'object' then
      reason:='Row must be a JSON object.';
    elsif coalesce(item->>'row_number','') ~ '^[0-9]{1,9}$' then
      row_number:=(item->>'row_number')::integer;
      if row_number<2 then reason:='Invalid source row number.'; end if;
    else
      reason:='Invalid source row number.';
    end if;

    first_name:=trim(coalesce(item->>'first_name',''));
    last_name:=trim(coalesce(item->>'last_name',''));
    street_address:=trim(coalesce(item->>'street_address',''));
    city_name:=trim(coalesce(item->>'city',''));
    state_code:=upper(trim(coalesce(item->>'state','')));
    postal:=trim(coalesce(item->>'postal_code',''));
    email_address:=lower(trim(coalesce(item->>'email','')));
    phone_number:=regexp_replace(coalesce(item->>'phone',''),'[^0-9]','','g');
    display_name:=trim(concat_ws(' ',first_name,last_name));

    if reason is null then
      if first_name='' then reason:='First name is required.';
      elsif last_name='' then reason:='Last name is required.';
      elsif street_address='' then reason:='Street address is required.';
      elsif city_name='' then reason:='City is required.';
      elsif not (state_code=any(array['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']::text[])) then reason:='State must be a valid U.S. code.';
      elsif postal !~ '^[0-9]{5}(-[0-9]{4})?$' then reason:='Postal code must be ZIP or ZIP+4.';
      elsif email_address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then reason:='Email is invalid.';
      elsif length(phone_number) not in (10,11) or (length(phone_number)=11 and left(phone_number,1)<>'1') then reason:='Phone is invalid.';
      end if;
    end if;

    prepared_rows:=prepared_rows||jsonb_build_array(jsonb_build_object(
      '_source_index',input_position,'row_number',row_number,
      'first_name',first_name,'last_name',last_name,'name',display_name,
      'street_address',street_address,'city',city_name,'state',state_code,
      'postal_code',postal,'email',email_address,'phone',phone_number,
      'validation_reason',reason
    ));
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(target_organization_id::text,1));
  lock table public.customers in share row exclusive mode;
  -- PHASE A2: classify the complete normalized set against the locked Customer
  -- population and every other valid CSV row. Still no Customer writes occur.
  for item in select value from jsonb_array_elements(prepared_rows) loop
    row_number:=(item->>'row_number')::integer;
    first_name:=item->>'first_name';
    last_name:=item->>'last_name';
    street_address:=item->>'street_address';
    city_name:=item->>'city';
    state_code:=item->>'state';
    postal:=item->>'postal_code';
    email_address:=item->>'email';
    phone_number:=item->>'phone';
    display_name:=item->>'name';
    reason:=item->>'validation_reason';
    classification:='NEW';
    existing_number:=null;

    if reason is not null then
      classification:='INVALID'; invalid_count:=invalid_count+1;
    else
      select c.customer_number into existing_number from public.customers c
      where c.organization_id=target_organization_id
        and lower(coalesce(c.email,''))=email_address
        and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=phone_number
      order by c.created_at limit 1;
      if found then
        classification:='EXACT'; reason:='Email and phone match an existing Customer.'; exact_count:=exact_count+1;
      elsif exists(
        select 1 from public.customers c where c.organization_id=target_organization_id and (
          lower(coalesce(c.email,''))=email_address
          or regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=phone_number
          or (lower(regexp_replace(coalesce(c.first_name,''),'[^[:alnum:]]','','g'))=lower(regexp_replace(first_name,'[^[:alnum:]]','','g'))
              and lower(regexp_replace(coalesce(c.last_name,''),'[^[:alnum:]]','','g'))=lower(regexp_replace(last_name,'[^[:alnum:]]','','g'))
              and regexp_replace(coalesce(c.postal_code,''),'[^0-9]','','g')=regexp_replace(postal,'[^0-9]','','g'))
          or (lower(regexp_replace(c.name,'[^[:alnum:]]','','g'))=lower(regexp_replace(display_name,'[^[:alnum:]]','','g'))
              and lower(regexp_replace(coalesce(c.street_address,''),'[^[:alnum:]]','','g'))=lower(regexp_replace(street_address,'[^[:alnum:]]','','g')))
        )
      ) then
        classification:='DUPLICATE'; reason:='A strong identity signal matches an existing Customer.'; duplicate_count:=duplicate_count+1;
      else
        for other_item in select value from jsonb_array_elements(prepared_rows) loop
          if other_item->>'validation_reason' is null
             and (other_item->>'_source_index')::bigint<>(item->>'_source_index')::bigint
             and (
            other_item->>'email'=email_address
            or other_item->>'phone'=phone_number
            or (lower(regexp_replace(other_item->>'first_name','[^[:alnum:]]','','g'))=lower(regexp_replace(first_name,'[^[:alnum:]]','','g'))
                and lower(regexp_replace(other_item->>'last_name','[^[:alnum:]]','','g'))=lower(regexp_replace(last_name,'[^[:alnum:]]','','g'))
                and regexp_replace(other_item->>'postal_code','[^0-9]','','g')=regexp_replace(postal,'[^0-9]','','g'))
            or (lower(regexp_replace(other_item->>'name','[^[:alnum:]]','','g'))=lower(regexp_replace(display_name,'[^[:alnum:]]','','g'))
                and lower(regexp_replace(other_item->>'street_address','[^[:alnum:]]','','g'))=lower(regexp_replace(street_address,'[^[:alnum:]]','','g')))
          ) then
            classification:='DUPLICATE'; reason:='A strong identity signal matches another CSV row.'; duplicate_count:=duplicate_count+1;
            exit;
          end if;
        end loop;
      end if;
    end if;

    classified_rows:=classified_rows||jsonb_build_array(
      (item-'validation_reason')||jsonb_build_object(
        'classification',classification,'reason',reason,
        'customer_number',existing_number
      )
    );
  end loop;

  -- PHASE B: every row now has a final classification. Only NEW rows write.
  for item in select value from jsonb_array_elements(classified_rows) loop
    row_number:=(item->>'row_number')::integer;
    classification:=item->>'classification';
    if classification='NEW' then
      begin
        insert into public.customers(
          organization_id,customer_number,type,name,email,phone,status,notes,created_by_user_id,
          first_name,last_name,street_address,city,state,postal_code
        ) values (
          target_organization_id,public.next_customer_number(target_organization_id,'INDIVIDUAL'),
          'INDIVIDUAL',item->>'name',item->>'email',item->>'phone','ACTIVE',null,actor,
          item->>'first_name',item->>'last_name',item->>'street_address',
          item->>'city',item->>'state',item->>'postal_code'
        ) returning * into created_customer;
      exception when others then
        raise exception 'customer import failed at CSV row %',row_number
          using errcode='P0001',detail=sqlerrm;
      end;
      created_count:=created_count+1;
      outcomes:=outcomes||jsonb_build_array(jsonb_build_object(
        'row_number',row_number,'classification','CREATED','customer_id',created_customer.id,
        'customer_number',created_customer.customer_number,'reason','Customer created.'
      ));
    else
      outcomes:=outcomes||jsonb_build_array(jsonb_build_object(
        'row_number',row_number,'classification',classification,
        'customer_number',item->>'customer_number','reason',item->>'reason'
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'created',created_count,'skipped_exact',exact_count,'held_duplicates',duplicate_count,
    'invalid',invalid_count,'outcomes',outcomes
  );
end
$$;

alter function public.super_admin_customer_merge_preview(uuid,uuid,uuid) owner to postgres;
alter function public.super_admin_merge_customers(uuid,uuid,uuid,jsonb,text) owner to postgres;
alter function public.super_admin_import_customers(uuid,jsonb) owner to postgres;

revoke all on function public.super_admin_customer_merge_preview(uuid,uuid,uuid) from public,anon;
revoke all on function public.super_admin_merge_customers(uuid,uuid,uuid,jsonb,text) from public,anon;
revoke all on function public.super_admin_import_customers(uuid,jsonb) from public,anon;
grant execute on function public.super_admin_customer_merge_preview(uuid,uuid,uuid) to authenticated;
grant execute on function public.super_admin_merge_customers(uuid,uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.super_admin_import_customers(uuid,jsonb) to authenticated;

comment on function public.super_admin_customer_merge_preview(uuid,uuid,uuid) is
  'SUPER_ADMIN-only same-organization merge preflight with fail-closed unknown dependency and portal collision checks.';
comment on function public.super_admin_merge_customers(uuid,uuid,uuid,jsonb,text) is
  'SUPER_ADMIN-only atomic Customer merge. Explicitly reparents every known dependency, audits immutable snapshots, verifies zero references, and deletes the losing row.';
comment on function public.super_admin_import_customers(uuid,jsonb) is
  'SUPER_ADMIN-only atomic Customer CSV import boundary. Revalidates and reclassifies every row and allocates canonical annual Customer numbers.';
