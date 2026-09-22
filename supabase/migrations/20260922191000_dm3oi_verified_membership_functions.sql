alter table public.organization_members
  add column if not exists verified_at timestamptz;


create table public.organization_membership_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,
  membership_id uuid
    references public.organization_members(id)
    on delete set null,
  user_id uuid
    references public.profiles(id)
    on delete set null,
  user_email text not null,
  user_display_name text,
  user_role public.application_role not null,
  actor_user_id uuid
    references public.profiles(id)
    on delete set null,
  event_type text not null
    check (
      event_type in (
        'INVITED',
        'INVITATION_RESENT',
        'VERIFIED',
        'ACTIVATED',
        'SUSPENDED',
        'REACTIVATED',
        'REVOKED',
        'REINSTATED'
      )
    ),
  prior_status public.organization_membership_status,
  new_status public.organization_membership_status not null,
  note text,
  created_at timestamptz not null default now()
);

create index organization_membership_events_membership_idx
  on public.organization_membership_events(
    membership_id,
    created_at desc
  );

create index organization_membership_events_org_idx
  on public.organization_membership_events(
    organization_id,
    created_at desc
  );

create index organization_membership_events_user_idx
  on public.organization_membership_events(
    user_id,
    created_at desc
  );

alter table public.organization_membership_events
  enable row level security;

create policy organization_membership_events_read
on public.organization_membership_events
for select
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.organization_members m
    where m.organization_id =
      organization_membership_events.organization_id
      and m.user_id = auth.uid()
      and m.is_active
      and m.status = 'ACTIVE'
      and m.role in ('BUSINESS_OWNER', 'BUSINESS_ADMIN')
  )
);

revoke insert, update, delete
on public.organization_membership_events
from authenticated;

grant select
on public.organization_membership_events
to authenticated;

create or replace function public.verify_my_membership_invitation()
returns table (
  membership_id uuid,
  organization_id uuid,
  status public.organization_membership_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  membership public.organization_members;
begin
  if actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select *
  into membership
  from public.organization_members
  where user_id = actor
    and status = 'INVITED'
  order by invited_at asc nulls last, created_at asc
  limit 1
  for update;

  if not found then
    return;
  end if;

  update public.organization_members
  set
    status = 'VERIFIED',
    verified_at = now(),
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
    'VERIFIED',
    'INVITED',
    'VERIFIED',
    'Invitation email verified.'
  from public.profiles p
  where p.id = membership.user_id;

  membership_id := membership.id;
  organization_id := membership.organization_id;
  status := 'VERIFIED';

  return next;
end
$$;

revoke all
on function public.verify_my_membership_invitation()
from public, anon;

grant execute
on function public.verify_my_membership_invitation()
to authenticated;

create or replace function public.transition_organization_membership(
  target_membership_id uuid,
  target_action text
)
returns public.organization_membership_status
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all
on function public.transition_organization_membership(uuid, text)
from public, anon;

grant execute
on function public.transition_organization_membership(uuid, text)
to authenticated;


create or replace function public.record_organization_membership_invitation_event(
  target_membership_id uuid,
  target_event_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all
on function public.record_organization_membership_invitation_event(uuid, text)
from public, anon;

grant execute
on function public.record_organization_membership_invitation_event(uuid, text)
to authenticated;


create or replace function public.provision_organization_member(
  target_organization_id uuid,
  target_email text,
  target_role public.application_role,
  target_identity_verified boolean default false
)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all
on function public.provision_organization_member(
  uuid,
  text,
  public.application_role,
  boolean
)
from public, anon;

grant execute
on function public.provision_organization_member(
  uuid,
  text,
  public.application_role,
  boolean
)
to authenticated;

create or replace function public.update_organization_membership(
  target_membership_id uuid,
  target_role public.application_role,
  target_active boolean
)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all
on function public.update_organization_membership(
  uuid,
  public.application_role,
  boolean
)
from public, anon;

grant execute
on function public.update_organization_membership(
  uuid,
  public.application_role,
  boolean
)
to authenticated;
