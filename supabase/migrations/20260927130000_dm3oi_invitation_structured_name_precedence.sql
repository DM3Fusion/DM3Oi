-- Fix PL/pgSQL output-variable ambiguity in invitation verification.
-- Lifecycle semantics remain INVITED -> VERIFIED -> explicit activation.

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
  profile public.profiles;
  auth_identity auth.users;
  verification_event_id uuid;
  metadata_first_name text;
  metadata_last_name text;
  metadata_display_name text;
  repaired_first_name text;
  repaired_last_name text;
  repaired_display_name text;
  pending_membership_count integer;
  recipient record;
begin
  if actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select count(*)
  into pending_membership_count
  from public.organization_members member
  where member.user_id = actor
    and member.status = 'INVITED';
  if pending_membership_count > 1 then
    raise exception 'ambiguous membership invitation' using errcode = '23514';
  end if;

  select member.*
  into membership
  from public.organization_members member
  where member.user_id = actor
    and member.status in ('INVITED', 'VERIFIED')
  order by
    case member.status when 'INVITED' then 0 else 1 end,
    member.invited_at asc nulls last,
    member.created_at asc
  limit 1
  for update;

  if not found then
    return;
  end if;

  -- Identity binding is authoritative and tenant scope comes only from the
  -- locked membership; no organization or user identifier is client supplied.
  if membership.user_id <> actor then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into profile
  from public.profiles
  where id = actor
  for update;
  select * into auth_identity
  from auth.users
  where id = actor;
  if profile.id is null or auth_identity.id is null then
    raise exception 'identity profile not found' using errcode = 'P0002';
  end if;

  metadata_first_name := nullif(trim(auth_identity.raw_user_meta_data ->> 'first_name'), '');
  metadata_last_name := nullif(trim(auth_identity.raw_user_meta_data ->> 'last_name'), '');
  metadata_display_name := nullif(trim(auth_identity.raw_user_meta_data ->> 'display_name'), '');
  repaired_first_name := coalesce(nullif(trim(profile.first_name), ''), metadata_first_name);
  repaired_last_name := coalesce(nullif(trim(profile.last_name), ''), metadata_last_name);

  if nullif(trim(concat_ws(' ', repaired_first_name, repaired_last_name)), '') is not null then
    repaired_display_name := trim(concat_ws(' ', repaired_first_name, repaired_last_name));
  elsif metadata_display_name is not null
        and lower(metadata_display_name) <> lower(trim(profile.email)) then
    repaired_display_name := metadata_display_name;
  elsif nullif(trim(profile.display_name), '') is not null
        and lower(trim(profile.display_name)) <> lower(trim(profile.email)) then
    repaired_display_name := trim(profile.display_name);
  else
    repaired_display_name := profile.display_name;
  end if;

  update public.profiles
  set first_name = repaired_first_name,
      last_name = repaired_last_name,
      display_name = repaired_display_name,
      updated_at = now()
  where id = actor
    and (
      first_name is distinct from repaired_first_name
      or last_name is distinct from repaired_last_name
      or display_name is distinct from repaired_display_name
    );

  if membership.status = 'INVITED' then
    update public.organization_members as member_to_verify
    set status = 'VERIFIED',
        verified_at = coalesce(member_to_verify.verified_at, now()),
        updated_at = now()
    where member_to_verify.id = membership.id
      and member_to_verify.organization_id = membership.organization_id
      and member_to_verify.user_id = actor
      and member_to_verify.status = 'INVITED';

    insert into public.organization_membership_events (
      organization_id, membership_id, user_id, user_email,
      user_display_name, user_role, actor_user_id, event_type,
      prior_status, new_status, note
    ) values (
      membership.organization_id, membership.id, membership.user_id,
      profile.email, repaired_display_name, membership.role, actor, 'VERIFIED',
      'INVITED', 'VERIFIED', 'Invitation account verified.'
    ) returning id into verification_event_id;

    for recipient in
      select manager.user_id
      from public.organization_members manager
      join public.profiles manager_profile
        on manager_profile.id = manager.user_id
       and manager_profile.is_active
      join public.organizations organization
        on organization.id = manager.organization_id
       and organization.status = 'ACTIVE'
      where manager.organization_id = membership.organization_id
        and manager.user_id <> actor
        and manager.is_active
        and manager.status = 'ACTIVE'
        and manager.role in ('BUSINESS_OWNER', 'BUSINESS_ADMIN')
        and not public.is_super_admin(manager.user_id)
        and public.effective_organization_role_permission(
          membership.organization_id,
          manager.role,
          'MANAGE_USERS'
        )
        and (
          (manager.role = 'BUSINESS_OWNER' and membership.role <> 'BUSINESS_OWNER')
          or (
            manager.role = 'BUSINESS_ADMIN'
            and membership.role in ('STAFF_MANAGER', 'STAFF_USER')
          )
        )
    loop
      perform public.create_notification(
        membership.organization_id,
        recipient.user_id,
        'ORGANIZATION_USER_INVITATION_VERIFIED',
        'ORGANIZATION_USER',
        'User invitation accepted — activation required',
        coalesce(nullif(repaired_display_name, ''), profile.email)
          || ' accepted their invitation and is waiting for activation.',
        'ORGANIZATION_MEMBERSHIP',
        membership.id,
        verification_event_id,
        '/users/' || membership.id::text
      );
    end loop;
  end if;

  membership_id := membership.id;
  organization_id := membership.organization_id;
  status := 'VERIFIED';
  return next;
end
$$;

revoke all on function public.verify_my_membership_invitation()
  from public, anon;
grant execute on function public.verify_my_membership_invitation()
  to authenticated;
