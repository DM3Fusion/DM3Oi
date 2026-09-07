-- Controlled, tenant-scoped Case customer reassignment.

alter table public.organization_role_permissions
  drop constraint organization_role_permissions_permission_check;
alter table public.organization_role_permissions
  add constraint organization_role_permissions_permission_check check (permission in (
    'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','REASSIGN_CASE_CUSTOMER',
    'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
    'VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER',
    'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_REPORTS',
    'VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'
  ));

create or replace function public.default_organization_role_permission(
  target_role public.application_role,
  target_permission text
) returns boolean language sql immutable set search_path='' as $$
  select case
    when target_role='BUSINESS_OWNER' or target_role='BUSINESS_ADMIN' then target_permission=any(array[
      'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','REASSIGN_CASE_CUSTOMER',
      'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
      'VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER',
      'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_REPORTS',
      'VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'
    ])
    when target_role='STAFF_MANAGER' then target_permission=any(array[
      'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','REASSIGN_CASE_CUSTOMER',
      'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
      'VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER',
      'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_REPORTS','VIEW_USERS','VIEW_SETTINGS'
    ])
    when target_role='STAFF_USER' then target_permission=any(array[
      'VIEW_DASHBOARD','VIEW_CASES','WORK_CASES','VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
      'VIEW_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','VIEW_QUESTIONS','VIEW_REPORTS','VIEW_USERS','VIEW_SETTINGS'
    ])
    else false
  end
$$;

create or replace function public.has_effective_organization_permission(
  target_organization_id uuid,
  target_permission text
) returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role public.application_role;
begin
  if target_organization_id is null or actor is null or target_permission is null
    or not target_permission=any(array[
      'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','REASSIGN_CASE_CUSTOMER',
      'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
      'VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER',
      'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_REPORTS',
      'VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'
    ]) then
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

create or replace function public.save_organization_role_permissions(
  target_organization_id uuid,
  target_role public.application_role,
  target_changes jsonb default '{}'::jsonb,
  target_restore boolean default false
) returns void language plpgsql security definer set search_path='' as $$
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
    if item.permission not in (select unnest(array[
      'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','REASSIGN_CASE_CUSTOMER',
      'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
      'VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER',
      'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_REPORTS',
      'VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'
    ])) then raise exception 'invalid permission' using errcode='22023'; end if;
    if target_role in ('STAFF_MANAGER','STAFF_USER') and item.permission='MANAGE_ROLE_PERMISSIONS' then raise exception 'role cannot administer organization access' using errcode='42501'; end if;
    if item.allowed and not public.effective_organization_role_permission(actor_org,coalesce(actor_role,'BUSINESS_OWNER'),item.permission) and not public.is_super_admin(actor) then raise exception 'cannot grant unavailable permission' using errcode='42501'; end if;
    insert into public.organization_role_permissions(organization_id,role,permission,is_allowed,updated_by)
    values(actor_org,target_role,item.permission,item.allowed,actor)
    on conflict(organization_id,role,permission) do update set is_allowed=excluded.is_allowed,updated_by=excluded.updated_by;
  end loop;
end $$;

alter table public.case_activity drop constraint case_activity_event_type_check;
alter table public.case_activity add constraint case_activity_event_type_check check(event_type in (
  'CASE_CREATED','CASE_ASSIGNED','CASE_UNASSIGNED','STATUS_CHANGED','PRIORITY_CHANGED','DUE_DATE_CHANGED',
  'TASK_CREATED','TASK_UPDATED','TASK_DELETED','TASK_ASSIGNED','TASK_STARTED','TASK_COMPLETED',
  'CUSTOMER_RESPONSE_RECEIVED','CASE_MOVED_TO_REVIEW','CASE_COMPLETED','CASE_REOPENED','QUESTION_RESPONSE_UPDATED','CUSTOMER_CHANGED'
));

create or replace function public.reassign_case_customer(
  target_case_id uuid,
  target_customer_id uuid
) returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  item public.cases;
  old_customer public.customers;
  new_customer public.customers;
begin
  if actor is null then raise exception 'not authorized' using errcode='42501'; end if;

  select * into item from public.cases where id=target_case_id for update;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;

  if not public.has_effective_organization_permission(item.organization_id,'REASSIGN_CASE_CUSTOMER')
    or not public.can_access_case(item.id,item.organization_id,actor)
  then raise exception 'not authorized' using errcode='42501'; end if;

  select * into old_customer
  from public.customers
  where id=item.customer_id and organization_id=item.organization_id;
  if not found then raise exception 'invalid current customer' using errcode='23514'; end if;

  select * into new_customer
  from public.customers
  where id=target_customer_id and organization_id=item.organization_id and status='ACTIVE';
  if not found then raise exception 'invalid target customer' using errcode='23514'; end if;
  if new_customer.id=old_customer.id then raise exception 'invalid target customer' using errcode='23514'; end if;

  if exists(select 1 from public.service_requests r where r.case_id=item.id)
    or exists(select 1 from public.case_activity a where a.case_id=item.id and a.event_type='CUSTOMER_RESPONSE_RECEIVED')
  then raise exception 'customer history prevents reassignment' using errcode='23514'; end if;

  update public.cases set customer_id=new_customer.id where id=item.id;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
  values(
    item.organization_id,
    item.id,
    actor,
    'CUSTOMER_CHANGED',
    jsonb_build_object(
      'old_customer_id',old_customer.id,
      'old_customer_name',old_customer.name,
      'new_customer_id',new_customer.id,
      'new_customer_name',new_customer.name
    )
  );
end $$;

alter function public.reassign_case_customer(uuid,uuid) owner to postgres;
revoke all on function public.reassign_case_customer(uuid,uuid) from public,anon;
grant execute on function public.reassign_case_customer(uuid,uuid) to authenticated;
