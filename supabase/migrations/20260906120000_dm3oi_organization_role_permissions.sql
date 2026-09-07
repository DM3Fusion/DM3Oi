create table public.organization_role_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.application_role not null check (role in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER')),
  permission text not null check (permission in (
    'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_REPORTS','VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'
  )),
  is_allowed boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  unique (organization_id, role, permission)
);
create trigger organization_role_permissions_updated_at before update on public.organization_role_permissions for each row execute function public.set_updated_at();
alter table public.organization_role_permissions enable row level security;
create policy organization_role_permissions_select on public.organization_role_permissions for select to authenticated using (public.is_super_admin() or public.is_internal_member(organization_id));
revoke insert,update,delete on public.organization_role_permissions from authenticated;
revoke select on public.organization_role_permissions from authenticated;
grant select(id,organization_id,role,permission,is_allowed,created_at,updated_at) on public.organization_role_permissions to authenticated;

create or replace function public.default_organization_role_permission(target_role public.application_role,target_permission text)
returns boolean language sql immutable set search_path='' as $$
 select case
  when target_role='BUSINESS_OWNER' or target_role='BUSINESS_ADMIN' then target_permission=any(array['VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_REPORTS','VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'])
  when target_role='STAFF_MANAGER' then target_permission=any(array['VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_REPORTS','VIEW_USERS','VIEW_SETTINGS'])
  when target_role='STAFF_USER' then target_permission=any(array['VIEW_DASHBOARD','VIEW_CASES','WORK_CASES','VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','VIEW_QUESTIONS','VIEW_REPORTS','VIEW_USERS','VIEW_SETTINGS'])
  else false end
$$;
create or replace function public.effective_organization_role_permission(target_organization_id uuid,target_role public.application_role,target_permission text)
returns boolean language sql stable security definer set search_path='' as $$
 select case
  when target_role='BUSINESS_OWNER' and target_permission=any(array['VIEW_SETTINGS','VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS']) then true
  when target_role in ('STAFF_MANAGER','STAFF_USER') and target_permission='MANAGE_ROLE_PERMISSIONS' then false
  else coalesce((select p.is_allowed from public.organization_role_permissions p where p.organization_id=target_organization_id and p.role=target_role and p.permission=target_permission),public.default_organization_role_permission(target_role,target_permission)) end
$$;

create or replace function public.has_effective_organization_permission(
  target_organization_id uuid,
  target_permission text
) returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.application_role;
begin
  if target_organization_id is null or actor is null or target_permission is null
    or not target_permission=any(array['VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_REPORTS','VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS']) then
    return false;
  end if;
  if public.is_super_admin(actor) then
    return exists(select 1 from public.organizations o where o.id=target_organization_id);
  end if;
  select m.role into actor_role
  from public.organization_members m
  where m.organization_id=target_organization_id and m.user_id=actor and m.is_active
    and m.role in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER');
  if actor_role is null then return false; end if;
  return public.effective_organization_role_permission(target_organization_id,actor_role,target_permission);
exception when others then
  return false;
end $$;
revoke all on function public.has_effective_organization_permission(uuid,text) from public,anon;
grant execute on function public.has_effective_organization_permission(uuid,text) to authenticated;

create or replace function public.save_organization_role_permissions(target_organization_id uuid,target_role public.application_role,target_changes jsonb default '{}'::jsonb,target_restore boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_org uuid:=target_organization_id; actor_role public.application_role; item record;
begin
 select m.role into actor_role from public.organization_members m where m.organization_id=actor_org and m.user_id=actor and m.is_active;
 if not public.is_super_admin(actor) and (actor_role is null or not public.effective_organization_role_permission(actor_org,actor_role,'MANAGE_ROLE_PERMISSIONS')) then raise exception 'not authorized' using errcode='42501'; end if;
 if actor_org is null or target_role not in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER') then raise exception 'invalid role' using errcode='22023'; end if;
 if actor_role='BUSINESS_OWNER' and target_role='BUSINESS_OWNER' then raise exception 'owner baseline is protected' using errcode='42501'; end if;
 if actor_role='BUSINESS_ADMIN' and target_role not in ('STAFF_MANAGER','STAFF_USER') then raise exception 'not authorized' using errcode='42501'; end if;
 if actor_role in ('STAFF_MANAGER','STAFF_USER','PUBLIC_USER') then raise exception 'not authorized' using errcode='42501'; end if;
 if target_restore then
  for item in select p.permission from public.organization_role_permissions p where p.organization_id=actor_org and p.role=target_role loop
   if public.default_organization_role_permission(target_role,item.permission) and not public.effective_organization_role_permission(actor_org,coalesce(actor_role,'BUSINESS_OWNER'),item.permission) and not public.is_super_admin(actor) then raise exception 'cannot grant unavailable permission' using errcode='42501'; end if;
  end loop;
  delete from public.organization_role_permissions where organization_id=actor_org and role=target_role;
  return;
 end if;
 for item in select key as permission,(value#>>'{}')::boolean as allowed from jsonb_each(target_changes) loop
  if item.permission not in (select unnest(array['VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_REPORTS','VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'])) then raise exception 'invalid permission' using errcode='22023'; end if;
  if target_role in ('STAFF_MANAGER','STAFF_USER') and item.permission='MANAGE_ROLE_PERMISSIONS' then raise exception 'role cannot administer organization access' using errcode='42501'; end if;
  if item.allowed and not public.effective_organization_role_permission(actor_org,coalesce(actor_role,'BUSINESS_OWNER'),item.permission) and not public.is_super_admin(actor) then raise exception 'cannot grant unavailable permission' using errcode='42501'; end if;
  insert into public.organization_role_permissions(organization_id,role,permission,is_allowed,updated_by) values(actor_org,target_role,item.permission,item.allowed,actor) on conflict(organization_id,role,permission) do update set is_allowed=excluded.is_allowed,updated_by=excluded.updated_by;
 end loop;
end $$;
revoke all on function public.default_organization_role_permission(public.application_role,text),public.effective_organization_role_permission(uuid,public.application_role,text) from public,anon,authenticated;
revoke all on function public.save_organization_role_permissions(uuid,public.application_role,jsonb,boolean) from public,anon;
grant execute on function public.save_organization_role_permissions(uuid,public.application_role,jsonb,boolean) to authenticated;

-- A platform identity remains outside organization membership even if legacy or
-- manually-created data predates the identity-category trigger.
create or replace function public.enforce_exclusive_identity_category()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; active boolean; role_name text;
begin
  if tg_table_name='customer_portal_users' then target:=new.user_id; active:=new.is_active;
  elsif tg_table_name='organization_members' then target:=new.user_id; active:=new.is_active;
  else target:=new.user_id; active:=new.is_active; role_name:=new.role::text; end if;
  if not active then return new; end if;
  if tg_table_name='customer_portal_users' then
    if exists(select 1 from public.organization_members m where m.user_id=target and m.is_active)
      or exists(select 1 from public.platform_user_roles r where r.user_id=target and r.role='SUPER_ADMIN' and r.is_active)
    then raise exception 'identity already has active internal access' using errcode='23514'; end if;
  elsif tg_table_name='organization_members' then
    if exists(select 1 from public.customer_portal_users p where p.user_id=target and p.is_active)
      or exists(select 1 from public.platform_user_roles r where r.user_id=target and r.role='SUPER_ADMIN' and r.is_active)
    then raise exception 'identity already has protected platform or customer portal access' using errcode='23514'; end if;
  elsif role_name='SUPER_ADMIN' and (
    exists(select 1 from public.customer_portal_users p where p.user_id=target and p.is_active)
    or exists(select 1 from public.organization_members m where m.user_id=target and m.is_active)
  ) then raise exception 'identity already has active organization or customer portal access' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.enforce_exclusive_identity_category() from public,anon,authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using(
  id=auth.uid()
  or public.is_super_admin()
  or (
    not public.is_super_admin(profiles.id)
    and exists(
      select 1 from public.organization_members me
      join public.organization_members them on them.organization_id=me.organization_id
      where me.user_id=auth.uid() and me.is_active
        and them.user_id=profiles.id and them.is_active
    )
  )
);
drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members for select to authenticated using(
  public.is_super_admin()
  or (public.is_internal_member(organization_id) and not public.is_super_admin(user_id))
);
drop policy if exists members_admin_insert on public.organization_members;
create policy members_admin_insert on public.organization_members for insert to authenticated with check(
  public.is_super_admin()
  or (
    not public.is_super_admin(user_id)
    and public.has_organization_role(organization_id,array['BUSINESS_ADMIN','BUSINESS_OWNER']::public.application_role[])
  )
);
drop policy if exists members_admin_update on public.organization_members;
create policy members_admin_update on public.organization_members for update to authenticated using(
  public.is_super_admin()
  or (
    not public.is_super_admin(user_id)
    and public.has_organization_role(organization_id,array['BUSINESS_ADMIN','BUSINESS_OWNER']::public.application_role[])
  )
) with check(
  public.is_super_admin()
  or (
    not public.is_super_admin(user_id)
    and public.has_organization_role(organization_id,array['BUSINESS_ADMIN','BUSINESS_OWNER']::public.application_role[])
  )
);

-- This organization-facing RPC previously bypassed profile RLS and returned
-- the platform actor's real profile. It now pseudonymizes before data leaves
-- PostgreSQL while the activity rows retain their true actor IDs.
create or replace function public.get_service_request_detail_activity(target_service_request_id uuid)
returns table(
  created_by_user_id uuid,
  creator_display_name text,
  creator_email text,
  activity_id uuid,
  event_type text,
  actor_user_id uuid,
  actor_display_name text,
  actor_email text,
  occurred_at timestamptz,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb
)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target_organization_id uuid;
begin
  if actor is null then raise exception 'not authorized' using errcode='42501'; end if;
  select r.organization_id into target_organization_id from public.service_requests r where r.id=target_service_request_id;
  if target_organization_id is null or not public.can_access_service_request(target_service_request_id,target_organization_id,actor)
    then raise exception 'not authorized' using errcode='42501'; end if;
  return query
    select
      case when public.is_super_admin(r.created_by_user_id) then null else r.created_by_user_id end,
      case when public.is_super_admin(r.created_by_user_id) then 'DM3Oi Sys Support' else nullif(trim(creator.display_name),'') end,
      case when public.is_super_admin(r.created_by_user_id) then null else creator.email end,
      a.id,a.event_type,
      case when public.is_super_admin(a.actor_user_id) then null else a.actor_user_id end,
      case when public.is_super_admin(a.actor_user_id) then 'DM3Oi Sys Support' else nullif(trim(event_actor.display_name),'') end,
      case when public.is_super_admin(a.actor_user_id) then null else event_actor.email end,
      a.occurred_at,a.previous_value,a.new_value,a.metadata
    from public.service_requests r
    left join public.profiles creator on creator.id=r.created_by_user_id
    left join public.service_request_activity a on a.service_request_id=r.id
    left join public.profiles event_actor on event_actor.id=a.actor_user_id
    where r.id=target_service_request_id
    order by a.occurred_at desc nulls last;
end $$;
revoke all on function public.get_service_request_detail_activity(uuid) from public,anon;
grant execute on function public.get_service_request_detail_activity(uuid) to authenticated;

-- RLS limits rows, not columns. Organization-facing reads therefore use
-- security-barrier projections that preserve ordinary member attribution while
-- suppressing platform UUIDs. The base rows continue to retain the true actor.
create or replace function public.organization_actor_id(target_actor uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select case
    when target_actor is null then null
    when public.is_super_admin(auth.uid()) then target_actor
    when public.is_super_admin(target_actor) then null
    else target_actor
  end
$$;
create or replace function public.organization_actor_label(target_actor uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when target_actor is null then null
    when not public.is_super_admin(auth.uid()) and public.is_super_admin(target_actor)
      then 'DM3Oi Sys Support'
    else coalesce(nullif(trim(p.display_name),''),p.email)
  end
  from public.profiles p where p.id=target_actor
$$;
revoke all on function public.organization_actor_id(uuid),public.organization_actor_label(uuid) from public,anon,authenticated;

create view public.organization_cases with (security_barrier=true) as
select c.id,c.organization_id,c.case_number,c.customer_id,c.title,c.description,c.case_type,c.priority,c.status,
  c.due_at,c.opened_at,c.completed_at,c.closed_at,c.manager_user_id,
  public.organization_actor_id(c.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(c.created_by_user_id) as created_by_display_name,
  c.created_at,c.updated_at
from public.cases c
where public.can_access_case(c.id,c.organization_id,auth.uid());

create view public.organization_case_activity with (security_barrier=true) as
select a.id,a.organization_id,a.case_id,
  public.organization_actor_id(a.actor_user_id) as actor_user_id,
  public.organization_actor_label(a.actor_user_id) as actor_display_name,
  a.event_type,a.event_data,a.created_at
from public.case_activity a
where public.can_access_case(a.case_id,a.organization_id,auth.uid());

create view public.organization_case_tasks with (security_barrier=true) as
select t.id,t.organization_id,t.case_id,t.title,t.description,t.assigned_user_id,t.status,t.required,t.due_at,
  t.completed_at,public.organization_actor_id(t.completed_by_user_id) as completed_by_user_id,
  public.organization_actor_label(t.completed_by_user_id) as completed_by_display_name,
  t.sequence,public.organization_actor_id(t.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(t.created_by_user_id) as created_by_display_name,t.created_at,t.updated_at
from public.case_tasks t
where public.can_access_case(t.case_id,t.organization_id,auth.uid());

create view public.organization_customers with (security_barrier=true) as
select c.id,c.organization_id,c.customer_number,c.type,c.name,c.email,c.phone,c.status,c.notes,
  public.organization_actor_id(c.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(c.created_by_user_id) as created_by_display_name,c.created_at,c.updated_at
from public.customers c
where public.is_super_admin(auth.uid()) or public.is_internal_member(c.organization_id,auth.uid())
  or public.is_customer_portal_user(c.organization_id,c.id,auth.uid());

create view public.organization_question_definitions with (security_barrier=true) as
select q.id,q.organization_id,q.question_text,q.description,q.response_type,q.required,q.active,q.display_order,
  public.organization_actor_id(q.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(q.created_by_user_id) as created_by_display_name,q.created_at,q.updated_at
from public.question_definitions q
where public.is_super_admin(auth.uid()) or public.is_internal_member(q.organization_id,auth.uid());

create view public.organization_service_requests with (security_barrier=true) as
select r.id,r.organization_id,r.request_number,r.customer_id,r.requester_user_id,r.case_id,r.subject,r.description,
  r.status,r.priority,r.assigned_user_id,public.organization_actor_id(r.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(r.created_by_user_id) as created_by_display_name,
  r.opened_at,r.resolved_at,r.closed_at,r.last_activity_at,r.created_at,r.updated_at
from public.service_requests r
where public.can_access_service_request(r.id,r.organization_id,auth.uid())
  or public.is_customer_portal_user(r.organization_id,r.customer_id,auth.uid());

create view public.organization_service_request_activity with (security_barrier=true) as
select a.id,a.organization_id,a.service_request_id,a.event_type,
  public.organization_actor_id(a.actor_user_id) as actor_user_id,
  public.organization_actor_label(a.actor_user_id) as actor_display_name,
  a.occurred_at,a.previous_value,a.new_value,a.metadata
from public.service_request_activity a
where public.can_access_service_request(a.service_request_id,a.organization_id,auth.uid());

create view public.organization_service_request_messages with (security_barrier=true) as
select m.id,m.organization_id,m.service_request_id,
  public.organization_actor_id(m.author_user_id) as author_user_id,
  public.organization_actor_label(m.author_user_id) as author_display_name,
  m.author_type,m.body,m.created_at
from public.service_request_messages m
where public.can_read_service_request_messages(m.service_request_id,m.organization_id);

create view public.organization_service_request_communications with (security_barrier=true) as
select c.id,c.organization_id,c.service_request_id,c.communication_type,c.channel,c.direction,
  public.organization_actor_id(c.actor_user_id) as actor_user_id,
  public.organization_actor_label(c.actor_user_id) as actor_display_name,
  c.recipient_user_id,c.recipient_email,c.subject,c.related_message_id,c.status,c.error_code,c.error_summary,
  c.delivered_at,c.created_at
from public.service_request_communications c
where public.can_manage_service_request(c.service_request_id,c.organization_id,auth.uid());

revoke select on public.cases,public.case_activity,public.case_tasks,public.customers,public.question_definitions,
  public.service_requests,public.service_request_activity,public.service_request_messages,public.service_request_communications
  from public,anon,authenticated;
grant select(id,organization_id,case_number,customer_id,title,description,case_type,priority,status,due_at,opened_at,completed_at,closed_at,manager_user_id,created_at,updated_at) on public.cases to authenticated;
grant select(id,organization_id,case_id,event_type,event_data,created_at) on public.case_activity to authenticated;
grant select(id,organization_id,case_id,title,description,assigned_user_id,status,required,due_at,completed_at,sequence,created_at,updated_at) on public.case_tasks to authenticated;
grant select(id,organization_id,customer_number,type,name,email,phone,status,notes,created_at,updated_at) on public.customers to authenticated;
grant select(id,organization_id,question_text,description,response_type,required,active,display_order,created_at,updated_at) on public.question_definitions to authenticated;
grant select(id,organization_id,request_number,customer_id,requester_user_id,case_id,subject,description,status,priority,assigned_user_id,opened_at,resolved_at,closed_at,last_activity_at,created_at,updated_at) on public.service_requests to authenticated;
grant select(id,organization_id,service_request_id,event_type,occurred_at,previous_value,new_value,metadata) on public.service_request_activity to authenticated;
grant select(id,organization_id,service_request_id,author_type,body,created_at) on public.service_request_messages to authenticated;
grant select(id,organization_id,service_request_id,communication_type,channel,direction,recipient_user_id,recipient_email,subject,related_message_id,status,error_code,error_summary,delivered_at,created_at) on public.service_request_communications to authenticated;
revoke all on public.organization_cases,public.organization_case_activity,public.organization_case_tasks,
  public.organization_customers,public.organization_question_definitions,public.organization_service_requests,
  public.organization_service_request_activity,public.organization_service_request_messages,
  public.organization_service_request_communications from public,anon;
grant select on public.organization_cases,public.organization_case_activity,public.organization_case_tasks,
  public.organization_customers,public.organization_question_definitions,public.organization_service_requests,
  public.organization_service_request_activity,public.organization_service_request_messages,
  public.organization_service_request_communications to authenticated;

do $$
declare protected_column record;
begin
  for protected_column in
    select * from (values
      ('cases','created_by_user_id'),('case_activity','actor_user_id'),
      ('case_tasks','created_by_user_id'),('case_tasks','completed_by_user_id'),
      ('customers','created_by_user_id'),('question_definitions','created_by_user_id'),
      ('service_requests','created_by_user_id'),('service_request_activity','actor_user_id'),
      ('service_request_messages','author_user_id'),('service_request_communications','actor_user_id')
    ) as protected(table_name,column_name)
  loop
    if has_column_privilege('authenticated',format('public.%I',protected_column.table_name),protected_column.column_name,'select') then
      raise exception 'authenticated retains forbidden actor-column access: %.%',protected_column.table_name,protected_column.column_name;
    end if;
  end loop;
end $$;

-- Platform administrators retain unmasked access through a separately guarded
-- audit function; tenant users cannot execute it successfully.
create or replace function public.get_platform_operational_actor_audit(target_organization_id uuid)
returns table(source_table text,record_id uuid,actor_column text,actor_user_id uuid)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
  return query
    select 'cases',c.id,'created_by_user_id',c.created_by_user_id from public.cases c where c.organization_id=target_organization_id
    union all select 'case_activity',a.id,'actor_user_id',a.actor_user_id from public.case_activity a where a.organization_id=target_organization_id
    union all select 'case_tasks',t.id,'created_by_user_id',t.created_by_user_id from public.case_tasks t where t.organization_id=target_organization_id
    union all select 'case_tasks',t.id,'completed_by_user_id',t.completed_by_user_id from public.case_tasks t where t.organization_id=target_organization_id and t.completed_by_user_id is not null
    union all select 'customers',c.id,'created_by_user_id',c.created_by_user_id from public.customers c where c.organization_id=target_organization_id
    union all select 'question_definitions',q.id,'created_by_user_id',q.created_by_user_id from public.question_definitions q where q.organization_id=target_organization_id
    union all select 'service_requests',r.id,'created_by_user_id',r.created_by_user_id from public.service_requests r where r.organization_id=target_organization_id
    union all select 'service_request_activity',a.id,'actor_user_id',a.actor_user_id from public.service_request_activity a where a.organization_id=target_organization_id
    union all select 'service_request_messages',m.id,'author_user_id',m.author_user_id from public.service_request_messages m where m.organization_id=target_organization_id
    union all select 'service_request_communications',c.id,'actor_user_id',c.actor_user_id from public.service_request_communications c where c.organization_id=target_organization_id and c.actor_user_id is not null;
end $$;
revoke all on function public.get_platform_operational_actor_audit(uuid) from public,anon;
grant execute on function public.get_platform_operational_actor_audit(uuid) to authenticated;

-- Mutation RPCs retain true actor IDs in storage, but an ordinary caller must
-- not receive a platform creator through a composite return value.
create or replace function public.transition_case_status(target_case_id uuid,target_status public.case_status)
returns public.cases language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.cases; previous public.case_status; event_name text;
begin
  select * into item from public.cases where id=target_case_id for update;
  if not found then raise exception 'case not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(item.organization_id,'WORK_CASES') then raise exception 'not authorized' using errcode='42501'; end if;
  if not public.can_manage_case(item.organization_id,actor) and not (public.can_access_case(item.id,item.organization_id,actor) and target_status in ('IN_PROGRESS','WAITING','REVIEW')) then raise exception 'not authorized' using errcode='42501'; end if;
  previous:=item.status;
  if previous<>target_status then
    update public.cases set status=target_status where id=item.id returning * into item;
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(item.organization_id,item.id,actor,'STATUS_CHANGED',jsonb_build_object('before',previous,'after',target_status));
    if target_status='COMPLETED' then event_name:='CASE_COMPLETED'; elsif target_status='REVIEW' then event_name:='CASE_MOVED_TO_REVIEW'; elsif previous in ('COMPLETED','CLOSED') and target_status not in ('COMPLETED','CLOSED','CANCELLED') then event_name:='CASE_REOPENED'; end if;
    if event_name is not null then insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(item.organization_id,item.id,actor,event_name,jsonb_build_object('before',previous,'after',target_status)); end if;
  end if;
  if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then item.created_by_user_id:=null; end if;
  return item;
end $$;

create or replace function public.update_case_task(target_task_id uuid,target_title text,target_description text,target_assigned_user_id uuid,target_status public.case_task_status,target_required boolean,target_due_at timestamptz)
returns public.case_tasks language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.case_tasks; changed public.case_tasks; event_name text:='TASK_UPDATED';
begin
  select * into existing from public.case_tasks where id=target_task_id for update;
  if not found then raise exception 'task not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(existing.organization_id,'WORK_TASKS') then raise exception 'not authorized' using errcode='42501'; end if;
  if not public.can_access_case(existing.case_id,existing.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  if not public.can_manage_case(existing.organization_id,actor) and existing.assigned_user_id<>actor
    and not public.has_effective_organization_permission(existing.organization_id,'MANAGE_TASKS') then raise exception 'not authorized' using errcode='42501'; end if;
  if (target_title<>existing.title or target_description<>existing.description or target_required<>existing.required or target_due_at is distinct from existing.due_at)
    and not public.has_effective_organization_permission(existing.organization_id,'MANAGE_TASKS') then raise exception 'task management permission required' using errcode='42501'; end if;
  if target_assigned_user_id is distinct from existing.assigned_user_id
    and not public.has_effective_organization_permission(existing.organization_id,'ASSIGN_TASKS') then raise exception 'task assignment permission required' using errcode='42501'; end if;
  if target_assigned_user_id is not null and not public.is_internal_member(existing.organization_id,target_assigned_user_id) then raise exception 'invalid task assignee' using errcode='23514'; end if;
  update public.case_tasks set title=trim(target_title),description=coalesce(target_description,''),assigned_user_id=target_assigned_user_id,status=target_status,required=target_required,due_at=target_due_at,
    completed_at=case when target_status='COMPLETED' then coalesce(completed_at,now()) else null end,
    completed_by_user_id=case when target_status='COMPLETED' then actor else null end
    where id=existing.id returning * into changed;
  if target_status='COMPLETED' and existing.status<>'COMPLETED' then event_name:='TASK_COMPLETED'; elsif target_status='IN_PROGRESS' and existing.status<>'IN_PROGRESS' then event_name:='TASK_STARTED'; elsif target_assigned_user_id is distinct from existing.assigned_user_id then event_name:='TASK_ASSIGNED'; end if;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(changed.organization_id,changed.case_id,actor,event_name,jsonb_build_object('task_id',changed.id,'before_status',existing.status,'after_status',changed.status,'before_assigned_user_id',existing.assigned_user_id,'after_assigned_user_id',changed.assigned_user_id));
  if not public.is_super_admin(actor) and public.is_super_admin(changed.created_by_user_id) then changed.created_by_user_id:=null; end if;
  if not public.is_super_admin(actor) and public.is_super_admin(changed.completed_by_user_id) then changed.completed_by_user_id:=null; end if;
  return changed;
end $$;

create or replace function public.update_service_request_status(target_service_request_id uuid,target_status public.service_request_status)
returns public.service_requests language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.service_requests; previous public.service_request_status;
begin
  select * into item from public.service_requests where id=target_service_request_id for update;
  if not found then raise exception 'service request not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(item.organization_id,'WORK_SERVICE_REQUEST') then raise exception 'not authorized' using errcode='42501'; end if;
  if target_status='PENDING_STAFF' or target_status not in ('NEW','OPEN','PENDING_CUSTOMER','ON_HOLD','RESOLVED','CLOSED') then raise exception 'invalid service request status' using errcode='22023'; end if;
  if not public.can_manage_service_request(item.id,item.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  previous:=item.status;
  if previous<>target_status then
    update public.service_requests set status=target_status where id=item.id returning * into item;
    insert into public.service_request_activity(organization_id,service_request_id,event_type,actor_user_id,previous_value,new_value) values(item.organization_id,item.id,'STATUS_CHANGED',actor,to_jsonb(previous),to_jsonb(target_status));
  end if;
  if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then item.created_by_user_id:=null; end if;
  return item;
end $$;

create or replace function public.update_service_request_priority(target_service_request_id uuid,target_priority public.priority_level)
returns public.service_requests language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.service_requests; previous public.priority_level;
begin
  select * into item from public.service_requests where id=target_service_request_id for update;
  if not found then raise exception 'service request not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(item.organization_id,'WORK_SERVICE_REQUEST') then raise exception 'not authorized' using errcode='42501'; end if;
  if not public.can_manage_service_request(item.id,item.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  previous:=item.priority;
  if previous<>target_priority then
    update public.service_requests set priority=target_priority where id=item.id returning * into item;
    insert into public.service_request_activity(organization_id,service_request_id,event_type,actor_user_id,previous_value,new_value) values(item.organization_id,item.id,'PRIORITY_CHANGED',actor,to_jsonb(previous),to_jsonb(target_priority));
  end if;
  if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then item.created_by_user_id:=null; end if;
  return item;
end $$;

create or replace function public.set_service_request_assignment(target_service_request_id uuid,target_assigned_user_id uuid default null)
returns public.service_requests language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.service_requests; previous uuid;
begin
  select * into item from public.service_requests where id=target_service_request_id for update;
  if not found then raise exception 'service request not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(item.organization_id,'ASSIGN_SERVICE_REQUEST') then raise exception 'not authorized' using errcode='42501'; end if;
  if not public.can_manage_service_request(item.id,item.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  if target_assigned_user_id is not null and not exists(select 1 from public.organization_members m where m.organization_id=item.organization_id and m.user_id=target_assigned_user_id and m.is_active and m.role in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER')) then raise exception 'invalid service request assignee' using errcode='23514'; end if;
  previous:=item.assigned_user_id;
  if previous is distinct from target_assigned_user_id then
    update public.service_requests set assigned_user_id=target_assigned_user_id where id=item.id returning * into item;
    insert into public.service_request_activity(organization_id,service_request_id,event_type,actor_user_id,previous_value,new_value) values(item.organization_id,item.id,'ASSIGNMENT_CHANGED',actor,to_jsonb(previous),to_jsonb(target_assigned_user_id));
  end if;
  if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then item.created_by_user_id:=null; end if;
  return item;
end $$;

create or replace function public.save_question_definition(target_organization_id uuid,target_question_id uuid,target_question_text text,target_description text,target_response_type public.question_response_type,target_required boolean,target_active boolean,target_display_order integer,target_options jsonb default '[]')
returns public.question_definitions language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.question_definitions; opt jsonb;
begin
  if not public.has_effective_organization_permission(target_organization_id,'MANAGE_QUESTIONS') then raise exception 'not authorized' using errcode='42501'; end if;
  if jsonb_typeof(target_options)<>'array' then raise exception 'options must be an array' using errcode='22023'; end if;
  if target_response_type in ('SINGLE_SELECT','MULTI_SELECT') and jsonb_array_length(target_options)=0 then raise exception 'select questions require options' using errcode='23514'; end if;
  if target_question_id is null then
    insert into public.question_definitions(organization_id,question_text,description,response_type,required,active,display_order,created_by_user_id) values(target_organization_id,trim(target_question_text),coalesce(target_description,''),target_response_type,target_required,target_active,target_display_order,actor) returning * into item;
  else
    update public.question_definitions set question_text=trim(target_question_text),description=coalesce(target_description,''),response_type=target_response_type,required=target_required,active=target_active,display_order=target_display_order where id=target_question_id and organization_id=target_organization_id returning * into item;
    if not found then raise exception 'question not found' using errcode='P0002'; end if;
    delete from public.question_options where question_id=item.id;
  end if;
  for opt in select value from jsonb_array_elements(target_options) loop
    insert into public.question_options(organization_id,question_id,option_label,option_value,display_order) values(target_organization_id,item.id,trim(opt->>'label'),trim(opt->>'value'),coalesce((opt->>'display_order')::integer,0));
  end loop;
  if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then item.created_by_user_id:=null; end if;
  return item;
end $$;

create or replace function public.create_case_workflow(
  target_organization_id uuid,target_customer_id uuid,target_title text,target_description text,target_case_type text,target_priority public.priority_level,target_due_at timestamptz default null,target_manager_user_id uuid default null,target_staff_user_ids uuid[] default '{}'::uuid[],target_initial_tasks jsonb default '[]'::jsonb)
returns public.cases language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); created_case public.cases; staff_id uuid; task jsonb; task_id uuid;
begin
  if not public.has_effective_organization_permission(target_organization_id,'CREATE_CASE') then raise exception 'not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.customers c where c.id=target_customer_id and c.organization_id=target_organization_id) then raise exception 'invalid customer' using errcode='23503'; end if;
  if target_manager_user_id is not null and not public.is_internal_member(target_organization_id,target_manager_user_id) then raise exception 'invalid manager' using errcode='23514'; end if;
  insert into public.cases(organization_id,customer_id,title,description,case_type,priority,status,due_at,manager_user_id,created_by_user_id)
  values(target_organization_id,target_customer_id,trim(target_title),coalesce(target_description,''),trim(target_case_type),target_priority,case when target_manager_user_id is null and cardinality(target_staff_user_ids)=0 then 'UNASSIGNED'::public.case_status else 'ASSIGNED'::public.case_status end,target_due_at,target_manager_user_id,actor) returning * into created_case;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(target_organization_id,created_case.id,actor,'CASE_CREATED',jsonb_build_object('case_number',created_case.case_number,'status',created_case.status));
  if target_manager_user_id is not null then
    insert into public.case_assignments(organization_id,case_id,user_id,assignment_role,assigned_by_user_id) values(target_organization_id,created_case.id,target_manager_user_id,'MANAGER',actor);
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(target_organization_id,created_case.id,actor,'CASE_ASSIGNED',jsonb_build_object('user_id',target_manager_user_id,'assignment_role','MANAGER'));
  end if;
  foreach staff_id in array coalesce(target_staff_user_ids,'{}'::uuid[]) loop
    if not public.is_internal_member(target_organization_id,staff_id) then raise exception 'invalid staff assignment' using errcode='23514'; end if;
    insert into public.case_assignments(organization_id,case_id,user_id,assignment_role,assigned_by_user_id) values(target_organization_id,created_case.id,staff_id,'STAFF',actor) on conflict do nothing;
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(target_organization_id,created_case.id,actor,'CASE_ASSIGNED',jsonb_build_object('user_id',staff_id,'assignment_role','STAFF'));
  end loop;
  if jsonb_typeof(target_initial_tasks)<>'array' then raise exception 'initial tasks must be an array' using errcode='22023'; end if;
  for task in select value from jsonb_array_elements(target_initial_tasks) loop
    insert into public.case_tasks(organization_id,case_id,title,description,assigned_user_id,status,required,due_at,sequence,created_by_user_id)
    values(target_organization_id,created_case.id,trim(task->>'title'),coalesce(task->>'description',''),nullif(task->>'assigned_user_id','')::uuid,'NOT_STARTED',coalesce((task->>'required')::boolean,true),nullif(task->>'due_at','')::timestamptz,coalesce((task->>'sequence')::integer,0),actor) returning id into task_id;
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(target_organization_id,created_case.id,actor,'TASK_CREATED',jsonb_build_object('task_id',task_id,'title',task->>'title'));
  end loop;
  return created_case;
end $$;

create or replace function public.set_case_assignment(target_case_id uuid,target_user_id uuid,target_assignment_role public.assignment_role,target_active boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.cases; existing_id uuid; previous_manager uuid;
begin
  select * into item from public.cases where id=target_case_id for update;
  if not found then raise exception 'case not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(item.organization_id,'ASSIGN_CASES')
    or not public.can_access_case(item.id,item.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  if not public.is_internal_member(item.organization_id,target_user_id) then raise exception 'invalid staff assignment' using errcode='23514'; end if;
  if target_assignment_role='MANAGER' and target_active then
    select user_id into previous_manager from public.case_assignments where case_id=item.id and assignment_role='MANAGER' and is_active and user_id<>target_user_id limit 1;
    update public.case_assignments set is_active=false,unassigned_at=now() where case_id=item.id and assignment_role='MANAGER' and is_active and user_id<>target_user_id;
    update public.cases set manager_user_id=target_user_id where id=item.id;
  elsif target_assignment_role='MANAGER' and not target_active then update public.cases set manager_user_id=null where id=item.id and manager_user_id=target_user_id; end if;
  select id into existing_id from public.case_assignments where case_id=item.id and user_id=target_user_id and assignment_role=target_assignment_role order by created_at desc limit 1;
  if target_active then
    if existing_id is null then insert into public.case_assignments(organization_id,case_id,user_id,assignment_role,assigned_by_user_id) values(item.organization_id,item.id,target_user_id,target_assignment_role,actor);
    else update public.case_assignments set is_active=true,assigned_at=now(),assigned_by_user_id=actor,unassigned_at=null where id=existing_id; end if;
  else update public.case_assignments set is_active=false,unassigned_at=now() where id=existing_id and is_active; end if;
  if previous_manager is not null then insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(item.organization_id,item.id,actor,'CASE_UNASSIGNED',jsonb_build_object('user_id',previous_manager,'assignment_role','MANAGER')); end if;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(item.organization_id,item.id,actor,case when target_active then 'CASE_ASSIGNED' else 'CASE_UNASSIGNED' end,jsonb_build_object('user_id',target_user_id,'assignment_role',target_assignment_role));
end $$;

create or replace function public.create_case_task(target_case_id uuid,target_title text,target_description text default '',target_assigned_user_id uuid default null,target_required boolean default true,target_due_at timestamptz default null)
returns public.case_tasks language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.cases; created public.case_tasks; next_sequence integer;
begin
  select * into item from public.cases where id=target_case_id;
  if not found then raise exception 'case not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(item.organization_id,'MANAGE_TASKS')
    or not public.can_access_case(item.id,item.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  if target_assigned_user_id is not null and not public.is_internal_member(item.organization_id,target_assigned_user_id) then raise exception 'invalid task assignee' using errcode='23514'; end if;
  select coalesce(max(sequence),0)+1 into next_sequence from public.case_tasks where case_id=item.id;
  insert into public.case_tasks(organization_id,case_id,title,description,assigned_user_id,required,due_at,sequence,created_by_user_id) values(item.organization_id,item.id,trim(target_title),coalesce(target_description,''),target_assigned_user_id,target_required,target_due_at,next_sequence,actor) returning * into created;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(item.organization_id,item.id,actor,'TASK_CREATED',jsonb_build_object('task_id',created.id,'title',created.title));
  return created;
end $$;

create or replace function public.delete_case_task(target_task_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.case_tasks;
begin
  select * into existing from public.case_tasks where id=target_task_id for update;
  if not found then raise exception 'task not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(existing.organization_id,'MANAGE_TASKS')
    or not public.can_access_case(existing.case_id,existing.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  delete from public.case_tasks where id=existing.id;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(existing.organization_id,existing.case_id,actor,'TASK_DELETED',jsonb_build_object('task_id',existing.id,'title',existing.title));
end $$;

create or replace function public.move_case_task(target_task_id uuid,target_direction text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_task public.case_tasks; adjacent public.case_tasks; temporary_sequence integer;
begin
  select * into current_task from public.case_tasks where id=target_task_id for update;
  if not found then raise exception 'task not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(current_task.organization_id,'MANAGE_TASKS')
    or not public.can_access_case(current_task.case_id,current_task.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  if target_direction='UP' then select * into adjacent from public.case_tasks where case_id=current_task.case_id and sequence<current_task.sequence order by sequence desc limit 1 for update;
  elsif target_direction='DOWN' then select * into adjacent from public.case_tasks where case_id=current_task.case_id and sequence>current_task.sequence order by sequence limit 1 for update;
  else raise exception 'invalid direction' using errcode='22023'; end if;
  if found then temporary_sequence:=current_task.sequence; update public.case_tasks set sequence=adjacent.sequence where id=current_task.id; update public.case_tasks set sequence=temporary_sequence where id=adjacent.id; end if;
end $$;

create or replace function public.create_service_request(
  target_organization_id uuid,target_customer_id uuid,target_subject text,target_description text,
  target_priority public.priority_level default 'NORMAL',target_assigned_user_id uuid default null)
returns public.service_requests language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); created public.service_requests; request_number text;
begin
  if not public.has_effective_organization_permission(target_organization_id,'CREATE_SERVICE_REQUEST') then raise exception 'not authorized' using errcode='42501'; end if;
  if target_assigned_user_id is not null and not public.has_effective_organization_permission(target_organization_id,'ASSIGN_SERVICE_REQUEST') then raise exception 'not authorized to assign service requests' using errcode='42501'; end if;
  if not exists(select 1 from public.customers c where c.id=target_customer_id and c.organization_id=target_organization_id) then raise exception 'invalid customer' using errcode='23503'; end if;
  if target_subject is null or length(trim(target_subject))=0 or length(trim(target_subject))>240 then raise exception 'subject is required and must be 240 characters or fewer' using errcode='22023'; end if;
  if target_description is null or length(trim(target_description))=0 then raise exception 'description is required' using errcode='22023'; end if;
  if target_assigned_user_id is not null and not exists(select 1 from public.organization_members m where m.organization_id=target_organization_id and m.user_id=target_assigned_user_id and m.is_active and m.role in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER')) then raise exception 'invalid service request assignee' using errcode='23514'; end if;
  request_number:=public.allocate_service_request_number(target_organization_id);
  insert into public.service_requests(organization_id,request_number,customer_id,subject,description,status,priority,assigned_user_id,created_by_user_id,created_at,updated_at)
  values(target_organization_id,request_number,target_customer_id,trim(target_subject),trim(target_description),'NEW',target_priority,target_assigned_user_id,actor,now(),now()) returning * into created;
  insert into public.service_request_activity(organization_id,service_request_id,event_type,actor_user_id,new_value,metadata)
  values(created.organization_id,created.id,'CREATED',actor,jsonb_build_object('status',created.status,'priority',created.priority),jsonb_build_object('request_number',created.request_number));
  return created;
end $$;

create or replace function public.create_internal_service_request_message(target_service_request_id uuid,target_body text)
returns public.service_request_messages language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.service_requests; created public.service_request_messages;
begin
  if actor is null or target_body is null or length(trim(target_body))=0 or length(trim(target_body))>4000 then raise exception 'message is required and must be 4000 characters or fewer' using errcode='22023'; end if;
  select * into item from public.service_requests where id=target_service_request_id;
  if not found or not public.has_effective_organization_permission(item.organization_id,'RESPOND_SERVICE_REQUEST')
    or not public.can_manage_service_request(item.id,item.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  insert into public.service_request_messages(organization_id,service_request_id,author_user_id,author_type,body)
  values(item.organization_id,item.id,actor,'STAFF',trim(target_body)) returning * into created;
  return created;
end $$;

create or replace function public.create_customer_record(
  target_organization_id uuid,target_type public.customer_type,target_name text,target_email text default null,target_phone text default null,target_notes text default null)
returns public.customers language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); normalized_email text:=lower(trim(coalesce(target_email,''))); phone_source text:=trim(coalesce(target_phone,'')); normalized_phone text; created public.customers;
begin
  if not public.has_effective_organization_permission(target_organization_id,'CREATE_CUSTOMER') then raise exception 'not authorized' using errcode='42501'; end if;
  if target_type is null or target_type not in ('INDIVIDUAL','BUSINESS') then raise exception 'invalid customer type' using errcode='22023'; end if;
  if normalized_email='' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid customer email' using errcode='22023'; end if;
  if phone_source !~ '^([0-9]{10}|[0-9]{3}[- ][0-9]{3}[- ][0-9]{4}|\([0-9]{3}\)[ -][0-9]{3}[- ][0-9]{4}|\+1[ -][0-9]{3}[- ][0-9]{3}[- ][0-9]{4}|\+1[ -]\([0-9]{3}\)[ -][0-9]{3}[- ][0-9]{4})$' then raise exception 'invalid customer phone' using errcode='22023'; end if;
  normalized_phone:=regexp_replace(phone_source,'[^0-9]','','g');
  if length(normalized_phone) not in (10,11) or (length(normalized_phone)=11 and left(normalized_phone,1)<>'1') then raise exception 'invalid customer phone' using errcode='22023'; end if;
  insert into public.customers(organization_id,customer_number,type,name,email,phone,notes,created_by_user_id)
  values(target_organization_id,public.next_customer_number(target_organization_id,target_type),target_type,trim(target_name),normalized_email,normalized_phone,nullif(trim(target_notes),''),actor) returning * into created;
  return created;
end $$;

drop policy if exists customers_internal_write on public.customers;
drop policy if exists customers_effective_update on public.customers;
create policy customers_effective_update on public.customers for update to authenticated
using(public.has_effective_organization_permission(organization_id,'EDIT_CUSTOMER'))
with check(public.has_effective_organization_permission(organization_id,'EDIT_CUSTOMER'));
revoke insert,update,delete on public.customers from authenticated;
grant update(name,email,phone,notes,status) on public.customers to authenticated;

create or replace function public.set_notification_read_state(target_notification_id uuid,target_read boolean)
returns public.notifications language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.notifications;
begin
  update public.notifications n set read_at=case when target_read then coalesce(n.read_at,now()) else null end
  where n.id=target_notification_id and n.recipient_user_id=actor
    and public.has_effective_organization_permission(n.organization_id,'VIEW_COMMUNICATIONS')
  returning * into item;
  if not found then raise exception 'notification not found or not authorized' using errcode='42501'; end if;
  return item;
end $$;

create or replace function public.mark_all_notifications_read(target_organization_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); changed integer;
begin
  if not public.has_effective_organization_permission(target_organization_id,'VIEW_COMMUNICATIONS') then raise exception 'not authorized' using errcode='42501'; end if;
  update public.notifications set read_at=now() where organization_id=target_organization_id and recipient_user_id=actor and read_at is null and archived_at is null;
  get diagnostics changed=row_count;
  return changed;
end $$;

create or replace function public.archive_notification(target_notification_id uuid)
returns public.notifications language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.notifications;
begin
  update public.notifications n set archived_at=coalesce(n.archived_at,now())
  where n.id=target_notification_id and n.recipient_user_id=actor
    and public.has_effective_organization_permission(n.organization_id,'VIEW_COMMUNICATIONS')
  returning * into item;
  if not found then raise exception 'notification not found or not authorized' using errcode='42501'; end if;
  return item;
end $$;

create or replace function public.save_case_question_response(target_case_question_id uuid,target_response_value jsonb)
returns public.case_question_responses language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); q public.case_questions; r public.case_question_responses; valid boolean;
begin
  select * into q from public.case_questions where id=target_case_question_id;
  if not found then raise exception 'case question not found' using errcode='P0002'; end if;
  if not public.has_effective_organization_permission(q.organization_id,'WORK_CASES')
    or not public.can_access_case(q.case_id,q.organization_id,actor) then raise exception 'not authorized' using errcode='42501'; end if;
  valid:=case q.response_type
    when 'YES_NO' then jsonb_typeof(target_response_value)='boolean'
    when 'NUMBER' then jsonb_typeof(target_response_value)='number'
    when 'DATE' then jsonb_typeof(target_response_value)='string' and (target_response_value#>>'{}')~'^\d{4}-\d{2}-\d{2}$'
    when 'TEXT' then jsonb_typeof(target_response_value)='string' and length(trim(target_response_value#>>'{}'))>0
    when 'LONG_TEXT' then jsonb_typeof(target_response_value)='string' and length(trim(target_response_value#>>'{}'))>0
    when 'SINGLE_SELECT' then jsonb_typeof(target_response_value)='string' and exists(select 1 from jsonb_array_elements(q.options_snapshot) o where o->>'value'=target_response_value#>>'{}')
    when 'MULTI_SELECT' then jsonb_typeof(target_response_value)='array' and jsonb_array_length(target_response_value)>0 and not exists(select 1 from jsonb_array_elements_text(target_response_value) v where not exists(select 1 from jsonb_array_elements(q.options_snapshot) o where o->>'value'=v))
    else false end;
  if not valid then raise exception 'invalid question response' using errcode='22023'; end if;
  insert into public.case_question_responses(organization_id,case_id,case_question_id,response_value,responded_by_user_id)
  values(q.organization_id,q.case_id,q.id,target_response_value,actor)
  on conflict(case_question_id) do update set response_value=excluded.response_value,responded_by_user_id=actor returning * into r;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data) values(q.organization_id,q.case_id,actor,'QUESTION_RESPONSE_UPDATED',jsonb_build_object('case_question_id',q.id));
  return r;
end $$;
