-- Remove the obsolete PUBLIC_USER application role.
-- Customer Portal access is modeled exclusively through
-- public.customer_portal_users and effective portal context.

-- Fail closed if unexpected legacy role data exists.
do $$
begin
  if exists (
    select 1 from public.platform_user_roles
    where role::text = 'PUBLIC_USER'
  ) or exists (
    select 1 from public.organization_members
    where role::text = 'PUBLIC_USER'
  ) or exists (
    select 1 from public.organization_role_permissions
    where role::text = 'PUBLIC_USER'
  ) or exists (
    select 1 from public.organization_membership_events
    where user_role::text = 'PUBLIC_USER'
  ) then
    raise exception
      'Cannot remove PUBLIC_USER: legacy role data exists';
  end if;
end
$$;

-- Drop enum-dependent RLS policies.
drop policy "assignments_manager_write" on "public"."case_assignments";
drop policy "cases_manager_insert" on "public"."cases";
drop policy "portal_links_admin_write" on "public"."customer_portal_users";
drop policy "portal_links_self_select" on "public"."customer_portal_users";
drop policy "notifications_authorized_select" on "public"."notifications";
drop policy "organization_case_types_access" on "public"."organization_case_types";
drop policy "organization_lifecycle_access" on "public"."organization_lifecycle_statuses";
drop policy "members_admin_insert" on "public"."organization_members";
drop policy "members_admin_update" on "public"."organization_members";
drop policy "organization_membership_events_read" on "public"."organization_membership_events";
drop policy "organization_settings_access" on "public"."organization_settings";
drop policy "organizations_admin_write" on "public"."organizations";
drop policy "organization_avatar_sources_delete" on "storage"."objects";
drop policy "organization_avatar_sources_insert" on "storage"."objects";
drop policy "organization_avatar_sources_select" on "storage"."objects";
drop policy "organization_avatars_delete" on "storage"."objects";
drop policy "organization_avatars_insert" on "storage"."objects";

-- Drop policies that depend on role-sensitive helper functions.
drop policy "activity_append" on "public"."case_activity";
drop policy "activity_select" on "public"."case_activity";
drop policy "assignments_select" on "public"."case_assignments";
drop policy "case_responses_select" on "public"."case_question_responses";
drop policy "case_questions_select" on "public"."case_questions";
drop policy "tasks_operational_write" on "public"."case_tasks";
drop policy "tasks_select" on "public"."case_tasks";
drop policy "cases_operational_update" on "public"."cases";
drop policy "cases_select" on "public"."cases";
drop policy "customers_effective_update" on "public"."customers";
drop policy "rule_actions_effective_delete" on "public"."rule_actions";
drop policy "rule_actions_effective_insert" on "public"."rule_actions";
drop policy "rule_actions_effective_read" on "public"."rule_actions";
drop policy "rule_actions_effective_update" on "public"."rule_actions";
drop policy "rule_definitions_effective_delete" on "public"."rule_definitions";
drop policy "rule_definitions_effective_insert" on "public"."rule_definitions";
drop policy "rule_definitions_effective_read" on "public"."rule_definitions";
drop policy "rule_definitions_effective_update" on "public"."rule_definitions";

-- Drop security-barrier views that depend on role-sensitive helpers.
-- They are recreated after the canonical helper functions are restored.
drop view public.organization_case_activity;
drop view public.organization_case_tasks;
drop view public.organization_cases;
drop view public.organization_rule_actions;
drop view public.organization_rule_definitions;

-- Drop triggers whose UPDATE OF definitions depend on enum-typed role columns.
drop trigger organization_member_role_limit on public.organization_members;
drop trigger platform_roles_identity_category_trigger on public.platform_user_roles;

-- Drop enum-dependent partial index.
drop index public."one_active_super_admin_uidx";

-- Drop UNIQUE constraints backed by indexes containing enum-typed role columns.
alter table public.organization_members
  drop constraint organization_members_organization_id_user_id_role_key;

alter table public.organization_role_permissions
  drop constraint organization_role_permissions_organization_id_role_permissi_key;

alter table public.platform_user_roles
  drop constraint platform_user_roles_user_id_role_key;

-- Drop enum-dependent role constraints.
alter table public.organization_members
  drop constraint organization_members_role_check;
alter table public.organization_role_permissions
  drop constraint organization_role_permissions_role_check;
alter table public.platform_user_roles
  drop constraint platform_user_roles_role_check;

-- Drop functions whose definitions depend on the old enum.
drop function public.can_access_case(uuid, uuid, uuid);
drop function public.can_administer_questions(uuid, uuid);
drop function public.can_manage_case(uuid, uuid);
drop function public.can_manage_service_request(uuid, uuid, uuid);
drop function public.default_organization_role_permission(public.application_role, text);
drop function public.effective_organization_role_permission(uuid, public.application_role, text);
drop function public.has_effective_organization_permission(uuid, text);
drop function public.has_organization_role(uuid, public.application_role[], uuid);
drop function public.provision_organization_member(uuid, text, public.application_role);
drop function public.provision_organization_member(uuid, text, public.application_role, boolean);
drop function public.record_organization_membership_invitation_event(uuid, text);
drop function public.save_organization_role_permissions(uuid, public.application_role, jsonb, boolean);
drop function public.synchronize_case_rule_tasks(uuid, uuid, uuid[], uuid);
drop function public.transition_organization_membership(uuid, text);
drop function public.update_organization_membership(uuid, public.application_role, boolean);

-- Replace application_role with the five canonical roles.
alter type public.application_role
  rename to application_role_legacy;

create type public.application_role as enum (
  'SUPER_ADMIN',
  'BUSINESS_ADMIN',
  'BUSINESS_OWNER',
  'STAFF_MANAGER',
  'STAFF_USER'
);

alter table public.platform_user_roles
  alter column role type public.application_role
  using role::text::public.application_role;

alter table public.organization_members
  alter column role type public.application_role
  using role::text::public.application_role;

alter table public.organization_role_permissions
  alter column role type public.application_role
  using role::text::public.application_role;

alter table public.organization_membership_events
  alter column user_role type public.application_role
  using user_role::text::public.application_role;

drop type public.application_role_legacy;

-- Restore role constraints against the canonical enum.
alter table public.organization_members
  add constraint organization_members_role_check
  check (role = any (array[
    'BUSINESS_ADMIN'::public.application_role,
    'BUSINESS_OWNER'::public.application_role,
    'STAFF_MANAGER'::public.application_role,
    'STAFF_USER'::public.application_role
  ]));

alter table public.organization_role_permissions
  add constraint organization_role_permissions_role_check
  check (role = any (array[
    'BUSINESS_OWNER'::public.application_role,
    'BUSINESS_ADMIN'::public.application_role,
    'STAFF_MANAGER'::public.application_role,
    'STAFF_USER'::public.application_role
  ]));

alter table public.platform_user_roles
  add constraint platform_user_roles_role_check
  check (role = 'SUPER_ADMIN'::public.application_role);

-- Restore enum-dependent functions.
-- default_organization_role_permission(target_role application_role, target_permission text)
CREATE OR REPLACE FUNCTION public.default_organization_role_permission(target_role public.application_role, target_permission text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when target_role in ('BUSINESS_OWNER','BUSINESS_ADMIN') then target_permission=any(array[
      'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','REASSIGN_CASE_CUSTOMER',
      'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
      'VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER',
      'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_RULES','MANAGE_RULES','VIEW_REPORTS',
      'VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'
    ])
    when target_role='STAFF_MANAGER' then target_permission=any(array[
      'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','REASSIGN_CASE_CUSTOMER',
      'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
      'VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER',
      'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_RULES','VIEW_REPORTS','VIEW_USERS','VIEW_SETTINGS'
    ])
    when target_role='STAFF_USER' then target_permission=any(array[
      'VIEW_DASHBOARD','VIEW_CASES','WORK_CASES','VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
      'VIEW_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','VIEW_QUESTIONS','VIEW_REPORTS','VIEW_USERS','VIEW_SETTINGS'
    ])
    else false
  end
$function$;

-- effective_organization_role_permission(target_organization_id uuid, target_role application_role, target_permission text)
CREATE OR REPLACE FUNCTION public.effective_organization_role_permission(target_organization_id uuid, target_role public.application_role, target_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case
  when target_role='BUSINESS_OWNER' and target_permission=any(array['VIEW_SETTINGS','VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS']) then true
  when target_role in ('STAFF_MANAGER','STAFF_USER') and target_permission='MANAGE_ROLE_PERMISSIONS' then false
  else coalesce((select p.is_allowed from public.organization_role_permissions p where p.organization_id=target_organization_id and p.role=target_role and p.permission=target_permission),public.default_organization_role_permission(target_role,target_permission)) end
$function$;

-- has_effective_organization_permission(target_organization_id uuid, target_permission text)
CREATE OR REPLACE FUNCTION public.has_effective_organization_permission(target_organization_id uuid, target_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); actor_role public.application_role;
begin
  if target_organization_id is null or actor is null or target_permission is null
    or not target_permission=any(array[
      'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','REASSIGN_CASE_CUSTOMER',
      'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
      'VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER',
      'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_RULES','MANAGE_RULES','VIEW_REPORTS',
      'VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'
    ]) then return false; end if;
  if public.is_super_admin(actor) then return exists(select 1 from public.organizations o where o.id=target_organization_id); end if;
  select m.role into actor_role from public.organization_members m
  where m.organization_id=target_organization_id and m.user_id=actor and m.is_active
    and m.role in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER');
  if actor_role is null then return false; end if;
  return public.effective_organization_role_permission(target_organization_id,actor_role,target_permission);
exception when others then return false;
end $function$;

-- has_organization_role(check_organization_id uuid, allowed_roles application_role[], check_user_id uuid)
CREATE OR REPLACE FUNCTION public.has_organization_role(check_organization_id uuid, allowed_roles public.application_role[], check_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.organization_members m join public.profiles p on p.id=m.user_id join public.organizations o on o.id=m.organization_id where m.organization_id=check_organization_id and m.user_id=check_user_id and m.role=any(allowed_roles) and m.is_active and p.is_active and o.status='ACTIVE')
$function$;

-- can_access_case(check_case_id uuid, check_organization_id uuid, check_user_id uuid)
CREATE OR REPLACE FUNCTION public.can_access_case(check_case_id uuid, check_organization_id uuid, check_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select public.is_super_admin(check_user_id) or (public.is_internal_member(check_organization_id,check_user_id) and (public.has_organization_role(check_organization_id,array['BUSINESS_ADMIN','BUSINESS_OWNER','STAFF_MANAGER']::public.application_role[],check_user_id) or exists(select 1 from public.case_assignments a where a.case_id=check_case_id and a.organization_id=check_organization_id and a.user_id=check_user_id and a.is_active) or exists(select 1 from public.case_tasks t where t.case_id=check_case_id and t.organization_id=check_organization_id and t.assigned_user_id=check_user_id))) $function$;

-- can_administer_questions(target_organization_id uuid, target_user_id uuid)
CREATE OR REPLACE FUNCTION public.can_administer_questions(target_organization_id uuid, target_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select public.is_super_admin(target_user_id) or public.has_organization_role(target_organization_id,array['BUSINESS_ADMIN','BUSINESS_OWNER','STAFF_MANAGER']::public.application_role[],target_user_id) $function$;

-- can_manage_case(target_organization_id uuid, target_user_id uuid)
CREATE OR REPLACE FUNCTION public.can_manage_case(target_organization_id uuid, target_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select public.is_super_admin(target_user_id) or public.has_organization_role(target_organization_id,array['BUSINESS_ADMIN','BUSINESS_OWNER','STAFF_MANAGER']::public.application_role[],target_user_id)
$function$;

-- can_manage_service_request(target_service_request_id uuid, target_organization_id uuid, target_user_id uuid)
CREATE OR REPLACE FUNCTION public.can_manage_service_request(target_service_request_id uuid, target_organization_id uuid, target_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.is_super_admin(target_user_id)
    or public.has_organization_role(target_organization_id,
      array['BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER']::public.application_role[], target_user_id)
    or exists (
      select 1 from public.service_requests r
      join public.organization_members m on m.organization_id=r.organization_id
        and m.user_id=target_user_id and m.is_active and m.role='STAFF_USER'
      where r.id=target_service_request_id and r.organization_id=target_organization_id
        and r.assigned_user_id=target_user_id
    )
$function$;

-- provision_organization_member(target_organization_id uuid, target_email text, target_role application_role)
CREATE OR REPLACE FUNCTION public.provision_organization_member(target_organization_id uuid, target_email text, target_role public.application_role)
 RETURNS organization_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); target_user uuid; membership public.organization_members;
begin
 if actor is null or not public.is_super_admin(actor) then raise exception 'not authorized' using errcode='42501'; end if;
 if target_role not in ('BUSINESS_ADMIN','BUSINESS_OWNER','STAFF_MANAGER','STAFF_USER') then raise exception 'invalid organization role' using errcode='22023'; end if;
 if not exists(select 1 from public.organizations where id=target_organization_id) then raise exception 'organization not found' using errcode='P0002'; end if;
 select id into target_user from public.profiles where lower(email)=lower(trim(target_email)) and is_active;
 if target_user is null then raise exception 'user profile not found' using errcode='P0002'; end if;
 insert into public.organization_members(organization_id,user_id,role,is_active) values(target_organization_id,target_user,target_role,true)
 on conflict(organization_id,user_id) do update set role=excluded.role,is_active=true
 returning * into membership;
 return membership;
end $function$;

-- provision_organization_member(target_organization_id uuid, target_email text, target_role application_role, target_identity_verified boolean)
CREATE OR REPLACE FUNCTION public.provision_organization_member(target_organization_id uuid, target_email text, target_role public.application_role, target_identity_verified boolean DEFAULT false)
 RETURNS organization_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  target_user uuid;
  membership public.organization_members;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_role not in (
    'BUSINESS_ADMIN',
    'BUSINESS_OWNER',
    'STAFF_MANAGER',
    'STAFF_USER'
  ) then
    raise exception 'invalid organization role' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organizations
    where id = target_organization_id
  ) then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  select id
  into target_user
  from public.profiles
  where lower(email) = lower(trim(target_email))
    and is_active;

  if target_user is null then
    raise exception 'user profile not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.organization_members m
    where m.user_id = target_user
      and m.organization_id <> target_organization_id
  ) then
    raise exception
      'user identity already belongs to another organization'
      using errcode = '23505';
  end if;

  select *
  into membership
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user
  for update;

  if found then
    if membership.status = 'REVOKED' then
      raise exception 'A revoked membership must be reinstated by SUPER_ADMIN';
    end if;

    if membership.status = 'SUSPENDED' then
      raise exception 'A suspended membership must be reactivated';
    end if;

    update public.organization_members
    set
      role = target_role,
      updated_at = now()
    where id = membership.id
    returning * into membership;

    return membership;
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    is_active,
    invited_at,
    verified_at
  )
  values (
    target_organization_id,
    target_user,
    target_role,
    case
      when target_identity_verified then 'VERIFIED'
      else 'INVITED'
    end,
    false,
    now(),
    case
      when target_identity_verified then now()
      else null
    end
  )
  returning * into membership;

  insert into public.organization_membership_events (
    organization_id,
    membership_id,
    user_id,
    user_email,
    user_display_name,
    user_role,
    actor_user_id,
    event_type,
    prior_status,
    new_status,
    note
  )
  select
    membership.organization_id,
    membership.id,
    membership.user_id,
    p.email,
    p.display_name,
    membership.role,
    actor,
    case
      when target_identity_verified then 'VERIFIED'
      else 'INVITED'
    end,
    null,
    case
      when target_identity_verified then 'VERIFIED'
      else 'INVITED'
    end,
    case
      when target_identity_verified
        then 'Verified identity provisioned by SUPER_ADMIN.'
      else 'Organization membership provisioned by SUPER_ADMIN.'
    end
  from public.profiles p
  where p.id = membership.user_id;

  return membership;
end
$function$;

-- record_organization_membership_invitation_event(target_membership_id uuid, target_event_type text)
CREATE OR REPLACE FUNCTION public.record_organization_membership_invitation_event(target_membership_id uuid, target_event_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  membership public.organization_members;
  profile public.profiles;
  actor_role public.application_role;
begin
  if actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_event_type not in ('INVITED', 'VERIFIED', 'INVITATION_RESENT') then
    raise exception 'invalid invitation event' using errcode = '22023';
  end if;

  select *
  into membership
  from public.organization_members
  where id = target_membership_id;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if not public.is_super_admin(actor) then
    select m.role
    into actor_role
    from public.organization_members m
    where m.organization_id = membership.organization_id
      and m.user_id = actor
      and m.is_active
      and m.status = 'ACTIVE';

    if actor_role = 'BUSINESS_OWNER' then
      if membership.role = 'BUSINESS_OWNER' then
        raise exception 'not authorized' using errcode = '42501';
      end if;
    elsif actor_role = 'BUSINESS_ADMIN' then
      if membership.role not in ('STAFF_MANAGER', 'STAFF_USER') then
        raise exception 'not authorized' using errcode = '42501';
      end if;
    else
      raise exception 'not authorized' using errcode = '42501';
    end if;
  end if;

  if target_event_type = 'INVITATION_RESENT'
     and membership.status <> 'INVITED' then
    raise exception 'only pending invitations can be resent'
      using errcode = '23514';
  end if;

  if target_event_type = 'INVITED'
     and membership.status <> 'INVITED' then
    raise exception 'membership is not invited'
      using errcode = '23514';
  end if;

  if target_event_type = 'VERIFIED'
     and membership.status <> 'VERIFIED' then
    raise exception 'membership is not verified'
      using errcode = '23514';
  end if;

  select *
  into profile
  from public.profiles
  where id = membership.user_id;

  if not found or profile.email is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  insert into public.organization_membership_events (
    organization_id,
    membership_id,
    user_id,
    user_email,
    user_display_name,
    user_role,
    actor_user_id,
    event_type,
    prior_status,
    new_status,
    note
  )
  values (
    membership.organization_id,
    membership.id,
    membership.user_id,
    profile.email,
    profile.display_name,
    membership.role,
    actor,
    target_event_type,
    case
      when target_event_type = 'INVITATION_RESENT' then membership.status
      else null
    end,
    membership.status,
    case target_event_type
      when 'INVITATION_RESENT' then 'Organization invitation resent.'
      when 'VERIFIED' then 'Existing verified identity added to organization.'
      else 'Organization invitation created.'
    end
  );
end
$function$;

-- save_organization_role_permissions(target_organization_id uuid, target_role application_role, target_changes jsonb, target_restore boolean)
CREATE OR REPLACE FUNCTION public.save_organization_role_permissions(target_organization_id uuid, target_role public.application_role, target_changes jsonb DEFAULT '{}'::jsonb, target_restore boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); actor_org uuid:=target_organization_id; actor_role public.application_role; item record;
begin
  select m.role into actor_role from public.organization_members m where m.organization_id=actor_org and m.user_id=actor and m.is_active;
  if not public.is_super_admin(actor) and (actor_role is null or not public.effective_organization_role_permission(actor_org,actor_role,'MANAGE_ROLE_PERMISSIONS')) then raise exception 'not authorized' using errcode='42501'; end if;
  if actor_org is null or target_role not in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER') then raise exception 'invalid role' using errcode='22023'; end if;
  if actor_role='BUSINESS_OWNER' and target_role='BUSINESS_OWNER' then raise exception 'owner baseline is protected' using errcode='42501'; end if;
  if actor_role='BUSINESS_ADMIN' and target_role not in ('STAFF_MANAGER','STAFF_USER') then raise exception 'not authorized' using errcode='42501'; end if;
  if actor_role in ('STAFF_MANAGER','STAFF_USER') then raise exception 'not authorized' using errcode='42501'; end if;
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
      'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_RULES','MANAGE_RULES','VIEW_REPORTS',
      'VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'
    ])) then raise exception 'invalid permission' using errcode='22023'; end if;
    if target_role in ('STAFF_MANAGER','STAFF_USER') and item.permission='MANAGE_ROLE_PERMISSIONS' then raise exception 'role cannot administer organization access' using errcode='42501'; end if;
    if item.allowed and not public.effective_organization_role_permission(actor_org,coalesce(actor_role,'BUSINESS_OWNER'),item.permission) and not public.is_super_admin(actor) then raise exception 'cannot grant unavailable permission' using errcode='42501'; end if;
    insert into public.organization_role_permissions(organization_id,role,permission,is_allowed,updated_by)
    values(actor_org,target_role,item.permission,item.allowed,actor)
    on conflict(organization_id,role,permission) do update set is_allowed=excluded.is_allowed,updated_by=excluded.updated_by;
  end loop;
end $function$;

-- synchronize_case_rule_tasks(target_organization_id uuid, target_case_id uuid, target_effective_action_ids uuid[], target_actor_user_id uuid)
CREATE OR REPLACE FUNCTION public.synchronize_case_rule_tasks(target_organization_id uuid, target_case_id uuid, target_effective_action_ids uuid[], target_actor_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  item public.cases; action public.rule_actions; changed public.case_tasks; next_sequence integer;
  effective_action_ids uuid[]:=coalesce(target_effective_action_ids,'{}'::uuid[]);
  actor_role public.application_role; actor_can_create boolean:=false; actor_can_work boolean:=false; actor_can_manage_rules boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'not authorized' using errcode='42501'; end if;
  select * into item from public.cases
  where id=target_case_id and organization_id=target_organization_id for update;
  if not found then raise exception 'case not found' using errcode='P0002'; end if;
  if target_actor_user_id is null or not public.is_valid_organization_actor(target_organization_id,target_actor_user_id)
    then raise exception 'invalid synchronization actor' using errcode='42501'; end if;
  if public.is_super_admin(target_actor_user_id) then
    actor_can_create:=true; actor_can_work:=true; actor_can_manage_rules:=true;
  else
    select m.role into actor_role from public.organization_members m
    where m.organization_id=target_organization_id and m.user_id=target_actor_user_id and m.is_active
      and m.role in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER');
    actor_can_create:=coalesce(public.effective_organization_role_permission(target_organization_id,actor_role,'CREATE_CASE'),false);
    actor_can_work:=coalesce(public.effective_organization_role_permission(target_organization_id,actor_role,'WORK_CASES'),false);
    actor_can_manage_rules:=coalesce(public.effective_organization_role_permission(target_organization_id,actor_role,'MANAGE_RULES'),false);
  end if;
  if not (((actor_can_create or actor_can_work) and public.can_access_case(target_case_id,target_organization_id,target_actor_user_id))
    or actor_can_manage_rules) then raise exception 'not authorized' using errcode='42501'; end if;
  if exists(
    select 1 from unnest(effective_action_ids) requested(id)
    left join public.rule_actions a on a.id=requested.id and a.organization_id=target_organization_id
      and a.action_type='CREATE_TASK' and a.retired_at is null
    left join public.rule_definitions r on r.id=a.rule_definition_id
      and r.organization_id=a.organization_id and r.active
    where a.id is null or r.id is null
  ) then raise exception 'invalid effective Rule action' using errcode='23514'; end if;

  for action in
    select a.* from public.rule_actions a
    join public.rule_definitions r on r.organization_id=a.organization_id and r.id=a.rule_definition_id
    where a.organization_id=target_organization_id and a.id=any(effective_action_ids)
      and a.action_type='CREATE_TASK' and a.retired_at is null and r.active
    order by r.display_order,a.display_order,a.id
  loop
    select coalesce(max(sequence),0)+1 into next_sequence from public.case_tasks where case_id=target_case_id;
    insert into public.case_tasks(
      organization_id,case_id,title,description,status,required,sequence,created_by_user_id,
      priority,blocking,source_rule_id,source_rule_action_id
    ) values(
      target_organization_id,target_case_id,action.task_title,action.task_description,'NOT_STARTED',
      action.task_required,next_sequence,target_actor_user_id,action.task_priority,action.task_blocking,
      action.rule_definition_id,action.id
    ) on conflict(organization_id,case_id,source_rule_action_id)
      where source_rule_action_id is not null do nothing
    returning * into changed;
    if changed.id is not null then
      insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
      values(target_organization_id,target_case_id,target_actor_user_id,'RULE_TASK_CREATED',
        jsonb_build_object('task_id',changed.id,'title',changed.title));
    end if;
    changed:=null;
  end loop;

  for changed in
    update public.case_tasks set status=coalesce(prior_actionable_status,'NOT_STARTED'),prior_actionable_status=null
    where organization_id=target_organization_id and case_id=target_case_id
      and source_rule_action_id=any(effective_action_ids) and status='NOT_APPLICABLE'
    returning *
  loop
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
    values(target_organization_id,target_case_id,target_actor_user_id,'RULE_TASK_REACTIVATED',
      jsonb_build_object('task_id',changed.id,'title',changed.title,'after_status',changed.status));
  end loop;

  for changed in
    update public.case_tasks set prior_actionable_status=status,status='NOT_APPLICABLE'
    where organization_id=target_organization_id and case_id=target_case_id
      and source_rule_action_id is not null and not(source_rule_action_id=any(effective_action_ids))
      and status in ('NOT_STARTED','IN_PROGRESS','BLOCKED')
    returning *
  loop
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
    values(target_organization_id,target_case_id,target_actor_user_id,'RULE_TASK_NOT_APPLICABLE',
      jsonb_build_object('task_id',changed.id,'title',changed.title,'before_status',changed.prior_actionable_status));
  end loop;
end $function$;

-- transition_organization_membership(target_membership_id uuid, target_action text)
CREATE OR REPLACE FUNCTION public.transition_organization_membership(target_membership_id uuid, target_action text)
 RETURNS organization_membership_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  membership public.organization_members;
  actor_role public.application_role;
  next_status public.organization_membership_status;
  action_name text := upper(trim(target_action));
begin
  if actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select *
  into membership
  from public.organization_members
  where id = target_membership_id
  for update;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if public.is_super_admin(actor) then
    null;
  else
    select m.role
    into actor_role
    from public.organization_members m
    join public.profiles p
      on p.id = m.user_id
    join public.organizations o
      on o.id = m.organization_id
    where m.organization_id = membership.organization_id
      and m.user_id = actor
      and m.is_active
      and m.status = 'ACTIVE'
      and p.is_active
      and o.status = 'ACTIVE'
    limit 1;

    if actor_role = 'BUSINESS_OWNER' then
      if membership.role = 'BUSINESS_OWNER' then
        raise exception 'not authorized' using errcode = '42501';
      end if;
    elsif actor_role = 'BUSINESS_ADMIN' then
      if membership.role not in ('STAFF_MANAGER', 'STAFF_USER') then
        raise exception 'not authorized' using errcode = '42501';
      end if;
    else
      raise exception 'not authorized' using errcode = '42501';
    end if;
  end if;

  if membership.user_id = actor
     and action_name in ('SUSPEND', 'REVOKE') then
    raise exception 'A user cannot suspend or revoke their own organization access'
      using errcode = '42501';
  end if;

  case action_name
    when 'ACTIVATE' then
      if membership.status <> 'VERIFIED' then
        raise exception 'Only a verified membership can be activated';
      end if;

      next_status := 'ACTIVE';
      membership.activated_at := now();
      membership.suspended_at := null;
      membership.revoked_at := null;

    when 'SUSPEND' then
      if membership.status <> 'ACTIVE' then
        raise exception 'Only an active membership can be suspended';
      end if;

      next_status := 'SUSPENDED';
      membership.suspended_at := now();

    when 'REACTIVATE' then
      if membership.status <> 'SUSPENDED' then
        raise exception 'Only a suspended membership can be reactivated';
      end if;

      next_status := 'ACTIVE';
      membership.suspended_at := null;
      membership.activated_at := coalesce(membership.activated_at, now());

    when 'REVOKE' then
      if membership.status = 'REVOKED' then
        raise exception 'Membership is already revoked';
      end if;

      if public.organization_member_has_active_responsibility(membership.id) then
        raise exception 'ACTIVE_OPERATIONAL_RESPONSIBILITY';
      end if;

      next_status := 'REVOKED';
      membership.revoked_at := now();

    when 'REINSTATE' then
      if not public.is_super_admin(actor) then
        raise exception 'Only SUPER_ADMIN can reinstate revoked membership'
          using errcode = '42501';
      end if;

      if membership.status <> 'REVOKED' then
        raise exception 'Only a revoked membership can be reinstated';
      end if;

      next_status := 'ACTIVE';
      membership.revoked_at := null;
      membership.suspended_at := null;
      membership.activated_at := now();

    else
      raise exception 'invalid membership lifecycle action'
        using errcode = '22023';
  end case;

  update public.organization_members
  set
    status = next_status,
    activated_at = membership.activated_at,
    suspended_at = membership.suspended_at,
    revoked_at = membership.revoked_at,
    updated_at = now()
  where id = membership.id;

  insert into public.organization_membership_events (
    organization_id,
    membership_id,
    user_id,
    user_email,
    user_display_name,
    user_role,
    actor_user_id,
    event_type,
    prior_status,
    new_status,
    note
  )
  select
    membership.organization_id,
    membership.id,
    membership.user_id,
    p.email,
    p.display_name,
    membership.role,
    actor,
    case action_name
      when 'ACTIVATE' then 'ACTIVATED'
      when 'SUSPEND' then 'SUSPENDED'
      when 'REACTIVATE' then 'REACTIVATED'
      when 'REVOKE' then 'REVOKED'
      when 'REINSTATE' then 'REINSTATED'
    end,
    membership.status,
    next_status,
    case action_name
      when 'ACTIVATE' then 'Membership activated.'
      when 'SUSPEND' then 'Membership suspended.'
      when 'REACTIVATE' then 'Membership reactivated.'
      when 'REVOKE' then 'Membership revoked.'
      when 'REINSTATE' then 'Membership reinstated by SUPER_ADMIN.'
    end
  from public.profiles p
  where p.id = membership.user_id;

  return next_status;
end
$function$;

-- update_organization_membership(target_membership_id uuid, target_role application_role, target_active boolean)
CREATE OR REPLACE FUNCTION public.update_organization_membership(target_membership_id uuid, target_role public.application_role, target_active boolean)
 RETURNS organization_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  changed public.organization_members;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_role not in (
    'BUSINESS_ADMIN',
    'BUSINESS_OWNER',
    'STAFF_MANAGER',
    'STAFF_USER'
  ) then
    raise exception 'invalid organization role' using errcode = '22023';
  end if;

  select *
  into changed
  from public.organization_members
  where id = target_membership_id
  for update;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if target_active <> changed.is_active then
    raise exception
      'Membership access state must be changed through the lifecycle action'
      using errcode = '22023';
  end if;

  update public.organization_members
  set
    role = target_role,
    updated_at = now()
  where id = target_membership_id
  returning * into changed;

  return changed;
end
$function$;

-- Restore least-privilege EXECUTE grants exactly as observed in production.
revoke all on function public.can_access_case(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_access_case(uuid, uuid, uuid)
  to authenticated;

revoke all on function public.can_administer_questions(uuid, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.can_manage_case(uuid, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.can_manage_service_request(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.default_organization_role_permission(public.application_role, text)
  from public, anon, authenticated, service_role;

revoke all on function public.effective_organization_role_permission(uuid, public.application_role, text)
  from public, anon, authenticated, service_role;

revoke all on function public.has_effective_organization_permission(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.has_effective_organization_permission(uuid, text)
  to authenticated;

revoke all on function public.has_organization_role(uuid, public.application_role[], uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.has_organization_role(uuid, public.application_role[], uuid)
  to authenticated;

revoke all on function public.provision_organization_member(uuid, text, public.application_role)
  from public, anon, authenticated, service_role;
grant execute on function public.provision_organization_member(uuid, text, public.application_role)
  to authenticated;

revoke all on function public.provision_organization_member(uuid, text, public.application_role, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.provision_organization_member(uuid, text, public.application_role, boolean)
  to authenticated;

revoke all on function public.record_organization_membership_invitation_event(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_organization_membership_invitation_event(uuid, text)
  to authenticated;

revoke all on function public.save_organization_role_permissions(uuid, public.application_role, jsonb, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.save_organization_role_permissions(uuid, public.application_role, jsonb, boolean)
  to authenticated;

revoke all on function public.synchronize_case_rule_tasks(uuid, uuid, uuid[], uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.synchronize_case_rule_tasks(uuid, uuid, uuid[], uuid)
  to service_role;

revoke all on function public.transition_organization_membership(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.transition_organization_membership(uuid, text)
  to authenticated;

revoke all on function public.update_organization_membership(uuid, public.application_role, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.update_organization_membership(uuid, public.application_role, boolean)
  to authenticated;

-- Restore UNIQUE constraints against the canonical role columns.
alter table public.organization_members
  add constraint organization_members_organization_id_user_id_role_key
  unique (organization_id, user_id, role);

alter table public.organization_role_permissions
  add constraint organization_role_permissions_organization_id_role_permissi_key
  unique (organization_id, role, permission);

alter table public.platform_user_roles
  add constraint platform_user_roles_user_id_role_key
  unique (user_id, role);

-- Restore triggers whose definitions depend on canonical role columns.
create trigger organization_member_role_limit
before insert or update of organization_id, role, is_active
on public.organization_members
for each row
execute function public.enforce_constrained_role_limit();

create trigger platform_roles_identity_category_trigger
before insert or update of user_id, role, is_active
on public.platform_user_roles
for each row
execute function public.enforce_exclusive_identity_category();

-- Restore the single-active-SUPER_ADMIN invariant.
CREATE UNIQUE INDEX one_active_super_admin_uidx ON public.platform_user_roles USING btree (role) WHERE (is_active AND (role = 'SUPER_ADMIN'::public.application_role));

-- Restore helper-dependent RLS policies and projections.

create policy "activity_append"
on "public"."case_activity"
as permissive
for INSERT
to "authenticated"
with check (public.can_access_case(case_id, organization_id));

create policy "activity_select"
on "public"."case_activity"
as permissive
for SELECT
to "authenticated"
using (public.can_access_case(case_id, organization_id));

create policy "assignments_select"
on "public"."case_assignments"
as permissive
for SELECT
to "authenticated"
using (public.can_access_case(case_id, organization_id));

create policy "case_responses_select"
on "public"."case_question_responses"
as permissive
for SELECT
to "authenticated"
using (public.can_access_case(case_id, organization_id));

create policy "case_questions_select"
on "public"."case_questions"
as permissive
for SELECT
to "authenticated"
using (public.can_access_case(case_id, organization_id));

create policy "tasks_operational_write"
on "public"."case_tasks"
as permissive
for ALL
to "authenticated"
using (public.can_access_case(case_id, organization_id))
with check (public.can_access_case(case_id, organization_id));

create policy "tasks_select"
on "public"."case_tasks"
as permissive
for SELECT
to "authenticated"
using (public.can_access_case(case_id, organization_id));

create policy "cases_operational_update"
on "public"."cases"
as permissive
for UPDATE
to "authenticated"
using (public.can_access_case(id, organization_id))
with check (public.can_access_case(id, organization_id));

create policy "cases_select"
on "public"."cases"
as permissive
for SELECT
to "authenticated"
using (public.can_access_case(id, organization_id));

create policy "customers_effective_update"
on "public"."customers"
as permissive
for UPDATE
to "authenticated"
using (public.has_effective_organization_permission(organization_id, 'EDIT_CUSTOMER'::text))
with check (public.has_effective_organization_permission(organization_id, 'EDIT_CUSTOMER'::text));

create policy "rule_actions_effective_delete"
on "public"."rule_actions"
as permissive
for DELETE
to "authenticated"
using (public.has_effective_organization_permission(organization_id, 'MANAGE_RULES'::text));

create policy "rule_actions_effective_insert"
on "public"."rule_actions"
as permissive
for INSERT
to "authenticated"
with check (public.has_effective_organization_permission(organization_id, 'MANAGE_RULES'::text));

create policy "rule_actions_effective_read"
on "public"."rule_actions"
as permissive
for SELECT
to "authenticated"
using (public.has_effective_organization_permission(organization_id, 'VIEW_RULES'::text));

create policy "rule_actions_effective_update"
on "public"."rule_actions"
as permissive
for UPDATE
to "authenticated"
using (public.has_effective_organization_permission(organization_id, 'MANAGE_RULES'::text))
with check (public.has_effective_organization_permission(organization_id, 'MANAGE_RULES'::text));

create policy "rule_definitions_effective_delete"
on "public"."rule_definitions"
as permissive
for DELETE
to "authenticated"
using (public.has_effective_organization_permission(organization_id, 'MANAGE_RULES'::text));

create policy "rule_definitions_effective_insert"
on "public"."rule_definitions"
as permissive
for INSERT
to "authenticated"
with check (public.has_effective_organization_permission(organization_id, 'MANAGE_RULES'::text));

create policy "rule_definitions_effective_read"
on "public"."rule_definitions"
as permissive
for SELECT
to "authenticated"
using (public.has_effective_organization_permission(organization_id, 'VIEW_RULES'::text));

create policy "rule_definitions_effective_update"
on "public"."rule_definitions"
as permissive
for UPDATE
to "authenticated"
using (public.has_effective_organization_permission(organization_id, 'MANAGE_RULES'::text))
with check (public.has_effective_organization_permission(organization_id, 'MANAGE_RULES'::text));

-- Recreate the five security-barrier organization projections.

create view public.organization_cases with (security_barrier=true) as
select
  c.id,
  c.organization_id,
  c.case_number,
  c.customer_id,
  c.title,
  c.description,
  c.case_type,
  c.priority,
  c.status,
  c.due_at,
  c.opened_at,
  c.completed_at,
  c.closed_at,
  c.manager_user_id,
  public.organization_actor_id(c.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(c.created_by_user_id) as created_by_display_name,
  c.created_at,
  c.updated_at
from public.cases c
where public.can_access_case(c.id, c.organization_id, auth.uid());

create view public.organization_case_activity with (security_barrier=true) as
select
  a.id,
  a.organization_id,
  a.case_id,
  public.organization_actor_id(a.actor_user_id) as actor_user_id,
  public.organization_actor_label(a.actor_user_id) as actor_display_name,
  a.event_type,
  a.event_data,
  a.created_at
from public.case_activity a
where public.can_access_case(a.case_id, a.organization_id, auth.uid());

create view public.organization_case_tasks with (security_barrier=true) as
select
  t.id,
  t.organization_id,
  t.case_id,
  t.title,
  t.description,
  t.assigned_user_id,
  t.status,
  t.required,
  t.due_at,
  t.completed_at,
  public.organization_actor_id(t.completed_by_user_id) as completed_by_user_id,
  public.organization_actor_label(t.completed_by_user_id) as completed_by_display_name,
  t.sequence,
  public.organization_actor_id(t.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(t.created_by_user_id) as created_by_display_name,
  t.created_at,
  t.updated_at,
  t.priority,
  t.blocking,
  (t.source_rule_action_id is not null) as generated_by_rule
from public.case_tasks t
where public.can_access_case(t.case_id, t.organization_id, auth.uid());

create view public.organization_rule_definitions with (security_barrier=true) as
select
  r.id,
  r.organization_id,
  r.name,
  r.description,
  r.source_question_id,
  r.condition_operator,
  r.condition_option_id,
  r.active,
  r.display_order,
  public.organization_actor_id(r.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(r.created_by_user_id) as created_by_display_name,
  public.organization_actor_id(r.updated_by_user_id) as updated_by_user_id,
  public.organization_actor_label(r.updated_by_user_id) as updated_by_display_name,
  r.created_at,
  r.updated_at
from public.rule_definitions r
where public.has_effective_organization_permission(
  r.organization_id,
  'VIEW_RULES'::text
);

create view public.organization_rule_actions with (security_barrier=true) as
select
  a.id,
  a.organization_id,
  a.rule_definition_id,
  a.action_type,
  a.target_question_id,
  a.task_title,
  a.task_description,
  a.task_priority,
  a.task_required,
  a.task_blocking,
  a.display_order,
  public.organization_actor_id(a.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(a.created_by_user_id) as created_by_display_name,
  public.organization_actor_id(a.updated_by_user_id) as updated_by_user_id,
  public.organization_actor_label(a.updated_by_user_id) as updated_by_display_name,
  a.created_at,
  a.updated_at
from public.rule_actions a
where a.retired_at is null
  and public.has_effective_organization_permission(
    a.organization_id,
    'VIEW_RULES'::text
  );

-- Restore the established view privilege posture.
-- Case views: public/anon remain excluded; authenticated retains SELECT.
-- Do not revoke service_role's existing table/view privileges.
revoke all on public.organization_cases,
  public.organization_case_activity,
  public.organization_case_tasks
from public, anon;

grant select on public.organization_cases,
  public.organization_case_activity,
  public.organization_case_tasks
to authenticated;

-- Rule views: authenticated receives SELECT only; public/anon remain excluded.
-- Do not revoke service_role's existing table/view privileges.
revoke all on public.organization_rule_definitions,
  public.organization_rule_actions
from public, anon, authenticated;

grant select on public.organization_rule_definitions,
  public.organization_rule_actions
to authenticated;

-- Restore enum-dependent RLS policies.
create policy "assignments_manager_write"
on "public"."case_assignments"
as permissive
for ALL
to "authenticated"
using ((is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_ADMIN'::public.application_role, 'BUSINESS_OWNER'::public.application_role, 'STAFF_MANAGER'::public.application_role])))
with check ((is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_ADMIN'::public.application_role, 'BUSINESS_OWNER'::public.application_role, 'STAFF_MANAGER'::public.application_role])));

create policy "cases_manager_insert"
on "public"."cases"
as permissive
for INSERT
to "authenticated"
with check ((is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_ADMIN'::public.application_role, 'BUSINESS_OWNER'::public.application_role, 'STAFF_MANAGER'::public.application_role])));

create policy "portal_links_admin_write"
on "public"."customer_portal_users"
as permissive
for ALL
to "authenticated"
using ((is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_ADMIN'::public.application_role, 'BUSINESS_OWNER'::public.application_role])))
with check ((is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_ADMIN'::public.application_role, 'BUSINESS_OWNER'::public.application_role])));

create policy "portal_links_self_select"
on "public"."customer_portal_users"
as permissive
for SELECT
to "authenticated"
using (((user_id = auth.uid()) OR is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_ADMIN'::public.application_role, 'BUSINESS_OWNER'::public.application_role])));

create policy "notifications_authorized_select"
on "public"."notifications"
as permissive
for SELECT
to "authenticated"
using ((((recipient_user_id = auth.uid()) AND (is_super_admin() OR has_effective_organization_permission(organization_id, 'VIEW_COMMUNICATIONS'::text))) OR ((NOT is_super_admin(recipient_user_id)) AND has_effective_organization_permission(organization_id, 'VIEW_COMMUNICATIONS'::text) AND has_organization_role(organization_id, ARRAY['BUSINESS_OWNER'::public.application_role], auth.uid()))));

create policy "organization_case_types_access"
on "public"."organization_case_types"
as permissive
for ALL
to "authenticated"
using ((is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role])))
with check ((is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role])));

create policy "organization_lifecycle_access"
on "public"."organization_lifecycle_statuses"
as permissive
for ALL
to "authenticated"
using ((is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role])))
with check ((is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role])));

create policy "members_admin_insert"
on "public"."organization_members"
as permissive
for INSERT
to "authenticated"
with check ((is_super_admin() OR ((NOT is_super_admin(user_id)) AND (role = ANY (ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role, 'STAFF_MANAGER'::public.application_role, 'STAFF_USER'::public.application_role])) AND has_effective_organization_permission(organization_id, 'MANAGE_USERS'::text) AND (has_organization_role(organization_id, ARRAY['BUSINESS_OWNER'::public.application_role], auth.uid()) OR ((role = ANY (ARRAY['STAFF_MANAGER'::public.application_role, 'STAFF_USER'::public.application_role])) AND has_organization_role(organization_id, ARRAY['BUSINESS_ADMIN'::public.application_role], auth.uid()))))));

create policy "members_admin_update"
on "public"."organization_members"
as permissive
for UPDATE
to "authenticated"
using ((is_super_admin() OR ((NOT is_super_admin(user_id)) AND has_effective_organization_permission(organization_id, 'MANAGE_USERS'::text) AND (has_organization_role(organization_id, ARRAY['BUSINESS_OWNER'::public.application_role], auth.uid()) OR ((role = ANY (ARRAY['STAFF_MANAGER'::public.application_role, 'STAFF_USER'::public.application_role])) AND has_organization_role(organization_id, ARRAY['BUSINESS_ADMIN'::public.application_role], auth.uid()))))))
with check ((is_super_admin() OR ((NOT is_super_admin(user_id)) AND (role = ANY (ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role, 'STAFF_MANAGER'::public.application_role, 'STAFF_USER'::public.application_role])) AND has_effective_organization_permission(organization_id, 'MANAGE_USERS'::text) AND (has_organization_role(organization_id, ARRAY['BUSINESS_OWNER'::public.application_role], auth.uid()) OR ((role = ANY (ARRAY['STAFF_MANAGER'::public.application_role, 'STAFF_USER'::public.application_role])) AND has_organization_role(organization_id, ARRAY['BUSINESS_ADMIN'::public.application_role], auth.uid()))))));

create policy "organization_membership_events_read"
on "public"."organization_membership_events"
as permissive
for SELECT
to "authenticated"
using ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM organization_members m
  WHERE ((m.organization_id = organization_membership_events.organization_id) AND (m.user_id = auth.uid()) AND m.is_active AND (m.status = 'ACTIVE'::organization_membership_status) AND (m.role = ANY (ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role])))))));

create policy "organization_settings_access"
on "public"."organization_settings"
as permissive
for ALL
to "authenticated"
using ((is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role])))
with check ((is_super_admin() OR has_organization_role(organization_id, ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role])));

create policy "organizations_admin_write"
on "public"."organizations"
as permissive
for UPDATE
to "authenticated"
using ((is_super_admin() OR has_organization_role(id, ARRAY['BUSINESS_ADMIN'::public.application_role, 'BUSINESS_OWNER'::public.application_role])))
with check ((is_super_admin() OR has_organization_role(id, ARRAY['BUSINESS_ADMIN'::public.application_role, 'BUSINESS_OWNER'::public.application_role])));

create policy "organization_avatar_sources_delete"
on "storage"."objects"
as permissive
for DELETE
to PUBLIC
using (((bucket_id = 'organization-avatar-sources'::text) AND (is_super_admin() OR has_organization_role(((storage.foldername(name))[1])::uuid, ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role]))));

create policy "organization_avatar_sources_insert"
on "storage"."objects"
as permissive
for INSERT
to PUBLIC
with check (((bucket_id = 'organization-avatar-sources'::text) AND (is_super_admin() OR has_organization_role(((storage.foldername(name))[1])::uuid, ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role])) AND (lower(storage.extension(name)) = ANY (ARRAY['jpg'::text, 'jpeg'::text, 'png'::text, 'webp'::text])) AND ((metadata ->> 'mimetype'::text) = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))));

create policy "organization_avatar_sources_select"
on "storage"."objects"
as permissive
for SELECT
to PUBLIC
using (((bucket_id = 'organization-avatar-sources'::text) AND (is_super_admin() OR has_organization_role(((storage.foldername(name))[1])::uuid, ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role]))));

create policy "organization_avatars_delete"
on "storage"."objects"
as permissive
for DELETE
to PUBLIC
using (((bucket_id = 'organization-avatars'::text) AND (is_super_admin() OR has_organization_role(((storage.foldername(name))[1])::uuid, ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role]))));

create policy "organization_avatars_insert"
on "storage"."objects"
as permissive
for INSERT
to PUBLIC
with check (((bucket_id = 'organization-avatars'::text) AND (is_super_admin() OR has_organization_role(((storage.foldername(name))[1])::uuid, ARRAY['BUSINESS_OWNER'::public.application_role, 'BUSINESS_ADMIN'::public.application_role])) AND (lower(storage.extension(name)) = 'webp'::text) AND ((metadata ->> 'mimetype'::text) = 'image/webp'::text)));
