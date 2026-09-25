begin;

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
  trial_started_at timestamptz := now();
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

  insert into public.organization_licenses (
    organization_id,
    license_status,
    commercial_state,
    plan_code,
    starts_at,
    expires_at,
    grace_ends_at,
    notes,
    created_by,
    updated_by
  )
  values (
    created.id,
    'TRIAL',
    'TRIAL',
    'STANDARD',
    trial_started_at,
    trial_started_at + interval '30 days',
    null,
    '30-day trial created during Trial Request conversion.',
    actor,
    actor
  );

  insert into public.organization_license_events (
    organization_id,
    license_id,
    event_type,
    prior_values,
    resulting_values,
    reason,
    actor_user_id
  )
  select
    license.organization_id,
    license.id,
    'TRIAL_STARTED',
    '{}'::jsonb,
    to_jsonb(license),
    '30-day trial created during Trial Request conversion.',
    actor
  from public.organization_licenses license
  where license.organization_id = created.id
    and license.is_current;

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

insert into public.organization_licenses (
  organization_id,
  license_status,
  commercial_state,
  plan_code,
  starts_at,
  expires_at,
  grace_ends_at,
  notes,
  created_at,
  created_by,
  updated_at,
  updated_by
)
select
  organization.id,
  'TRIAL',
  'TRIAL',
  'STANDARD',
  trial.converted_at,
  trial.converted_at + interval '30 days',
  null,
  '30-day trial backfilled from Trial Request conversion.',
  trial.converted_at,
  trial.qualification_reviewed_by,
  now(),
  trial.qualification_reviewed_by
from public.trial_requests trial
join public.organizations organization
  on organization.id = trial.converted_organization_id
where trial.status = 'CONVERTED'
  and trial.converted_at is not null
  and not exists (
    select 1
    from public.organization_licenses existing
    where existing.organization_id = organization.id
      and existing.is_current
  );

insert into public.organization_license_events (
  organization_id,
  license_id,
  event_type,
  prior_values,
  resulting_values,
  reason,
  actor_user_id,
  created_at
)
select
  license.organization_id,
  license.id,
  'TRIAL_STARTED',
  '{}'::jsonb,
  to_jsonb(license),
  '30-day trial backfilled from Trial Request conversion.',
  license.created_by,
  license.starts_at
from public.organization_licenses license
join public.trial_requests trial
  on trial.converted_organization_id = license.organization_id
where trial.status = 'CONVERTED'
  and license.is_current
  and license.license_status = 'TRIAL'
  and license.commercial_state = 'TRIAL'
  and license.plan_code = 'STANDARD'
  and license.starts_at = trial.converted_at
  and not exists (
    select 1
    from public.organization_license_events event
    where event.license_id = license.id
      and event.event_type = 'TRIAL_STARTED'
  );

commit;
