begin;

delete from public.organization_membership_events
where organization_id = 'a00d4c4d-cb93-4173-a8f6-ec4f47353db8'::uuid
  and membership_id = '55668646-7fcb-44df-8a89-b1c2dbd825e2'::uuid
  and user_id = '414c45fd-dcc9-4fc8-af1d-b49131ce737e'::uuid;

delete from public.organization_members
where id = '55668646-7fcb-44df-8a89-b1c2dbd825e2'::uuid
  and organization_id = 'a00d4c4d-cb93-4173-a8f6-ec4f47353db8'::uuid
  and user_id = '414c45fd-dcc9-4fc8-af1d-b49131ce737e'::uuid;

do $$
declare
  duplicate_record record;
begin
  select
    m.user_id,
    p.email,
    count(distinct m.organization_id) as organization_count
  into duplicate_record
  from public.organization_members m
  join public.profiles p
    on p.id = m.user_id
  group by m.user_id, p.email
  having count(distinct m.organization_id) > 1
  order by count(distinct m.organization_id) desc
  limit 1;

  if found then
    raise exception
      'cannot enforce single-organization identity: user % (%) belongs to % organizations',
      duplicate_record.user_id,
      coalesce(duplicate_record.email, 'no email'),
      duplicate_record.organization_count
      using errcode = '23514';
  end if;
end
$$;

create or replace function public.enforce_single_organization_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.organization_members m
    where m.user_id = new.user_id
      and m.organization_id <> new.organization_id
  ) then
    raise exception
      'user identity already belongs to another organization'
      using errcode = '23505';
  end if;

  return new;
end
$$;

create trigger organization_members_single_organization_identity
before insert or update of user_id, organization_id
on public.organization_members
for each row
execute function public.enforce_single_organization_identity();

create unique index organization_members_one_organization_per_user_uidx
  on public.organization_members(user_id);

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

create or replace function public.convert_trial_request_to_organization(
  target_trial_request_id uuid,
  target_organization_name text,
  target_organization_slug text,
  target_conversion_note text,
  target_owner_user_id uuid,
  target_owner_email text,
  target_owner_identity_verified boolean
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  item public.trial_requests;
  owner_profile public.profiles;
  created public.organizations;
  membership public.organization_members;
  normalized_name text;
  normalized_slug text;
  normalized_note text;
begin
  if actor is null
     or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  normalized_name :=
    trim(coalesce(target_organization_name, ''));

  normalized_slug :=
    trim(coalesce(target_organization_slug, ''));

  normalized_note :=
    trim(coalesce(target_conversion_note, ''));

  if char_length(normalized_name) = 0
     or char_length(normalized_name) > 160 then
    raise exception 'invalid organization name'
      using errcode = '22023';
  end if;

  if normalized_slug = ''
     or normalized_slug <> lower(normalized_slug)
     or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid organization slug'
      using errcode = '22023';
  end if;

  if char_length(normalized_note) = 0
     or char_length(normalized_note) > 1000 then
    raise exception 'conversion note required'
      using errcode = '22023';
  end if;

  if target_owner_user_id is null then
    raise exception 'initial business owner required'
      using errcode = '22023';
  end if;

  select *
  into item
  from public.trial_requests
  where id = target_trial_request_id
  for update;

  if not found then
    raise exception 'trial request not found'
      using errcode = 'P0002';
  end if;

  if item.status = 'CONVERTED' then
    raise exception 'trial request already converted'
      using errcode = '23514';
  end if;

  if item.status <> 'QUALIFIED' then
    raise exception 'trial request must be qualified before conversion'
      using errcode = '23514';
  end if;

  if item.workflow_fit is distinct from 'FIT'
     or item.qualification_reviewed_at is null
     or item.qualification_reviewed_by is null then
    raise exception 'qualification review must be completed with workflow fit before conversion'
      using errcode = '23514';
  end if;

  if item.converted_organization_id is not null
     or item.converted_at is not null then
    raise exception 'trial request has existing conversion data'
      using errcode = '23514';
  end if;

  select *
  into owner_profile
  from public.profiles
  where id = target_owner_user_id
    and is_active;

  if not found then
    raise exception 'initial business owner profile not found'
      using errcode = 'P0002';
  end if;

  if lower(trim(owner_profile.email)) <>
     lower(trim(coalesce(target_owner_email, ''))) then
    raise exception 'initial business owner profile does not match owner email'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.platform_user_roles
    where user_id = target_owner_user_id
      and role = 'SUPER_ADMIN'
      and is_active
  ) then
    raise exception 'platform administrator cannot be initial business owner'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.organization_members
    where user_id = target_owner_user_id
  ) then
    raise exception
      'user identity already belongs to another organization'
      using errcode = '23505';
  end if;

  begin
    insert into public.organizations (
      name,
      slug,
      status
    )
    values (
      normalized_name,
      normalized_slug,
      'ACTIVE'
    )
    returning * into created;
  exception
    when unique_violation then
      raise exception 'organization slug already exists'
        using errcode = '23505';
  end;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    invited_at,
    verified_at
  )
  values (
    created.id,
    target_owner_user_id,
    'BUSINESS_OWNER',
    case
      when target_owner_identity_verified then
        'VERIFIED'::public.organization_membership_status
      else
        'INVITED'::public.organization_membership_status
    end,
    now(),
    case
      when target_owner_identity_verified then now()
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
  values (
    created.id,
    membership.id,
    target_owner_user_id,
    owner_profile.email,
    owner_profile.display_name,
    'BUSINESS_OWNER',
    actor,
    case
      when target_owner_identity_verified then 'VERIFIED'
      else 'INVITED'
    end,
    null,
    membership.status,
    case
      when target_owner_identity_verified then
        'Verified identity provisioned as initial Business Owner during Trial Request conversion.'
      else
        'Initial Business Owner invitation created during Trial Request conversion.'
    end
  );

  insert into public.trial_request_status_history (
    trial_request_id,
    prior_status,
    resulting_status,
    review_note,
    actor_user_id
  )
  values (
    item.id,
    item.status,
    'CONVERTED',
    normalized_note,
    actor
  );

  update public.trial_requests
  set
    status = 'CONVERTED',
    converted_at = now(),
    converted_organization_id = created.id
  where id = item.id;

  return created;
end;
$$;

commit;
