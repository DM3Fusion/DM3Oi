begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Prepare an organization invitation without granting active access. Delivery
-- remains responsible for recording INVITED/INVITATION_RESENT events only
-- after the invitation message has been sent successfully.
create or replace function public.prepare_organization_membership_invitation(
  organization_id uuid,
  user_id uuid,
  role public.application_role
)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.application_role;
  membership public.organization_members;
begin
  if actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if $1 is null or $2 is null then
    raise exception 'organization and user are required' using errcode = '22023';
  end if;

  if $3 is null
     or $3 not in ('BUSINESS_ADMIN', 'STAFF_MANAGER', 'STAFF_USER') then
    raise exception 'invalid organization invitation role' using errcode = '22023';
  end if;

  select member.role
  into actor_role
  from public.organization_members member
  join public.profiles profile
    on profile.id = member.user_id
  join public.organizations organization
    on organization.id = member.organization_id
  where member.organization_id = $1
    and member.user_id = actor
    and member.status = 'ACTIVE'
    and member.is_active
    and profile.is_active
    and organization.status = 'ACTIVE'
  for share of member, profile, organization;

  if actor_role is null
     or not public.has_effective_organization_permission($1, 'MANAGE_USERS') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if actor_role = 'BUSINESS_OWNER' then
    if $3 not in ('BUSINESS_ADMIN', 'STAFF_MANAGER', 'STAFF_USER') then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  elsif actor_role = 'BUSINESS_ADMIN' then
    if $3 not in ('STAFF_MANAGER', 'STAFF_USER') then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  else
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Serialize invitation preparation for one target identity. The unique
  -- organization-membership constraints remain the final concurrent guard.
  perform pg_advisory_xact_lock(
    hashtextextended('organization-membership-invitation:' || $2::text, 0)
  );

  perform 1
  from public.profiles profile
  where profile.id = $2
    and profile.is_active
  for share;

  if not found then
    raise exception 'active target profile not found' using errcode = 'P0002';
  end if;

  if public.is_super_admin($2)
     or exists (
       select 1
       from public.platform_user_roles platform_role
       where platform_role.user_id = $2
         and platform_role.role = 'SUPER_ADMIN'
         and platform_role.is_active
     ) then
    raise exception 'protected platform identity cannot be invited'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.customer_portal_users portal_link
    where portal_link.user_id = $2
      and portal_link.is_active
  ) then
    raise exception 'customer portal identity cannot be invited'
      using errcode = '23514';
  end if;

  select member.*
  into membership
  from public.organization_members member
  where member.user_id = $2
  for update;

  if found and membership.organization_id <> $1 then
    raise exception 'user identity already belongs to another organization'
      using errcode = '23505';
  end if;

  if found then
    if membership.status <> 'INVITED' then
      raise exception 'existing membership cannot be invited again'
        using errcode = '23514';
    end if;

    update public.organization_members member
    set
      role = $3,
      status = 'INVITED',
      is_active = false,
      verified_at = null,
      suspended_at = null,
      revoked_at = null,
      updated_at = now()
    where member.id = membership.id
    returning member.* into membership;

    return membership;
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    is_active,
    verified_at
  )
  values ($1, $2, $3, 'INVITED', false, null)
  returning * into membership;

  return membership;
end
$$;

alter function public.prepare_organization_membership_invitation(
  uuid,
  uuid,
  public.application_role
) owner to postgres;

revoke all
on function public.prepare_organization_membership_invitation(
  uuid,
  uuid,
  public.application_role
)
from public, anon, authenticated, service_role;

grant execute
on function public.prepare_organization_membership_invitation(
  uuid,
  uuid,
  public.application_role
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
  actor_role public.application_role;
  actor_is_super_admin boolean;
  changed public.organization_members;
begin
  if actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_membership_id is null
     or target_active is null
     or target_role is null
     or target_role not in (
       'BUSINESS_ADMIN',
       'BUSINESS_OWNER',
       'STAFF_MANAGER',
       'STAFF_USER'
     ) then
    raise exception 'invalid organization membership update'
      using errcode = '22023';
  end if;

  actor_is_super_admin := public.is_super_admin(actor);

  select member.*
  into changed
  from public.organization_members member
  where member.id = target_membership_id
  for update;

  if not found then
    if not actor_is_super_admin then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if not actor_is_super_admin then
    select member.role
    into actor_role
    from public.organization_members member
    join public.profiles profile
      on profile.id = member.user_id
    join public.organizations organization
      on organization.id = member.organization_id
    where member.organization_id = changed.organization_id
      and member.user_id = actor
      and member.status = 'ACTIVE'
      and member.is_active
      and profile.is_active
      and organization.status = 'ACTIVE'
    for share of member, profile, organization;

    if actor_role is null
       or not public.has_effective_organization_permission(
         changed.organization_id,
         'MANAGE_USERS'
       ) then
      raise exception 'not authorized' using errcode = '42501';
    end if;

    if changed.user_id = actor then
      raise exception 'not authorized' using errcode = '42501';
    end if;

    if actor_role = 'BUSINESS_OWNER' then
      if changed.role = 'BUSINESS_OWNER'
         or target_role = 'BUSINESS_OWNER' then
        raise exception 'not authorized' using errcode = '42501';
      end if;
    elsif actor_role = 'BUSINESS_ADMIN' then
      if changed.role not in ('STAFF_MANAGER', 'STAFF_USER')
         or target_role not in ('STAFF_MANAGER', 'STAFF_USER') then
        raise exception 'not authorized' using errcode = '42501';
      end if;
    else
      raise exception 'not authorized' using errcode = '42501';
    end if;
  end if;

  if changed.role not in (
    'BUSINESS_ADMIN',
    'BUSINESS_OWNER',
    'STAFF_MANAGER',
    'STAFF_USER'
  ) then
    raise exception 'invalid current organization role' using errcode = '23514';
  end if;

  if target_active <> changed.is_active then
    raise exception
      'Membership access state must be changed through the lifecycle action'
      using errcode = '22023';
  end if;

  update public.organization_members member
  set
    role = target_role,
    updated_at = now()
  where member.id = changed.id
  returning member.* into changed;

  return changed;
end
$$;

alter function public.update_organization_membership(
  uuid,
  public.application_role,
  boolean
) owner to postgres;

revoke all
on function public.update_organization_membership(
  uuid,
  public.application_role,
  boolean
)
from public, anon, authenticated, service_role;

grant execute
on function public.update_organization_membership(
  uuid,
  public.application_role,
  boolean
)
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

  if target_membership_id is null
     or action_name is null
     or action_name not in (
       'ACTIVATE', 'SUSPEND', 'REACTIVATE', 'REVOKE', 'REINSTATE'
     ) then
    raise exception 'invalid membership lifecycle action'
      using errcode = '22023';
  end if;

  select member.*
  into membership
  from public.organization_members member
  where member.id = target_membership_id
  for update;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if public.is_super_admin(actor) then
    null;
  else
    select member.role
    into actor_role
    from public.organization_members member
    join public.profiles profile
      on profile.id = member.user_id
    join public.organizations organization
      on organization.id = member.organization_id
    where member.organization_id = membership.organization_id
      and member.user_id = actor
      and member.is_active
      and member.status = 'ACTIVE'
      and profile.is_active
      and organization.status = 'ACTIVE'
    for share of member, profile, organization;

    if actor_role is null
       or not public.has_effective_organization_permission(
         membership.organization_id,
         'MANAGE_USERS'
       ) then
      raise exception 'not authorized' using errcode = '42501';
    end if;

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
  end case;

  update public.organization_members member
  set
    status = next_status,
    activated_at = membership.activated_at,
    suspended_at = membership.suspended_at,
    revoked_at = membership.revoked_at,
    updated_at = now()
  where member.id = membership.id;

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
    profile.email,
    profile.display_name,
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
  from public.profiles profile
  where profile.id = membership.user_id;

  return next_status;
end
$$;

alter function public.transition_organization_membership(uuid, text)
owner to postgres;

revoke all
on function public.transition_organization_membership(uuid, text)
from public, anon, authenticated, service_role;

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

  if target_membership_id is null
     or target_event_type is null
     or target_event_type not in ('INVITED', 'VERIFIED', 'INVITATION_RESENT') then
    raise exception 'invalid invitation event' using errcode = '22023';
  end if;

  select member.*
  into membership
  from public.organization_members member
  where member.id = target_membership_id
  for share;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if not public.is_super_admin(actor) then
    select member.role
    into actor_role
    from public.organization_members member
    join public.profiles actor_profile
      on actor_profile.id = member.user_id
    join public.organizations organization
      on organization.id = member.organization_id
    where member.organization_id = membership.organization_id
      and member.user_id = actor
      and member.is_active
      and member.status = 'ACTIVE'
      and actor_profile.is_active
      and organization.status = 'ACTIVE'
    for share of member, actor_profile, organization;

    if actor_role is null
       or not public.has_effective_organization_permission(
         membership.organization_id,
         'MANAGE_USERS'
       ) then
      raise exception 'not authorized' using errcode = '42501';
    end if;

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

  select target_profile.*
  into profile
  from public.profiles target_profile
  where target_profile.id = membership.user_id
  for share;

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

alter function public.record_organization_membership_invitation_event(uuid, text)
owner to postgres;

revoke all
on function public.record_organization_membership_invitation_event(uuid, text)
from public, anon, authenticated, service_role;

grant execute
on function public.record_organization_membership_invitation_event(uuid, text)
to authenticated;

commit;
