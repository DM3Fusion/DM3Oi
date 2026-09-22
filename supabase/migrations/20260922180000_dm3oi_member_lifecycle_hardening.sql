revoke all
on function public.organization_member_has_active_responsibility(uuid)
from authenticated;

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
      if membership.status <> 'INVITED' then
        raise exception 'Only an invited membership can be activated';
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
  desired_status public.organization_membership_status;
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

  if target_active then
    desired_status := 'ACTIVE';
  elsif changed.status = 'REVOKED' then
    desired_status := 'REVOKED';
  else
    desired_status := 'SUSPENDED';
  end if;

  update public.organization_members
  set
    role = target_role,
    status = desired_status,
    activated_at = case
      when desired_status = 'ACTIVE'
        then coalesce(activated_at, now())
      else activated_at
    end,
    suspended_at = case
      when desired_status = 'SUSPENDED'
        then coalesce(suspended_at, now())
      when desired_status = 'ACTIVE'
        then null
      else suspended_at
    end,
    revoked_at = case
      when desired_status = 'ACTIVE'
        then null
      else revoked_at
    end,
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
