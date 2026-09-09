-- Deterministic, organization-scoped Rules data foundation. Runtime evaluation
-- and Case Task generation intentionally belong to later milestones.

create type public.rule_condition_operator as enum (
  'IS_YES','IS_NO','EQUALS','NOT_EQUALS','CONTAINS','NOT_CONTAINS','IS_ANSWERED','IS_NOT_ANSWERED'
);
create type public.rule_action_type as enum ('SHOW_QUESTION','REQUIRE_QUESTION','CREATE_TASK');

-- Option UUIDs are authoritative Rule comparison values. This tenant/question
-- key allows the Rule FK to prove all three records share the same scope.
alter table public.question_options
  add constraint question_options_organization_question_id_key
  unique (organization_id,question_id,id);

create table public.rule_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name))>0),
  description text not null default '',
  source_question_id uuid not null,
  condition_operator public.rule_condition_operator not null,
  condition_option_id uuid,
  active boolean not null default true,
  display_order integer not null default 0 check (display_order>=0),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  updated_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  constraint rule_definitions_source_question_fkey foreign key (organization_id,source_question_id)
    references public.question_definitions(organization_id,id) on delete restrict,
  constraint rule_definitions_condition_option_fkey foreign key (organization_id,source_question_id,condition_option_id)
    references public.question_options(organization_id,question_id,id) on delete restrict
);

create table public.rule_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  rule_definition_id uuid not null,
  action_type public.rule_action_type not null,
  target_question_id uuid,
  task_title text,
  task_description text,
  task_priority public.priority_level,
  task_required boolean,
  display_order integer not null default 0 check (display_order>=0),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  updated_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (rule_definition_id,display_order),
  constraint rule_actions_rule_definition_fkey foreign key (organization_id,rule_definition_id)
    references public.rule_definitions(organization_id,id) on delete restrict,
  constraint rule_actions_target_question_fkey foreign key (organization_id,target_question_id)
    references public.question_definitions(organization_id,id) on delete restrict,
  constraint rule_actions_target_shape check (
    (
      action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
      and target_question_id is not null
      and task_title is null and task_description is null
      and task_priority is null and task_required is null
    )
    or
    (
      action_type='CREATE_TASK'
      and target_question_id is null
      and task_title is not null and length(trim(task_title))>0
      and task_description is not null
      and task_priority is not null
      and task_required is not null
    )
  )
);

create index rule_definitions_organization_active_order_idx
  on public.rule_definitions(organization_id,active,display_order);
create index rule_actions_organization_rule_order_idx
  on public.rule_actions(organization_id,rule_definition_id,display_order);
create index rule_definitions_condition_option_idx
  on public.rule_definitions(condition_option_id) where condition_option_id is not null;
create index rule_actions_target_question_idx
  on public.rule_actions(target_question_id) where target_question_id is not null;

create trigger rule_definitions_updated_at before update on public.rule_definitions
  for each row execute function public.set_updated_at();
create trigger rule_actions_updated_at before update on public.rule_actions
  for each row execute function public.set_updated_at();

create function public.validate_rule_condition()
returns trigger language plpgsql set search_path='' as $$
declare source_type public.question_response_type;
begin
  select q.response_type into source_type
  from public.question_definitions q
  where q.organization_id=new.organization_id and q.id=new.source_question_id;
  if source_type is null then raise exception 'invalid rule source question' using errcode='23514'; end if;

  if new.condition_operator in ('IS_ANSWERED','IS_NOT_ANSWERED') then
    if new.condition_option_id is not null then raise exception 'general operator cannot compare an option' using errcode='23514'; end if;
  elsif new.condition_operator in ('IS_YES','IS_NO') then
    if source_type<>'YES_NO' or new.condition_option_id is not null then raise exception 'operator is incompatible with source question' using errcode='23514'; end if;
  elsif new.condition_operator in ('EQUALS','NOT_EQUALS') then
    if source_type<>'SINGLE_SELECT' or new.condition_option_id is null then raise exception 'operator is incompatible with source question' using errcode='23514'; end if;
  elsif new.condition_operator in ('CONTAINS','NOT_CONTAINS') then
    if source_type<>'MULTI_SELECT' or new.condition_option_id is null then raise exception 'operator is incompatible with source question' using errcode='23514'; end if;
  else
    raise exception 'unsupported rule operator' using errcode='23514';
  end if;
  if exists(
    select 1 from public.rule_actions a
    where a.organization_id=new.organization_id and a.rule_definition_id=new.id
      and a.action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
      and a.target_question_id=new.source_question_id
  ) then
    raise exception 'rule cannot directly target its source question' using errcode='23514';
  end if;
  return new;
end $$;

create trigger rule_definitions_validate_condition
  before insert or update of organization_id,source_question_id,condition_operator,condition_option_id
  on public.rule_definitions for each row execute function public.validate_rule_condition();

create function public.validate_rule_action()
returns trigger language plpgsql set search_path='' as $$
declare source_question uuid;
begin
  if new.action_type in ('SHOW_QUESTION','REQUIRE_QUESTION') then
    select r.source_question_id into source_question
    from public.rule_definitions r
    where r.organization_id=new.organization_id and r.id=new.rule_definition_id;
    if source_question is null then raise exception 'invalid rule definition' using errcode='23514'; end if;
    if source_question=new.target_question_id then raise exception 'rule cannot directly target its source question' using errcode='23514'; end if;
  end if;
  return new;
end $$;

create trigger rule_actions_validate_relationship
  before insert or update of organization_id,rule_definition_id,action_type,target_question_id
  on public.rule_actions for each row execute function public.validate_rule_action();

create function public.stamp_rule_configuration_actor()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not public.has_effective_organization_permission(new.organization_id,'MANAGE_RULES')
    then raise exception 'not authorized' using errcode='42501'; end if;
  if tg_op='UPDATE' then
    if new.organization_id<>old.organization_id then raise exception 'rule organization cannot change' using errcode='23514'; end if;
    new.created_by_user_id:=old.created_by_user_id;
  else
    new.created_by_user_id:=actor;
  end if;
  new.updated_by_user_id:=actor;
  return new;
end $$;

create trigger rule_definitions_stamp_actor before insert or update on public.rule_definitions
  for each row execute function public.stamp_rule_configuration_actor();
create trigger rule_actions_stamp_actor before insert or update on public.rule_actions
  for each row execute function public.stamp_rule_configuration_actor();

alter table public.rule_definitions enable row level security;
alter table public.rule_actions enable row level security;

create policy rule_definitions_effective_read on public.rule_definitions
  for select to authenticated
  using (public.has_effective_organization_permission(organization_id,'VIEW_RULES'));
create policy rule_definitions_effective_insert on public.rule_definitions
  for insert to authenticated
  with check (public.has_effective_organization_permission(organization_id,'MANAGE_RULES'));
create policy rule_definitions_effective_update on public.rule_definitions
  for update to authenticated
  using (public.has_effective_organization_permission(organization_id,'MANAGE_RULES'))
  with check (public.has_effective_organization_permission(organization_id,'MANAGE_RULES'));
create policy rule_definitions_effective_delete on public.rule_definitions
  for delete to authenticated
  using (public.has_effective_organization_permission(organization_id,'MANAGE_RULES'));

create policy rule_actions_effective_read on public.rule_actions
  for select to authenticated
  using (public.has_effective_organization_permission(organization_id,'VIEW_RULES'));
create policy rule_actions_effective_insert on public.rule_actions
  for insert to authenticated
  with check (public.has_effective_organization_permission(organization_id,'MANAGE_RULES'));
create policy rule_actions_effective_update on public.rule_actions
  for update to authenticated
  using (public.has_effective_organization_permission(organization_id,'MANAGE_RULES'))
  with check (public.has_effective_organization_permission(organization_id,'MANAGE_RULES'));
create policy rule_actions_effective_delete on public.rule_actions
  for delete to authenticated
  using (public.has_effective_organization_permission(organization_id,'MANAGE_RULES'));

-- Organization projections retain useful attribution while applying the same
-- platform identity masking used by the rest of the tenant-facing product.
create view public.organization_rule_definitions with (security_barrier=true) as
select r.id,r.organization_id,r.name,r.description,r.source_question_id,r.condition_operator,r.condition_option_id,
  r.active,r.display_order,
  public.organization_actor_id(r.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(r.created_by_user_id) as created_by_display_name,
  public.organization_actor_id(r.updated_by_user_id) as updated_by_user_id,
  public.organization_actor_label(r.updated_by_user_id) as updated_by_display_name,
  r.created_at,r.updated_at
from public.rule_definitions r
where public.has_effective_organization_permission(r.organization_id,'VIEW_RULES');

create view public.organization_rule_actions with (security_barrier=true) as
select a.id,a.organization_id,a.rule_definition_id,a.action_type,a.target_question_id,
  a.task_title,a.task_description,a.task_priority,a.task_required,a.display_order,
  public.organization_actor_id(a.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(a.created_by_user_id) as created_by_display_name,
  public.organization_actor_id(a.updated_by_user_id) as updated_by_user_id,
  public.organization_actor_label(a.updated_by_user_id) as updated_by_display_name,
  a.created_at,a.updated_at
from public.rule_actions a
where public.has_effective_organization_permission(a.organization_id,'VIEW_RULES');

revoke all on public.rule_definitions,public.rule_actions,
  public.organization_rule_definitions,public.organization_rule_actions
  from public,anon,authenticated;
grant select on public.organization_rule_definitions,public.organization_rule_actions to authenticated;

-- Extend the centralized configurable permission catalog. Explicit tenant
-- overrides remain authoritative through effective_organization_role_permission.
alter table public.organization_role_permissions
  drop constraint organization_role_permissions_permission_check;
alter table public.organization_role_permissions
  add constraint organization_role_permissions_permission_check check (permission in (
    'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES','ASSIGN_CASES','REASSIGN_CASE_CUSTOMER',
    'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST','MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
    'VIEW_COMMUNICATIONS','RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER','EDIT_CUSTOMER',
    'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_RULES','MANAGE_RULES','VIEW_REPORTS',
    'VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'
  ));

create or replace function public.default_organization_role_permission(target_role public.application_role,target_permission text)
returns boolean language sql immutable set search_path='' as $$
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
$$;

create or replace function public.has_effective_organization_permission(target_organization_id uuid,target_permission text)
returns boolean language plpgsql stable security definer set search_path='' as $$
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
end $$;

create or replace function public.save_organization_role_permissions(
  target_organization_id uuid,target_role public.application_role,target_changes jsonb default '{}'::jsonb,target_restore boolean default false
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
      'VIEW_TASKS','WORK_TASKS','MANAGE_TASKS','ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS','VIEW_RULES','MANAGE_RULES','VIEW_REPORTS',
      'VIEW_USERS','MANAGE_USERS','VIEW_ADMINISTRATION','MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS','VIEW_SETTINGS'
    ])) then raise exception 'invalid permission' using errcode='22023'; end if;
    if target_role in ('STAFF_MANAGER','STAFF_USER') and item.permission='MANAGE_ROLE_PERMISSIONS' then raise exception 'role cannot administer organization access' using errcode='42501'; end if;
    if item.allowed and not public.effective_organization_role_permission(actor_org,coalesce(actor_role,'BUSINESS_OWNER'),item.permission) and not public.is_super_admin(actor) then raise exception 'cannot grant unavailable permission' using errcode='42501'; end if;
    insert into public.organization_role_permissions(organization_id,role,permission,is_allowed,updated_by)
    values(actor_org,target_role,item.permission,item.allowed,actor)
    on conflict(organization_id,role,permission) do update set is_allowed=excluded.is_allowed,updated_by=excluded.updated_by;
  end loop;
end $$;

-- Preserve stable option UUIDs during ordinary Question label edits. New
-- options receive new UUIDs; removing a referenced option is rejected by FK.
create or replace function public.save_question_definition(target_organization_id uuid,target_question_id uuid,target_question_text text,target_description text,target_response_type public.question_response_type,target_required boolean,target_active boolean,target_display_order integer,target_options jsonb default '[]')
returns public.question_definitions language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.question_definitions; opt jsonb; option_id uuid; seen_option_ids uuid[]:='{}'::uuid[];
begin
  if not public.has_effective_organization_permission(target_organization_id,'MANAGE_QUESTIONS') then raise exception 'not authorized' using errcode='42501'; end if;
  if jsonb_typeof(target_options)<>'array' then raise exception 'options must be an array' using errcode='22023'; end if;
  if target_response_type in ('SINGLE_SELECT','MULTI_SELECT') and jsonb_array_length(target_options)=0 then raise exception 'select questions require options' using errcode='23514'; end if;
  if target_question_id is null then
    insert into public.question_definitions(organization_id,question_text,description,response_type,required,active,display_order,created_by_user_id)
    values(target_organization_id,trim(target_question_text),coalesce(target_description,''),target_response_type,target_required,target_active,target_display_order,actor) returning * into item;
  else
    update public.question_definitions set question_text=trim(target_question_text),description=coalesce(target_description,''),response_type=target_response_type,required=target_required,active=target_active,display_order=target_display_order
    where id=target_question_id and organization_id=target_organization_id returning * into item;
    if not found then raise exception 'question not found' using errcode='P0002'; end if;
  end if;
  for opt in select value from jsonb_array_elements(target_options) loop
    option_id:=nullif(opt->>'id','')::uuid;
    if option_id is not null then
      update public.question_options
      set option_label=trim(opt->>'label'),display_order=coalesce((opt->>'display_order')::integer,0)
      where id=option_id and organization_id=target_organization_id and question_id=item.id;
      if not found then raise exception 'invalid question option' using errcode='23514'; end if;
    else
      insert into public.question_options(organization_id,question_id,option_label,option_value,display_order)
      values(target_organization_id,item.id,trim(opt->>'label'),trim(opt->>'value'),coalesce((opt->>'display_order')::integer,0)) returning id into option_id;
    end if;
    seen_option_ids:=array_append(seen_option_ids,option_id);
  end loop;
  delete from public.question_options where organization_id=target_organization_id and question_id=item.id and not (id=any(seen_option_ids));
  if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then item.created_by_user_id:=null; end if;
  return item;
end $$;

alter function public.validate_rule_condition() owner to postgres;
alter function public.validate_rule_action() owner to postgres;
alter function public.stamp_rule_configuration_actor() owner to postgres;
revoke all on function public.validate_rule_condition(),public.validate_rule_action(),public.stamp_rule_configuration_actor() from public,anon,authenticated;
