begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Performance Goals are a tenant-scoped domain distinct from Cases and Tasks.
-- Version 1 intentionally supports manual progress only.

alter table public.organization_role_permissions
  drop constraint if exists organization_role_permissions_permission_check;

alter table public.organization_role_permissions
  add constraint organization_role_permissions_permission_check
  check (
    permission in (
      'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES',
      'ASSIGN_CASES','REASSIGN_CASE_CUSTOMER','DELETE_DRAFT_INTAKES',
      'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST',
      'MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST',
      'RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS',
      'RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER',
      'EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS',
      'ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS',
      'VIEW_RULES','MANAGE_RULES','VIEW_REPORTS','VIEW_USERS',
      'MANAGE_USERS','VIEW_ADMINISTRATION',
      'MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS',
      'VIEW_SETTINGS','VIEW_GOALS','MANAGE_GOALS','UPDATE_GOAL_PROGRESS'
    )
  );

create or replace function public.default_organization_role_permission(
  target_role public.application_role,
  target_permission text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when target_role in ('BUSINESS_OWNER','BUSINESS_ADMIN') then
      target_permission=any(array[
        'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES',
        'ASSIGN_CASES','REASSIGN_CASE_CUSTOMER','DELETE_DRAFT_INTAKES',
        'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST',
        'MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST',
        'RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS',
        'RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER',
        'EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS',
        'ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS',
        'VIEW_RULES','MANAGE_RULES','VIEW_REPORTS','VIEW_USERS',
        'MANAGE_USERS','VIEW_ADMINISTRATION',
        'MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS',
        'VIEW_SETTINGS','VIEW_GOALS','MANAGE_GOALS','UPDATE_GOAL_PROGRESS'
      ])
    when target_role='STAFF_MANAGER' then
      target_permission=any(array[
        'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES',
        'ASSIGN_CASES','REASSIGN_CASE_CUSTOMER','DELETE_DRAFT_INTAKES',
        'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST',
        'MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST',
        'RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS',
        'RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER',
        'EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS',
        'ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS',
        'VIEW_RULES','VIEW_REPORTS','VIEW_USERS','VIEW_SETTINGS',
        'VIEW_GOALS','UPDATE_GOAL_PROGRESS'
      ])
    when target_role='STAFF_USER' then
      target_permission=any(array[
        'VIEW_DASHBOARD','VIEW_CASES','WORK_CASES','DELETE_DRAFT_INTAKES',
        'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST',
        'WORK_SERVICE_REQUEST','RESPOND_SERVICE_REQUEST',
        'VIEW_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER',
        'EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','VIEW_QUESTIONS',
        'VIEW_REPORTS','VIEW_USERS','VIEW_SETTINGS','VIEW_GOALS'
      ])
    else false
  end
$$;

create or replace function public.has_effective_organization_permission(
  target_organization_id uuid,
  target_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid:=auth.uid();
  actor_role public.application_role;
begin
  if target_organization_id is null
     or actor is null
     or target_permission is null
     or not target_permission=any(array[
       'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES',
       'ASSIGN_CASES','REASSIGN_CASE_CUSTOMER','DELETE_DRAFT_INTAKES',
       'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST',
       'MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST',
       'RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS',
       'RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER',
       'EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS',
       'ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS',
       'VIEW_RULES','MANAGE_RULES','VIEW_REPORTS','VIEW_USERS',
       'MANAGE_USERS','VIEW_ADMINISTRATION',
       'MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS',
       'VIEW_SETTINGS','VIEW_GOALS','MANAGE_GOALS','UPDATE_GOAL_PROGRESS'
     ])
  then
    return false;
  end if;

  if public.is_super_admin(actor) then
    return exists(
      select 1 from public.organizations organization
      where organization.id=target_organization_id
        and organization.status='ACTIVE'
    );
  end if;

  select member.role
  into actor_role
  from public.organization_members member
  join public.profiles profile on profile.id=member.user_id
  join public.organizations organization on organization.id=member.organization_id
  where member.organization_id=target_organization_id
    and member.user_id=actor
    and member.is_active
    and member.status='ACTIVE'
    and profile.is_active
    and organization.status='ACTIVE'
    and member.role in (
      'BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER'
    );

  if actor_role is null then return false; end if;

  return public.effective_organization_role_permission(
    target_organization_id,
    actor_role,
    target_permission
  );
exception when others then
  return false;
end
$$;

create or replace function public.save_organization_role_permissions(
  target_organization_id uuid,
  target_role public.application_role,
  target_changes jsonb default '{}'::jsonb,
  target_restore boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid:=auth.uid();
  actor_role public.application_role;
  item record;
begin
  select member.role into actor_role
  from public.organization_members member
  where member.organization_id=target_organization_id
    and member.user_id=actor
    and member.is_active
    and member.status='ACTIVE';

  if not public.is_super_admin(actor)
     and (actor_role is null or not public.effective_organization_role_permission(
       target_organization_id,actor_role,'MANAGE_ROLE_PERMISSIONS'
     ))
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if target_organization_id is null
     or target_role not in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER')
  then
    raise exception 'invalid role' using errcode='22023';
  end if;

  if actor_role='BUSINESS_OWNER' and target_role='BUSINESS_OWNER' then
    raise exception 'owner baseline is protected' using errcode='42501';
  end if;
  if actor_role='BUSINESS_ADMIN' and target_role not in ('STAFF_MANAGER','STAFF_USER') then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if actor_role in ('STAFF_MANAGER','STAFF_USER') then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if target_restore then
    for item in
      select permission.permission
      from public.organization_role_permissions permission
      where permission.organization_id=target_organization_id
        and permission.role=target_role
    loop
      if public.default_organization_role_permission(target_role,item.permission)
         and not public.effective_organization_role_permission(
           target_organization_id,
           coalesce(actor_role,'BUSINESS_OWNER'),
           item.permission
         )
         and not public.is_super_admin(actor)
      then
        raise exception 'cannot grant unavailable permission' using errcode='42501';
      end if;
    end loop;
    delete from public.organization_role_permissions
    where organization_id=target_organization_id and role=target_role;
    return;
  end if;

  for item in
    select key as permission,(value#>>'{}')::boolean as allowed
    from jsonb_each(target_changes)
  loop
    if item.permission not in (select unnest(array[
      'VIEW_DASHBOARD','VIEW_CASES','CREATE_CASE','WORK_CASES',
      'ASSIGN_CASES','REASSIGN_CASE_CUSTOMER','DELETE_DRAFT_INTAKES',
      'VIEW_SERVICE_DESK','CREATE_SERVICE_REQUEST','WORK_SERVICE_REQUEST',
      'MANAGE_SERVICE_REQUEST','ASSIGN_SERVICE_REQUEST',
      'RESPOND_SERVICE_REQUEST','VIEW_COMMUNICATIONS',
      'RESPOND_COMMUNICATIONS','VIEW_CUSTOMERS','CREATE_CUSTOMER',
      'EDIT_CUSTOMER','VIEW_TASKS','WORK_TASKS','MANAGE_TASKS',
      'ASSIGN_TASKS','VIEW_QUESTIONS','MANAGE_QUESTIONS',
      'VIEW_RULES','MANAGE_RULES','VIEW_REPORTS','VIEW_USERS',
      'MANAGE_USERS','VIEW_ADMINISTRATION',
      'MANAGE_ORGANIZATION_SETTINGS','MANAGE_ROLE_PERMISSIONS',
      'VIEW_SETTINGS','VIEW_GOALS','MANAGE_GOALS','UPDATE_GOAL_PROGRESS'
    ])) then
      raise exception 'invalid permission' using errcode='22023';
    end if;

    if target_role in ('STAFF_MANAGER','STAFF_USER')
       and item.permission='MANAGE_ROLE_PERMISSIONS'
    then
      raise exception 'role cannot administer organization access' using errcode='42501';
    end if;

    if item.allowed
       and not public.effective_organization_role_permission(
         target_organization_id,
         coalesce(actor_role,'BUSINESS_OWNER'),
         item.permission
       )
       and not public.is_super_admin(actor)
    then
      raise exception 'cannot grant unavailable permission' using errcode='42501';
    end if;

    insert into public.organization_role_permissions(
      organization_id,role,permission,is_allowed,updated_by
    ) values (
      target_organization_id,target_role,item.permission,item.allowed,actor
    )
    on conflict(organization_id,role,permission)
    do update set is_allowed=excluded.is_allowed,updated_by=excluded.updated_by;
  end loop;
end
$$;

create table public.organization_goal_number_counters (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  next_number bigint not null default 1 check(next_number>0)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  goal_number text not null,
  title text not null check(char_length(btrim(title)) between 1 and 160),
  description text not null default '' check(char_length(description)<=4000),
  metric_label text not null check(char_length(btrim(metric_label)) between 1 and 120),
  progress_source text not null default 'MANUAL' check(progress_source='MANUAL'),
  ownership_scope text not null check(ownership_scope in ('ORGANIZATION','INDIVIDUAL')),
  owner_user_id uuid,
  owner_display_name_snapshot text check(owner_display_name_snapshot is null or char_length(owner_display_name_snapshot)<=240),
  measurement_direction text not null check(measurement_direction in ('AT_LEAST','AT_MOST','EXACT')),
  unit text not null check(unit in ('COUNT','PERCENT','CURRENCY','NUMBER')),
  currency_code text,
  target_value numeric(20,4) not null,
  baseline_value numeric(20,4),
  period_kind text not null check(period_kind in ('MONTHLY','QUARTERLY','ANNUAL','CUSTOM')),
  period_start date not null,
  period_end date not null,
  lifecycle_status text not null default 'DRAFT' check(lifecycle_status in ('DRAFT','ACTIVE','COMPLETED','CANCELLED')),
  revision bigint not null default 1 check(revision>0),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  unique(organization_id,goal_number),
  unique(organization_id,id),
  foreign key(organization_id,owner_user_id)
    references public.organization_members(organization_id,user_id)
    on delete restrict,
  check(
    (ownership_scope='ORGANIZATION' and owner_user_id is null and owner_display_name_snapshot is null)
    or
    (ownership_scope='INDIVIDUAL' and owner_user_id is not null and owner_display_name_snapshot is not null)
  ),
  check(period_end>=period_start),
  check(
    (unit='CURRENCY' and currency_code is not null and currency_code ~ '^[A-Z]{3}$')
    or (unit<>'CURRENCY' and currency_code is null)
  ),
  check(
    unit<>'COUNT'
    or (
      target_value=trunc(target_value)
      and (baseline_value is null or baseline_value=trunc(baseline_value))
    )
  ),
  check(
    unit<>'PERCENT'
    or (
      target_value between 0 and 100
      and (baseline_value is null or baseline_value between 0 and 100)
    )
  ),
  check(
    (period_kind='CUSTOM')
    or (period_kind='MONTHLY' and period_start=date_trunc('month',period_start)::date and period_end=(period_start+interval '1 month'-interval '1 day')::date)
    or (period_kind='QUARTERLY' and extract(day from period_start)=1 and extract(month from period_start)::integer in (1,4,7,10) and period_end=(period_start+interval '3 months'-interval '1 day')::date)
    or (period_kind='ANNUAL' and extract(month from period_start)=1 and extract(day from period_start)=1 and period_end=(period_start+interval '1 year'-interval '1 day')::date)
  ),
  check(
    (lifecycle_status='COMPLETED' and completed_at is not null and cancelled_at is null)
    or (lifecycle_status='CANCELLED' and cancelled_at is not null and completed_at is null)
    or (lifecycle_status in ('DRAFT','ACTIVE') and completed_at is null and cancelled_at is null)
  )
);

create index goals_organization_lifecycle_period_idx
  on public.goals(organization_id,lifecycle_status,period_end,period_start);
create index goals_owner_idx
  on public.goals(organization_id,owner_user_id)
  where owner_user_id is not null;

create table public.goal_progress_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  goal_id uuid not null,
  actual_value numeric(20,4) not null,
  as_of_date date not null,
  note text check(note is null or char_length(note)<=1000),
  supersedes_entry_id uuid,
  actor_user_id uuid not null,
  actor_display_name text not null check(char_length(actor_display_name)<=240),
  actor_kind text not null check(actor_kind in ('ORGANIZATION_MEMBER','PLATFORM_SUPPORT')),
  created_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key(organization_id,goal_id)
    references public.goals(organization_id,id) on delete restrict,
  foreign key(organization_id,supersedes_entry_id)
    references public.goal_progress_entries(organization_id,id) on delete restrict,
  check(id is distinct from supersedes_entry_id)
);

create unique index goal_progress_one_correction_idx
  on public.goal_progress_entries(supersedes_entry_id)
  where supersedes_entry_id is not null;
create index goal_progress_current_idx
  on public.goal_progress_entries(goal_id,as_of_date desc,created_at desc,id desc);

create table public.goal_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  goal_id uuid not null,
  event_type text not null check(event_type in (
    'CREATED','DEFINITION_CHANGED','OWNER_CHANGED','TARGET_CHANGED',
    'PERIOD_CHANGED','ACTIVATED','COMPLETED','CANCELLED'
  )),
  before_data jsonb check(before_data is null or jsonb_typeof(before_data)='object'),
  after_data jsonb check(after_data is null or jsonb_typeof(after_data)='object'),
  prior_owner_display_name text check(prior_owner_display_name is null or char_length(prior_owner_display_name)<=240),
  new_owner_display_name text check(new_owner_display_name is null or char_length(new_owner_display_name)<=240),
  note text check(note is null or char_length(note)<=1000),
  actor_user_id uuid,
  actor_display_name text not null check(char_length(actor_display_name)<=240),
  actor_kind text not null check(actor_kind in ('ORGANIZATION_MEMBER','PLATFORM_SUPPORT')),
  created_at timestamptz not null default now(),
  foreign key(organization_id,goal_id)
    references public.goals(organization_id,id) on delete restrict
);

create index goal_history_timeline_idx
  on public.goal_history(goal_id,created_at desc,id desc);

alter table public.organization_goal_number_counters enable row level security;
alter table public.organization_goal_number_counters force row level security;
alter table public.goals enable row level security;
alter table public.goals force row level security;
alter table public.goal_progress_entries enable row level security;
alter table public.goal_progress_entries force row level security;
alter table public.goal_history enable row level security;
alter table public.goal_history force row level security;

revoke all privileges on table public.organization_goal_number_counters from public,anon,authenticated,service_role;
revoke all privileges on table public.goals from public,anon,authenticated,service_role;
revoke all privileges on table public.goal_progress_entries from public,anon,authenticated,service_role;
revoke all privileges on table public.goal_history from public,anon,authenticated,service_role;

-- The service-role deletion guard needs a narrow read of retained Goal ownership.
grant select(id,organization_id,owner_user_id) on table public.goals to service_role;

create or replace function public.next_goal_number(target_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare allocated bigint;
begin
  insert into public.organization_goal_number_counters(organization_id,next_number)
  values(target_organization_id,2)
  on conflict(organization_id)
  do update set next_number=public.organization_goal_number_counters.next_number+1
  returning next_number-1 into allocated;
  return 'GOAL-' || lpad(allocated::text,6,'0');
end
$$;

create or replace function public.goal_actor_display_name(target_actor uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_super_admin(target_actor) then 'DM3Oi Sys Support'
    else left(coalesce(nullif(btrim(profile.display_name),''),nullif(btrim(profile.email),''),'Organization User'),240)
  end
  from public.profiles profile
  where profile.id=target_actor
$$;

create or replace function public.goal_definition_snapshot(item public.goals)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'goalNumber',item.goal_number,
    'title',item.title,
    'description',item.description,
    'metricLabel',item.metric_label,
    'ownershipScope',item.ownership_scope,
    'ownerUserId',item.owner_user_id,
    'ownerDisplayName',item.owner_display_name_snapshot,
    'measurementDirection',item.measurement_direction,
    'unit',item.unit,
    'currencyCode',item.currency_code,
    'targetValue',item.target_value,
    'baselineValue',item.baseline_value,
    'periodKind',item.period_kind,
    'periodStart',item.period_start,
    'periodEnd',item.period_end,
    'lifecycleStatus',item.lifecycle_status,
    'revision',item.revision
  )
$$;

create or replace function public.goal_target_satisfied(
  target_direction text,
  target_actual numeric,
  target_value numeric
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case target_direction
    when 'AT_LEAST' then target_actual>=target_value
    when 'AT_MOST' then target_actual<=target_value
    when 'EXACT' then target_actual=target_value
    else false
  end
$$;

create or replace function public.can_view_goal(
  target_goal public.goals,
  target_actor uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_actor is not null
    and exists(
      select 1 from public.organizations organization
      where organization.id=target_goal.organization_id
        and organization.status='ACTIVE'
    )
    and public.has_effective_organization_permission(target_goal.organization_id,'VIEW_GOALS')
    and (
      target_goal.ownership_scope='ORGANIZATION'
      or target_goal.owner_user_id=target_actor
      or public.has_effective_organization_permission(target_goal.organization_id,'MANAGE_GOALS')
    )
$$;

create or replace function public.get_goals(
  target_organization_id uuid,
  target_goal_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid:=auth.uid();
  result jsonb;
begin
  if actor is null
     or target_organization_id is null
     or not exists(
       select 1 from public.organizations organization
       where organization.id=target_organization_id
         and organization.status='ACTIVE'
     )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',goal.id,
      'organization_id',goal.organization_id,
      'goal_number',goal.goal_number,
      'title',goal.title,
      'description',goal.description,
      'metric_label',goal.metric_label,
      'ownership_scope',goal.ownership_scope,
      'owner_user_id',goal.owner_user_id,
      'owner_display_name',goal.owner_display_name_snapshot,
      'measurement_direction',goal.measurement_direction,
      'unit',goal.unit,
      'currency_code',goal.currency_code,
      'target_value',goal.target_value::text,
      'baseline_value',case when goal.baseline_value is null then null else goal.baseline_value::text end,
      'period_kind',goal.period_kind,
      'period_start',goal.period_start,
      'period_end',goal.period_end,
      'lifecycle_status',goal.lifecycle_status,
      'revision',goal.revision,
      'created_at',goal.created_at,
      'updated_at',goal.updated_at,
      'completed_at',goal.completed_at,
      'cancelled_at',goal.cancelled_at,
      'current_actual',case when current_progress.actual_value is null then null else current_progress.actual_value::text end,
      'current_as_of_date',current_progress.as_of_date,
      'current_progress_entry_id',current_progress.id
    ) order by goal.period_end desc,goal.goal_number desc
  ),'[]'::jsonb)
  into result
  from public.goals goal
  left join lateral (
    select progress.id,progress.actual_value,progress.as_of_date
    from public.goal_progress_entries progress
    where progress.goal_id=goal.id
      and not exists(
        select 1 from public.goal_progress_entries correction
        where correction.supersedes_entry_id=progress.id
      )
    order by progress.as_of_date desc,progress.created_at desc,progress.id desc
    limit 1
  ) current_progress on true
  where goal.organization_id=target_organization_id
    and (target_goal_id is null or goal.id=target_goal_id)
    and public.can_view_goal(goal,actor);

  return result;
end
$$;

create or replace function public.get_goal_progress_entries(
  target_organization_id uuid,
  target_goal_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid:=auth.uid();
  item public.goals;
  result jsonb;
begin
  select * into item from public.goals goal
  where goal.id=target_goal_id and goal.organization_id=target_organization_id;
  if not found or not public.can_view_goal(item,actor) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',entry.id,
    'actual_value',entry.actual_value::text,
    'as_of_date',entry.as_of_date,
    'note',entry.note,
    'supersedes_entry_id',entry.supersedes_entry_id,
    'is_superseded',exists(
      select 1 from public.goal_progress_entries correction
      where correction.supersedes_entry_id=entry.id
    ),
    'actor_user_id',case when entry.actor_kind='PLATFORM_SUPPORT' then null else entry.actor_user_id end,
    'actor_display_name',entry.actor_display_name,
    'actor_kind',entry.actor_kind,
    'created_at',entry.created_at
  ) order by entry.as_of_date desc,entry.created_at desc,entry.id desc),'[]'::jsonb)
  into result
  from public.goal_progress_entries entry
  where entry.organization_id=target_organization_id
    and entry.goal_id=target_goal_id;
  return result;
end
$$;

create or replace function public.get_goal_history(
  target_organization_id uuid,
  target_goal_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid:=auth.uid();
  item public.goals;
  result jsonb;
begin
  select * into item from public.goals goal
  where goal.id=target_goal_id and goal.organization_id=target_organization_id;
  if not found or not public.can_view_goal(item,actor) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',history.id,
    'event_type',history.event_type,
    'before_data',history.before_data,
    'after_data',history.after_data,
    'prior_owner_display_name',history.prior_owner_display_name,
    'new_owner_display_name',history.new_owner_display_name,
    'note',history.note,
    'actor_user_id',case when history.actor_kind='PLATFORM_SUPPORT' then null else history.actor_user_id end,
    'actor_display_name',history.actor_display_name,
    'actor_kind',history.actor_kind,
    'created_at',history.created_at
  ) order by history.created_at desc,history.id desc),'[]'::jsonb)
  into result
  from public.goal_history history
  where history.organization_id=target_organization_id
    and history.goal_id=target_goal_id;
  return result;
end
$$;

create or replace function public.save_goal(
  target_organization_id uuid,
  target_goal_id uuid,
  target_title text,
  target_description text,
  target_metric_label text,
  target_ownership_scope text,
  target_owner_user_id uuid,
  target_measurement_direction text,
  target_unit text,
  target_currency_code text,
  target_target_value numeric,
  target_baseline_value numeric,
  target_period_kind text,
  target_period_start date,
  target_period_end date,
  expected_revision bigint default null
)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid:=auth.uid();
  actor_label text;
  actor_kind text;
  owner_label text;
  item public.goals;
  previous public.goals;
  before_snapshot jsonb;
  after_snapshot jsonb;
  normalized_scope text:=upper(btrim(coalesce(target_ownership_scope,'')));
  normalized_direction text:=upper(btrim(coalesce(target_measurement_direction,'')));
  normalized_unit text:=upper(btrim(coalesce(target_unit,'')));
  normalized_period text:=upper(btrim(coalesce(target_period_kind,'')));
  normalized_currency text:=nullif(upper(btrim(coalesce(target_currency_code,''))), '');
begin
  if actor is null
     or not public.has_effective_organization_permission(target_organization_id,'MANAGE_GOALS')
  then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if target_title is null or char_length(btrim(target_title)) not between 1 and 160
     or char_length(coalesce(target_description,''))>4000
     or target_metric_label is null or char_length(btrim(target_metric_label)) not between 1 and 120
  then
    raise exception 'invalid goal definition' using errcode='22023';
  end if;
  if normalized_scope not in ('ORGANIZATION','INDIVIDUAL')
     or normalized_direction not in ('AT_LEAST','AT_MOST','EXACT')
     or normalized_unit not in ('COUNT','PERCENT','CURRENCY','NUMBER')
     or normalized_period not in ('MONTHLY','QUARTERLY','ANNUAL','CUSTOM')
     or target_target_value is null
     or target_period_start is null
     or target_period_end is null
  then
    raise exception 'invalid goal measurement' using errcode='22023';
  end if;
  if normalized_unit='CURRENCY' and (
    normalized_currency is null or normalized_currency !~ '^[A-Z]{3}$'
  ) then
    raise exception 'invalid currency code' using errcode='22023';
  end if;
  if normalized_unit<>'CURRENCY' then normalized_currency:=null; end if;
  if normalized_unit='COUNT' and (
    target_target_value<>trunc(target_target_value)
    or (
      target_baseline_value is not null
      and target_baseline_value<>trunc(target_baseline_value)
    )
  ) then
    raise exception 'count values must be whole numbers' using errcode='22023';
  end if;
  if normalized_unit='PERCENT' and (
    target_target_value not between 0 and 100
    or (target_baseline_value is not null and target_baseline_value not between 0 and 100)
  ) then
    raise exception 'invalid percent value' using errcode='22023';
  end if;

  if normalized_scope='INDIVIDUAL' then
    if target_owner_user_id is null then
      raise exception 'individual goal owner required' using errcode='22023';
    end if;
    select left(coalesce(nullif(btrim(profile.display_name),''),nullif(btrim(profile.email),''),'Organization User'),240)
    into owner_label
    from public.organization_members member
    join public.profiles profile on profile.id=member.user_id
    where member.organization_id=target_organization_id
      and member.user_id=target_owner_user_id
      and member.is_active
      and member.status='ACTIVE'
      and profile.is_active;
    if owner_label is null then
      raise exception 'select an active organization user' using errcode='22023';
    end if;
  else
    target_owner_user_id:=null;
    owner_label:=null;
  end if;

  actor_label:=public.goal_actor_display_name(actor);
  actor_kind:=case when public.is_super_admin(actor) then 'PLATFORM_SUPPORT' else 'ORGANIZATION_MEMBER' end;
  if actor_label is null then raise exception 'actor profile unavailable' using errcode='42501'; end if;

  if target_goal_id is null then
    insert into public.goals(
      organization_id,goal_number,title,description,metric_label,
      ownership_scope,owner_user_id,owner_display_name_snapshot,
      measurement_direction,unit,currency_code,target_value,baseline_value,
      period_kind,period_start,period_end,created_by_user_id,updated_by_user_id
    ) values (
      target_organization_id,public.next_goal_number(target_organization_id),
      btrim(target_title),btrim(coalesce(target_description,'')),btrim(target_metric_label),
      normalized_scope,target_owner_user_id,owner_label,
      normalized_direction,normalized_unit,normalized_currency,target_target_value,target_baseline_value,
      normalized_period,target_period_start,target_period_end,actor,actor
    ) returning * into item;
    insert into public.goal_history(
      organization_id,goal_id,event_type,after_data,new_owner_display_name,
      actor_user_id,actor_display_name,actor_kind
    ) values (
      item.organization_id,item.id,'CREATED',public.goal_definition_snapshot(item),
      item.owner_display_name_snapshot,actor,actor_label,actor_kind
    );
    return item;
  end if;

  select * into item from public.goals goal
  where goal.id=target_goal_id and goal.organization_id=target_organization_id
  for update;
  if not found then raise exception 'goal not found' using errcode='P0002'; end if;
  if expected_revision is null or item.revision<>expected_revision then
    raise exception 'goal changed after it was opened' using errcode='40001';
  end if;
  if item.lifecycle_status in ('COMPLETED','CANCELLED') then
    raise exception 'terminal goal cannot be edited' using errcode='23514';
  end if;
  if exists(
    select 1 from public.goal_progress_entries entry where entry.goal_id=item.id
  ) and (
    item.metric_label is distinct from btrim(target_metric_label)
    or item.measurement_direction is distinct from normalized_direction
    or item.unit is distinct from normalized_unit
    or item.currency_code is distinct from normalized_currency
    or item.baseline_value is distinct from target_baseline_value
    or item.target_value is distinct from target_target_value
    or item.period_kind is distinct from normalized_period
    or item.period_start is distinct from target_period_start
    or item.period_end is distinct from target_period_end
  ) then
    raise exception 'goal measurement cannot change after progress is recorded' using errcode='23514';
  end if;
  if item.owner_user_id is not distinct from target_owner_user_id then
    owner_label:=item.owner_display_name_snapshot;
  end if;

  previous:=item;
  before_snapshot:=public.goal_definition_snapshot(previous);
  update public.goals set
    title=btrim(target_title),
    description=btrim(coalesce(target_description,'')),
    metric_label=btrim(target_metric_label),
    ownership_scope=normalized_scope,
    owner_user_id=target_owner_user_id,
    owner_display_name_snapshot=owner_label,
    measurement_direction=normalized_direction,
    unit=normalized_unit,
    currency_code=normalized_currency,
    target_value=target_target_value,
    baseline_value=target_baseline_value,
    period_kind=normalized_period,
    period_start=target_period_start,
    period_end=target_period_end,
    updated_by_user_id=actor,
    updated_at=clock_timestamp(),
    revision=revision+1
  where id=item.id returning * into item;
  after_snapshot:=public.goal_definition_snapshot(item);

  if previous.title is distinct from item.title
     or previous.description is distinct from item.description
     or previous.metric_label is distinct from item.metric_label
     or previous.measurement_direction is distinct from item.measurement_direction
     or previous.unit is distinct from item.unit
     or previous.currency_code is distinct from item.currency_code
  then
    insert into public.goal_history(organization_id,goal_id,event_type,before_data,after_data,actor_user_id,actor_display_name,actor_kind)
    values(item.organization_id,item.id,'DEFINITION_CHANGED',before_snapshot,after_snapshot,actor,actor_label,actor_kind);
  end if;
  if previous.ownership_scope is distinct from item.ownership_scope
     or previous.owner_user_id is distinct from item.owner_user_id
  then
    insert into public.goal_history(organization_id,goal_id,event_type,before_data,after_data,prior_owner_display_name,new_owner_display_name,actor_user_id,actor_display_name,actor_kind)
    values(item.organization_id,item.id,'OWNER_CHANGED',before_snapshot,after_snapshot,previous.owner_display_name_snapshot,item.owner_display_name_snapshot,actor,actor_label,actor_kind);
  end if;
  if previous.target_value is distinct from item.target_value
     or previous.baseline_value is distinct from item.baseline_value
  then
    insert into public.goal_history(organization_id,goal_id,event_type,before_data,after_data,actor_user_id,actor_display_name,actor_kind)
    values(item.organization_id,item.id,'TARGET_CHANGED',before_snapshot,after_snapshot,actor,actor_label,actor_kind);
  end if;
  if previous.period_kind is distinct from item.period_kind
     or previous.period_start is distinct from item.period_start
     or previous.period_end is distinct from item.period_end
  then
    insert into public.goal_history(organization_id,goal_id,event_type,before_data,after_data,actor_user_id,actor_display_name,actor_kind)
    values(item.organization_id,item.id,'PERIOD_CHANGED',before_snapshot,after_snapshot,actor,actor_label,actor_kind);
  end if;
  return item;
end
$$;

create or replace function public.record_goal_progress(
  target_organization_id uuid,
  target_goal_id uuid,
  target_actual_value numeric,
  target_as_of_date date,
  target_note text default null,
  target_supersedes_entry_id uuid default null,
  expected_revision bigint default null
)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid:=auth.uid();
  actor_label text;
  actor_kind text;
  item public.goals;
  organization_timezone text;
  organization_today date;
begin
  if actor is null then raise exception 'not authorized' using errcode='42501'; end if;

  select * into item from public.goals goal
  where goal.id=target_goal_id and goal.organization_id=target_organization_id
  for update;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  if not (
    public.has_effective_organization_permission(item.organization_id,'MANAGE_GOALS')
    or (
      public.has_effective_organization_permission(item.organization_id,'UPDATE_GOAL_PROGRESS')
      and (item.ownership_scope='ORGANIZATION' or item.owner_user_id=actor)
    )
  ) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if expected_revision is null or item.revision<>expected_revision then
    raise exception 'goal changed after it was opened' using errcode='40001';
  end if;
  if item.lifecycle_status<>'ACTIVE' then
    raise exception 'progress requires an active goal' using errcode='23514';
  end if;
  if target_actual_value is null or target_as_of_date is null then
    raise exception 'actual value and as-of date are required' using errcode='22023';
  end if;
  if item.unit='COUNT' and target_actual_value<>trunc(target_actual_value) then
    raise exception 'count values must be whole numbers' using errcode='22023';
  end if;
  if item.unit='PERCENT' and target_actual_value not between 0 and 100 then
    raise exception 'invalid percent value' using errcode='22023';
  end if;
  if target_as_of_date<item.period_start or target_as_of_date>item.period_end then
    raise exception 'progress date is outside the goal period' using errcode='22023';
  end if;
  if char_length(coalesce(target_note,''))>1000 then
    raise exception 'progress note too long' using errcode='22023';
  end if;

  select coalesce(settings.timezone,'UTC') into organization_timezone
  from public.organization_settings settings
  where settings.organization_id=item.organization_id;
  organization_timezone:=coalesce(organization_timezone,'UTC');
  organization_today:=(clock_timestamp() at time zone organization_timezone)::date;
  if target_as_of_date>organization_today then
    raise exception 'progress date cannot be in the future' using errcode='22023';
  end if;

  if target_supersedes_entry_id is not null and not exists(
    select 1 from public.goal_progress_entries previous
    where previous.id=target_supersedes_entry_id
      and previous.organization_id=item.organization_id
      and previous.goal_id=item.id
      and not exists(
        select 1 from public.goal_progress_entries correction
        where correction.supersedes_entry_id=previous.id
      )
  ) then
    raise exception 'progress entry cannot be corrected' using errcode='23514';
  end if;

  actor_label:=public.goal_actor_display_name(actor);
  actor_kind:=case when public.is_super_admin(actor) then 'PLATFORM_SUPPORT' else 'ORGANIZATION_MEMBER' end;
  if actor_label is null then raise exception 'actor profile unavailable' using errcode='42501'; end if;

  insert into public.goal_progress_entries(
    organization_id,goal_id,actual_value,as_of_date,note,supersedes_entry_id,
    actor_user_id,actor_display_name,actor_kind
  ) values (
    item.organization_id,item.id,target_actual_value,target_as_of_date,
    nullif(btrim(coalesce(target_note,'')),''),target_supersedes_entry_id,
    actor,actor_label,actor_kind
  );

  update public.goals set
    revision=revision+1,
    updated_by_user_id=actor,
    updated_at=clock_timestamp()
  where id=item.id returning * into item;
  return item;
end
$$;

create or replace function public.transition_goal(
  target_organization_id uuid,
  target_goal_id uuid,
  target_action text,
  target_note text default null,
  expected_revision bigint default null
)
returns public.goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid:=auth.uid();
  actor_label text;
  actor_kind text;
  action_name text:=upper(btrim(coalesce(target_action,'')));
  item public.goals;
  previous public.goals;
  current_actual numeric;
  organization_timezone text;
  organization_today date;
begin
  if actor is null
     or not public.has_effective_organization_permission(target_organization_id,'MANAGE_GOALS')
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select * into item from public.goals goal
  where goal.id=target_goal_id and goal.organization_id=target_organization_id
  for update;
  if not found then raise exception 'goal not found' using errcode='P0002'; end if;
  if expected_revision is null or item.revision<>expected_revision then
    raise exception 'goal changed after it was opened' using errcode='40001';
  end if;
  if action_name not in ('ACTIVATE','COMPLETE','CANCEL') then
    raise exception 'unsupported goal lifecycle action' using errcode='22023';
  end if;
  if action_name='ACTIVATE' and item.lifecycle_status<>'DRAFT' then
    raise exception 'invalid goal lifecycle transition' using errcode='23514';
  end if;
  if action_name='COMPLETE' and item.lifecycle_status<>'ACTIVE' then
    raise exception 'invalid goal lifecycle transition' using errcode='23514';
  end if;
  if action_name='CANCEL' and item.lifecycle_status not in ('DRAFT','ACTIVE') then
    raise exception 'invalid goal lifecycle transition' using errcode='23514';
  end if;
  if action_name='CANCEL' and nullif(btrim(coalesce(target_note,'')),'') is null then
    raise exception 'cancellation reason is required' using errcode='22023';
  end if;
  if char_length(coalesce(target_note,''))>1000 then
    raise exception 'lifecycle note too long' using errcode='22023';
  end if;

  select coalesce(settings.timezone,'UTC') into organization_timezone
  from public.organization_settings settings
  where settings.organization_id=item.organization_id;
  organization_timezone:=coalesce(organization_timezone,'UTC');
  organization_today:=(clock_timestamp() at time zone organization_timezone)::date;

  if action_name='COMPLETE' then
    select progress.actual_value into current_actual
    from public.goal_progress_entries progress
    where progress.goal_id=item.id
      and not exists(
        select 1 from public.goal_progress_entries correction
        where correction.supersedes_entry_id=progress.id
      )
    order by progress.as_of_date desc,progress.created_at desc,progress.id desc
    limit 1;
    if organization_today<=item.period_end
       and (current_actual is null or not public.goal_target_satisfied(
         item.measurement_direction,current_actual,item.target_value
       ))
    then
      raise exception 'goal target must be satisfied before early completion' using errcode='23514';
    end if;
  end if;

  actor_label:=public.goal_actor_display_name(actor);
  actor_kind:=case when public.is_super_admin(actor) then 'PLATFORM_SUPPORT' else 'ORGANIZATION_MEMBER' end;
  if actor_label is null then raise exception 'actor profile unavailable' using errcode='42501'; end if;
  previous:=item;

  update public.goals set
    lifecycle_status=case action_name
      when 'ACTIVATE' then 'ACTIVE'
      when 'COMPLETE' then 'COMPLETED'
      else 'CANCELLED'
    end,
    completed_at=case when action_name='COMPLETE' then clock_timestamp() else null end,
    cancelled_at=case when action_name='CANCEL' then clock_timestamp() else null end,
    revision=revision+1,
    updated_by_user_id=actor,
    updated_at=clock_timestamp()
  where id=item.id returning * into item;

  insert into public.goal_history(
    organization_id,goal_id,event_type,before_data,after_data,note,
    actor_user_id,actor_display_name,actor_kind
  ) values (
    item.organization_id,item.id,
    case action_name when 'ACTIVATE' then 'ACTIVATED' when 'COMPLETE' then 'COMPLETED' else 'CANCELLED' end,
    public.goal_definition_snapshot(previous),public.goal_definition_snapshot(item),
    nullif(btrim(coalesce(target_note,'')),''),actor,actor_label,actor_kind
  );
  return item;
end
$$;

-- Extend organization reset without editing applied historical migrations.
alter function public.preview_organization_reset(uuid,uuid)
  rename to preview_organization_reset_without_goals;

create function public.preview_organization_reset(
  target_organization_id uuid,
  preserved_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  result:=public.preview_organization_reset_without_goals(
    target_organization_id,preserved_owner_user_id
  );
  return result || jsonb_build_object(
    'goalProgressEntries',(select count(*) from public.goal_progress_entries where organization_id=target_organization_id),
    'goalHistory',(select count(*) from public.goal_history where organization_id=target_organization_id),
    'goals',(select count(*) from public.goals where organization_id=target_organization_id),
    'goalNumberCounters',(select count(*) from public.organization_goal_number_counters where organization_id=target_organization_id)
  );
end
$$;

alter function public.reset_organization_company_and_users_without_email_deliveries(uuid,uuid,text)
  rename to reset_org_company_users_without_email_deliveries_and_goals;

revoke all on function public.preview_organization_reset_without_goals(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.reset_org_company_users_without_email_deliveries_and_goals(uuid,uuid,text)
  from public,anon,authenticated;

create function public.reset_organization_company_and_users_without_email_deliveries(
  target_organization_id uuid,
  preserved_owner_user_id uuid,
  confirmation_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  goal_counts jsonb;
  deleted_count bigint;
  reset_audit_id uuid;
begin
  perform public.preview_organization_reset(target_organization_id,preserved_owner_user_id);
  perform organization.id
  from public.organizations organization
  where organization.id=target_organization_id
  for update;
  if not found then raise exception 'organization not found' using errcode='P0002'; end if;
  goal_counts:='{}'::jsonb;
  delete from public.goal_progress_entries where organization_id=target_organization_id;
  get diagnostics deleted_count=row_count;
  goal_counts:=goal_counts||jsonb_build_object('goalProgressEntries',deleted_count);
  delete from public.goal_history where organization_id=target_organization_id;
  get diagnostics deleted_count=row_count;
  goal_counts:=goal_counts||jsonb_build_object('goalHistory',deleted_count);
  delete from public.goals where organization_id=target_organization_id;
  get diagnostics deleted_count=row_count;
  goal_counts:=goal_counts||jsonb_build_object('goals',deleted_count);
  delete from public.organization_goal_number_counters where organization_id=target_organization_id;
  get diagnostics deleted_count=row_count;
  goal_counts:=goal_counts||jsonb_build_object('goalNumberCounters',deleted_count);

  result:=public.reset_org_company_users_without_email_deliveries_and_goals(
    target_organization_id,preserved_owner_user_id,confirmation_text
  );
  reset_audit_id:=nullif(result->>'resetAuditId','')::uuid;
  if reset_audit_id is not null then
    update public.platform_organization_reset_audit
    set deleted_counts=deleted_counts||goal_counts
    where id=reset_audit_id;
  end if;
  return result||goal_counts;
end
$$;

-- Extend permanent organization deletion with the same explicit dependency order.
alter function public.preview_permanent_organization_deletion(uuid)
  rename to preview_permanent_organization_deletion_without_goals;

create function public.preview_permanent_organization_deletion(target_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  result:=public.preview_permanent_organization_deletion_without_goals(target_organization_id);
  return result||jsonb_build_object(
    'goalProgressEntries',(select count(*) from public.goal_progress_entries where organization_id=target_organization_id),
    'goalHistory',(select count(*) from public.goal_history where organization_id=target_organization_id),
    'goals',(select count(*) from public.goals where organization_id=target_organization_id),
    'goalNumberCounters',(select count(*) from public.organization_goal_number_counters where organization_id=target_organization_id)
  );
end
$$;

alter function public.permanently_delete_organization_without_email_deliveries(uuid,text)
  rename to permanent_delete_org_without_email_deliveries_and_goals;

revoke all on function public.preview_permanent_organization_deletion_without_goals(uuid)
  from public,anon,authenticated;
revoke all on function public.permanent_delete_org_without_email_deliveries_and_goals(uuid,text)
  from public,anon,authenticated;

create function public.permanently_delete_organization_without_email_deliveries(
  target_organization_id uuid,
  confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  goal_counts jsonb;
  deleted_count bigint;
  deletion_audit_id uuid;
begin
  perform public.preview_permanent_organization_deletion(target_organization_id);
  perform organization.id
  from public.organizations organization
  where organization.id=target_organization_id
  for update;
  if not found then raise exception 'organization not found' using errcode='P0002'; end if;
  goal_counts:='{}'::jsonb;
  delete from public.goal_progress_entries where organization_id=target_organization_id;
  get diagnostics deleted_count=row_count;
  goal_counts:=goal_counts||jsonb_build_object('goalProgressEntries',deleted_count);
  delete from public.goal_history where organization_id=target_organization_id;
  get diagnostics deleted_count=row_count;
  goal_counts:=goal_counts||jsonb_build_object('goalHistory',deleted_count);
  delete from public.goals where organization_id=target_organization_id;
  get diagnostics deleted_count=row_count;
  goal_counts:=goal_counts||jsonb_build_object('goals',deleted_count);
  delete from public.organization_goal_number_counters where organization_id=target_organization_id;
  get diagnostics deleted_count=row_count;
  goal_counts:=goal_counts||jsonb_build_object('goalNumberCounters',deleted_count);

  result:=public.permanent_delete_org_without_email_deliveries_and_goals(
    target_organization_id,confirmation
  );
  deletion_audit_id:=nullif(result->>'deletionAuditId','')::uuid;
  if deletion_audit_id is not null then
    update public.platform_organization_deletion_audit
    set deleted_counts=deleted_counts||goal_counts
    where id=deletion_audit_id;
  end if;
  return result||goal_counts;
end
$$;

alter function public.default_organization_role_permission(public.application_role,text) owner to postgres;
alter function public.has_effective_organization_permission(uuid,text) owner to postgres;
alter function public.save_organization_role_permissions(uuid,public.application_role,jsonb,boolean) owner to postgres;
alter function public.next_goal_number(uuid) owner to postgres;
alter function public.goal_actor_display_name(uuid) owner to postgres;
alter function public.goal_definition_snapshot(public.goals) owner to postgres;
alter function public.goal_target_satisfied(text,numeric,numeric) owner to postgres;
alter function public.can_view_goal(public.goals,uuid) owner to postgres;
alter function public.get_goals(uuid,uuid) owner to postgres;
alter function public.get_goal_progress_entries(uuid,uuid) owner to postgres;
alter function public.get_goal_history(uuid,uuid) owner to postgres;
alter function public.save_goal(uuid,uuid,text,text,text,text,uuid,text,text,text,numeric,numeric,text,date,date,bigint) owner to postgres;
alter function public.record_goal_progress(uuid,uuid,numeric,date,text,uuid,bigint) owner to postgres;
alter function public.transition_goal(uuid,uuid,text,text,bigint) owner to postgres;
alter function public.preview_organization_reset(uuid,uuid) owner to postgres;
alter function public.reset_organization_company_and_users_without_email_deliveries(uuid,uuid,text) owner to postgres;
alter function public.preview_permanent_organization_deletion(uuid) owner to postgres;
alter function public.permanently_delete_organization_without_email_deliveries(uuid,text) owner to postgres;

revoke all on function public.next_goal_number(uuid) from public,anon,authenticated,service_role;
revoke all on function public.goal_actor_display_name(uuid) from public,anon,authenticated,service_role;
revoke all on function public.goal_definition_snapshot(public.goals) from public,anon,authenticated,service_role;
revoke all on function public.goal_target_satisfied(text,numeric,numeric) from public,anon,authenticated,service_role;
revoke all on function public.can_view_goal(public.goals,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_goals(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_goal_progress_entries(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_goal_history(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.save_goal(uuid,uuid,text,text,text,text,uuid,text,text,text,numeric,numeric,text,date,date,bigint) from public,anon,authenticated,service_role;
revoke all on function public.record_goal_progress(uuid,uuid,numeric,date,text,uuid,bigint) from public,anon,authenticated,service_role;
revoke all on function public.transition_goal(uuid,uuid,text,text,bigint) from public,anon,authenticated,service_role;
revoke all on function public.preview_organization_reset(uuid,uuid) from public,anon;
revoke all on function public.reset_organization_company_and_users_without_email_deliveries(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.preview_permanent_organization_deletion(uuid) from public,anon;
revoke all on function public.permanently_delete_organization_without_email_deliveries(uuid,text) from public,anon,authenticated;

grant execute on function public.get_goals(uuid,uuid) to authenticated;
grant execute on function public.get_goal_progress_entries(uuid,uuid) to authenticated;
grant execute on function public.get_goal_history(uuid,uuid) to authenticated;
grant execute on function public.save_goal(uuid,uuid,text,text,text,text,uuid,text,text,text,numeric,numeric,text,date,date,bigint) to authenticated;
grant execute on function public.record_goal_progress(uuid,uuid,numeric,date,text,uuid,bigint) to authenticated;
grant execute on function public.transition_goal(uuid,uuid,text,text,bigint) to authenticated;
grant execute on function public.preview_organization_reset(uuid,uuid) to authenticated;
grant execute on function public.preview_permanent_organization_deletion(uuid) to authenticated;

comment on table public.goals is 'Tenant-scoped manual Performance Goals. Lifecycle is independent from computed performance.';
comment on table public.goal_progress_entries is 'Append-only manual actual snapshots. Corrections supersede rather than mutate prior entries.';
comment on table public.goal_history is 'Append-only bounded Goal definition and lifecycle history with durable actor and owner labels.';

commit;
