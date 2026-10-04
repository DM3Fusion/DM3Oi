begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.user_role_history
  add column actor_was_super_admin boolean not null default false;

create or replace function public.stamp_role_history_actor_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.actor_was_super_admin :=
    case
      when new.actor_user_id is null then false
      else public.is_super_admin(new.actor_user_id)
    end;

  return new;
end;
$$;

revoke all
on function public.stamp_role_history_actor_scope()
from public, anon, authenticated, service_role;

create trigger user_role_history_actor_scope
before insert
on public.user_role_history
for each row
execute function public.stamp_role_history_actor_scope();

-- Role history is exposed only through bounded authorization RPCs.
revoke select
on table public.user_role_history
from authenticated;

drop policy if exists user_role_history_read
on public.user_role_history;

create or replace function public.get_organization_user_role_history(
  target_organization_id uuid,
  target_user_id uuid
)
returns table (
  id uuid,
  event_type text,
  prior_role public.application_role,
  new_role public.application_role,
  organization_name text,
  actor_display_name text,
  actor_email text,
  actor_is_platform boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_is_super boolean;
begin
  if actor is null then
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;

  actor_is_super := public.is_super_admin(actor);

  if not actor_is_super
     and not exists (
       select 1
       from public.organization_members membership
       where membership.organization_id = target_organization_id
         and membership.user_id = actor
         and membership.is_active
         and membership.status = 'ACTIVE'
         and membership.role in (
           'BUSINESS_OWNER',
           'BUSINESS_ADMIN'
         )
     )
  then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  return query
  select
    history.id,
    history.event_type,
    history.prior_role,
    history.new_role,
    history.organization_name,
    case
      when history.actor_was_super_admin and not actor_is_super
        then null
      else history.actor_display_name
    end,
    case
      when history.actor_was_super_admin and not actor_is_super
        then null
      else history.actor_email
    end,
    history.actor_was_super_admin,
    history.created_at
  from public.user_role_history history
  where history.scope = 'ORGANIZATION'
    and history.organization_id = target_organization_id
    and history.subject_user_id = target_user_id
  order by history.created_at desc, history.id desc;
end;
$$;

revoke all
on function public.get_organization_user_role_history(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.get_organization_user_role_history(uuid, uuid)
to authenticated;

create or replace function public.get_platform_user_role_history(
  target_user_id uuid
)
returns table (
  id uuid,
  scope text,
  event_type text,
  prior_role public.application_role,
  new_role public.application_role,
  organization_name text,
  actor_display_name text,
  actor_email text,
  actor_is_platform boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null
     or not public.is_super_admin(actor)
  then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  return query
  select
    history.id,
    history.scope,
    history.event_type,
    history.prior_role,
    history.new_role,
    history.organization_name,
    history.actor_display_name,
    history.actor_email,
    history.actor_was_super_admin,
    history.created_at
  from public.user_role_history history
  where history.subject_user_id = target_user_id
  order by history.created_at desc, history.id desc;
end;
$$;

revoke all
on function public.get_platform_user_role_history(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.get_platform_user_role_history(uuid)
to authenticated;

commit;
