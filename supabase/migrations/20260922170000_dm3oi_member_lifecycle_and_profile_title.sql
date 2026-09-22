create type public.organization_membership_status as enum (
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'REVOKED'
);

alter table public.profiles
  add column title text;

alter table public.profiles
  add constraint profiles_title_length_check
  check (
    title is null
    or char_length(trim(title)) between 1 and 100
  );

alter table public.organization_members
  add column status public.organization_membership_status;

alter table public.organization_members
  add column invited_at timestamptz,
  add column activated_at timestamptz,
  add column suspended_at timestamptz,
  add column revoked_at timestamptz;

update public.organization_members
set
  status = case
    when is_active then 'ACTIVE'::public.organization_membership_status
    else 'SUSPENDED'::public.organization_membership_status
  end,
  activated_at = case
    when is_active then coalesce(joined_at, created_at)
    else null
  end,
  suspended_at = case
    when not is_active then coalesce(updated_at, now())
    else null
  end;

alter table public.organization_members
  alter column status set default 'ACTIVE',
  alter column status set not null;

create index organization_members_status_idx
  on public.organization_members(organization_id, status);

create or replace function public.sync_organization_membership_active_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_active := new.status = 'ACTIVE';

  if new.status = 'ACTIVE' and new.activated_at is null then
    new.activated_at := now();
  end if;

  return new;
end
$$;

create trigger organization_members_sync_active_state
before insert or update of status
on public.organization_members
for each row
execute function public.sync_organization_membership_active_state();

create or replace function public.organization_member_has_active_responsibility(
  target_membership_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  membership public.organization_members;
begin
  select *
  into membership
  from public.organization_members
  where id = target_membership_id;

  if not found then
    return false;
  end if;

  return
    exists (
      select 1
      from public.cases c
      where c.organization_id = membership.organization_id
        and c.manager_user_id = membership.user_id
        and c.status not in ('COMPLETED', 'CLOSED')
    )
    or exists (
      select 1
      from public.case_assignments a
      join public.cases c
        on c.id = a.case_id
       and c.organization_id = a.organization_id
      where a.organization_id = membership.organization_id
        and a.user_id = membership.user_id
        and a.is_active
        and c.status not in ('COMPLETED', 'CLOSED')
    )
    or exists (
      select 1
      from public.case_tasks t
      join public.cases c
        on c.id = t.case_id
       and c.organization_id = t.organization_id
      where t.organization_id = membership.organization_id
        and t.assigned_user_id = membership.user_id
        and t.status not in ('COMPLETED', 'NOT_APPLICABLE')
        and c.status not in ('COMPLETED', 'CLOSED')
    )
    or exists (
      select 1
      from public.service_requests r
      where r.organization_id = membership.organization_id
        and r.assigned_user_id = membership.user_id
        and r.status not in ('RESOLVED', 'CLOSED')
    );
end
$$;

revoke all
on function public.organization_member_has_active_responsibility(uuid)
from public, anon;

grant execute
on function public.organization_member_has_active_responsibility(uuid)
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
    where m.organization_id = membership.organization_id
      and m.user_id = actor
      and m.is_active
    limit 1;

    if actor_role <> 'BUSINESS_OWNER' then
      raise exception 'not authorized' using errcode = '42501';
    end if;

    if membership.role = 'BUSINESS_OWNER' then
      raise exception 'Business Owners cannot change a Business Owner lifecycle'
        using errcode = '42501';
    end if;
  end if;

  if membership.user_id = actor
     and upper(trim(target_action)) in ('SUSPEND', 'REVOKE') then
    raise exception 'A user cannot suspend or revoke their own organization access'
      using errcode = '42501';
  end if;

  case upper(trim(target_action))
    when 'ACTIVATE' then
      if membership.status <> 'INVITED' then
        raise exception 'Only an invited membership can be activated';
      end if;

      next_status := 'ACTIVE';
      membership.activated_at := now();

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
      membership.activated_at := coalesce(membership.activated_at, now());

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

  return next_status;
end
$$;

revoke all
on function public.transition_organization_membership(uuid, text)
from public, anon;

grant execute
on function public.transition_organization_membership(uuid, text)
to authenticated;
