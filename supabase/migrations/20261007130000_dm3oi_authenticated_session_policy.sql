begin;

create table public.authenticated_session_policy_configuration (
  singleton boolean primary key default true,
  rollout_started_at timestamptz not null,
  constraint authenticated_session_policy_configuration_singleton
    check (singleton)
);

insert into public.authenticated_session_policy_configuration (
  singleton,
  rollout_started_at
)
values (true, transaction_timestamp());

alter table public.authenticated_session_policy_configuration enable row level security;
revoke all on table public.authenticated_session_policy_configuration
  from public, anon, authenticated;

create table public.authenticated_session_activity (
  session_id uuid primary key
    references auth.sessions(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  session_started_at timestamptz not null,
  last_activity_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authenticated_session_activity_last_after_start
    check (last_activity_at >= session_started_at)
);

alter table public.authenticated_session_activity enable row level security;
revoke all on table public.authenticated_session_activity
  from public, anon, authenticated;

create or replace function public.get_my_route_access_state(
  target_is_meaningful_activity boolean
)
returns table (
  profile_active boolean,
  has_active_super_admin_access boolean,
  has_active_organization_access boolean,
  has_active_customer_portal_access boolean,
  has_pending_organization_membership boolean,
  session_policy_valid boolean,
  session_policy_scope text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_session_id uuid;
  authoritative_started_at timestamptz;
  rollout_started_at timestamptz;
  policy_now timestamptz := statement_timestamp();
  inactivity_timeout interval;
  policy_scope text;
  route_state record;
  activity_row public.authenticated_session_activity;
  policy_valid boolean := false;
begin
  if actor_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select *
  into route_state
  from public.get_my_route_access_state();

  policy_scope := case
    when route_state.has_active_customer_portal_access then 'CUSTOMER_PORTAL'
    else 'INTERNAL'
  end;
  inactivity_timeout := case
    when policy_scope = 'CUSTOMER_PORTAL' then interval '30 minutes'
    else interval '2 hours'
  end;

  begin
    actor_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception
    when invalid_text_representation then
      actor_session_id := null;
  end;

  if actor_session_id is not null then
    select session.created_at
    into authoritative_started_at
    from auth.sessions session
    where session.id = actor_session_id
      and session.user_id = actor_id;
  end if;

  select configuration.rollout_started_at
  into rollout_started_at
  from public.authenticated_session_policy_configuration configuration
  where configuration.singleton = true;

  if authoritative_started_at is not null
    and rollout_started_at is not null then
    insert into public.authenticated_session_activity (
      session_id,
      user_id,
      session_started_at,
      last_activity_at
    )
    values (
      actor_session_id,
      actor_id,
      authoritative_started_at,
      greatest(authoritative_started_at, rollout_started_at)
    )
    on conflict (session_id) do nothing;

    select activity.*
    into activity_row
    from public.authenticated_session_activity activity
    where activity.session_id = actor_session_id
    for update;

    policy_valid :=
      activity_row.user_id = actor_id
      and activity_row.session_started_at = authoritative_started_at
      and policy_now < activity_row.session_started_at + interval '24 hours'
      and policy_now < activity_row.last_activity_at + inactivity_timeout;

    if policy_valid and coalesce(target_is_meaningful_activity, false) then
      update public.authenticated_session_activity activity
      set last_activity_at = greatest(activity.last_activity_at, policy_now),
          updated_at = greatest(activity.updated_at, policy_now)
      where activity.session_id = actor_session_id;
    end if;
  end if;

  return query
  select
    route_state.profile_active,
    route_state.has_active_super_admin_access,
    route_state.has_active_organization_access,
    route_state.has_active_customer_portal_access,
    route_state.has_pending_organization_membership,
    policy_valid,
    policy_scope;
end;
$$;

alter function public.get_my_route_access_state(boolean)
  owner to postgres;
revoke all on function public.get_my_route_access_state(boolean)
  from public, anon, authenticated;
grant execute on function public.get_my_route_access_state(boolean)
  to authenticated;

comment on table public.authenticated_session_activity is
  'Server-owned activity timestamps for per-session inactivity enforcement.';
comment on table public.authenticated_session_policy_configuration is
  'Server-owned fixed rollout boundary for bounded legacy-session inactivity grace.';
comment on function public.get_my_route_access_state(boolean) is
  'Returns the existing route access state plus fail-closed inactivity and absolute session enforcement.';

commit;
