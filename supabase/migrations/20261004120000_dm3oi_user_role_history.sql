begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.user_role_history (
  id uuid primary key default gen_random_uuid(),

  scope text not null
    check (scope in ('ORGANIZATION', 'PLATFORM')),

  event_type text not null
    check (event_type in ('BASELINE', 'ASSIGNED', 'CHANGED', 'REMOVED')),

  subject_user_id uuid not null,

  organization_id uuid,
  membership_id uuid,

  prior_role public.application_role,
  new_role public.application_role,

  subject_display_name text,
  subject_email text,
  organization_name text,

  actor_user_id uuid,
  actor_display_name text,
  actor_email text,

  source text not null
    check (
      source in (
        'TRACKING_BASELINE',
        'ORGANIZATION_MEMBERS',
        'PLATFORM_USER_ROLES'
      )
    ),

  created_at timestamptz not null default now(),

  constraint user_role_history_scope_shape_check
    check (
      (
        scope = 'ORGANIZATION'
        and organization_id is not null
        and membership_id is not null
        and coalesce(prior_role, new_role) in (
          'BUSINESS_OWNER',
          'BUSINESS_ADMIN',
          'STAFF_MANAGER',
          'STAFF_USER'
        )
      )
      or
      (
        scope = 'PLATFORM'
        and organization_id is null
        and membership_id is null
        and coalesce(prior_role, new_role) = 'SUPER_ADMIN'
      )
    ),

  constraint user_role_history_event_shape_check
    check (
      (event_type = 'BASELINE' and prior_role is null and new_role is not null)
      or
      (event_type = 'ASSIGNED' and prior_role is null and new_role is not null)
      or
      (
        event_type = 'CHANGED'
        and prior_role is not null
        and new_role is not null
        and prior_role is distinct from new_role
      )
      or
      (event_type = 'REMOVED' and prior_role is not null and new_role is null)
    ),

  constraint user_role_history_subject_name_length_check
    check (
      subject_display_name is null
      or char_length(subject_display_name) <= 240
    ),

  constraint user_role_history_subject_email_length_check
    check (
      subject_email is null
      or char_length(subject_email) <= 320
    ),

  constraint user_role_history_organization_name_length_check
    check (
      organization_name is null
      or char_length(organization_name) <= 240
    ),

  constraint user_role_history_actor_name_length_check
    check (
      actor_display_name is null
      or char_length(actor_display_name) <= 240
    ),

  constraint user_role_history_actor_email_length_check
    check (
      actor_email is null
      or char_length(actor_email) <= 320
    )
);

create index user_role_history_subject_idx
  on public.user_role_history (
    subject_user_id,
    created_at desc,
    id desc
  );

create index user_role_history_membership_idx
  on public.user_role_history (
    membership_id,
    created_at desc,
    id desc
  )
  where membership_id is not null;

create index user_role_history_organization_idx
  on public.user_role_history (
    organization_id,
    created_at desc,
    id desc
  )
  where organization_id is not null;

alter table public.user_role_history enable row level security;
alter table public.user_role_history force row level security;

revoke all
on table public.user_role_history
from public, anon, authenticated, service_role;

grant select
on table public.user_role_history
to authenticated;

create policy user_role_history_read
on public.user_role_history
for select
to authenticated
using (
  public.is_super_admin()
  or (
    scope = 'ORGANIZATION'
    and exists (
      select 1
      from public.organization_members actor_membership
      where actor_membership.organization_id =
        user_role_history.organization_id
        and actor_membership.user_id = auth.uid()
        and actor_membership.is_active
        and actor_membership.status = 'ACTIVE'
        and actor_membership.role in (
          'BUSINESS_OWNER',
          'BUSINESS_ADMIN'
        )
    )
  )
);

create or replace function public.snapshot_role_history_profile(
  target_user_id uuid
)
returns table (
  display_name text,
  email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    left(
      coalesce(
        nullif(btrim(p.display_name), ''),
        nullif(
          btrim(
            concat_ws(
              ' ',
              nullif(btrim(p.first_name), ''),
              nullif(btrim(p.last_name), '')
            )
          ),
          ''
        ),
        nullif(btrim(p.email), '')
      ),
      240
    ) as display_name,
    left(nullif(btrim(p.email), ''), 320) as email
  from public.profiles p
  where p.id = target_user_id;
$$;

revoke all
on function public.snapshot_role_history_profile(uuid)
from public, anon, authenticated, service_role;

create or replace function public.audit_organization_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_organization_id uuid;
  target_membership_id uuid;

  old_role public.application_role;
  next_role public.application_role;
  target_event text;

  subject_name text;
  subject_email_value text;
  actor_name text;
  actor_email_value text;
  organization_name_value text;

  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    target_user_id := new.user_id;
    target_organization_id := new.organization_id;
    target_membership_id := new.id;
    old_role := null;
    next_role := new.role;
    target_event := 'ASSIGNED';

  elsif tg_op = 'UPDATE' then
    if old.role is not distinct from new.role then
      return new;
    end if;

    target_user_id := new.user_id;
    target_organization_id := new.organization_id;
    target_membership_id := new.id;
    old_role := old.role;
    next_role := new.role;
    target_event := 'CHANGED';

  elsif tg_op = 'DELETE' then
    target_user_id := old.user_id;
    target_organization_id := old.organization_id;
    target_membership_id := old.id;
    old_role := old.role;
    next_role := null;
    target_event := 'REMOVED';

  else
    raise exception 'unsupported organization role audit operation';
  end if;

  select profile.display_name, profile.email
  into subject_name, subject_email_value
  from public.snapshot_role_history_profile(target_user_id) profile;

  if actor is not null then
    select profile.display_name, profile.email
    into actor_name, actor_email_value
    from public.snapshot_role_history_profile(actor) profile;
  end if;

  select left(o.name, 240)
  into organization_name_value
  from public.organizations o
  where o.id = target_organization_id;

  insert into public.user_role_history (
    scope,
    event_type,
    subject_user_id,
    organization_id,
    membership_id,
    prior_role,
    new_role,
    subject_display_name,
    subject_email,
    organization_name,
    actor_user_id,
    actor_display_name,
    actor_email,
    source
  )
  values (
    'ORGANIZATION',
    target_event,
    target_user_id,
    target_organization_id,
    target_membership_id,
    old_role,
    next_role,
    subject_name,
    subject_email_value,
    organization_name_value,
    actor,
    actor_name,
    actor_email_value,
    'ORGANIZATION_MEMBERS'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all
on function public.audit_organization_member_role()
from public, anon, authenticated, service_role;

create trigger organization_members_role_history
after insert or update of role or delete
on public.organization_members
for each row
execute function public.audit_organization_member_role();

create or replace function public.audit_platform_user_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  old_role public.application_role;
  next_role public.application_role;
  target_event text;

  subject_name text;
  subject_email_value text;
  actor_name text;
  actor_email_value text;

  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if not new.is_active then
      return new;
    end if;

    target_user_id := new.user_id;
    old_role := null;
    next_role := new.role;
    target_event := 'ASSIGNED';

  elsif tg_op = 'UPDATE' then
    if old.role is distinct from new.role
       and old.is_active
       and new.is_active
    then
      target_user_id := new.user_id;
      old_role := old.role;
      next_role := new.role;
      target_event := 'CHANGED';

    elsif not old.is_active and new.is_active then
      target_user_id := new.user_id;
      old_role := null;
      next_role := new.role;
      target_event := 'ASSIGNED';

    elsif old.is_active and not new.is_active then
      target_user_id := old.user_id;
      old_role := old.role;
      next_role := null;
      target_event := 'REMOVED';

    else
      return new;
    end if;

  elsif tg_op = 'DELETE' then
    if not old.is_active then
      return old;
    end if;

    target_user_id := old.user_id;
    old_role := old.role;
    next_role := null;
    target_event := 'REMOVED';

  else
    raise exception 'unsupported platform role audit operation';
  end if;

  select profile.display_name, profile.email
  into subject_name, subject_email_value
  from public.snapshot_role_history_profile(target_user_id) profile;

  if actor is not null then
    select profile.display_name, profile.email
    into actor_name, actor_email_value
    from public.snapshot_role_history_profile(actor) profile;
  end if;

  insert into public.user_role_history (
    scope,
    event_type,
    subject_user_id,
    prior_role,
    new_role,
    subject_display_name,
    subject_email,
    actor_user_id,
    actor_display_name,
    actor_email,
    source
  )
  values (
    'PLATFORM',
    target_event,
    target_user_id,
    old_role,
    next_role,
    subject_name,
    subject_email_value,
    actor,
    actor_name,
    actor_email_value,
    'PLATFORM_USER_ROLES'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all
on function public.audit_platform_user_role()
from public, anon, authenticated, service_role;

create trigger platform_user_roles_role_history
after insert or update of role, is_active or delete
on public.platform_user_roles
for each row
execute function public.audit_platform_user_role();

insert into public.user_role_history (
  scope,
  event_type,
  subject_user_id,
  organization_id,
  membership_id,
  new_role,
  subject_display_name,
  subject_email,
  organization_name,
  source,
  created_at
)
select
  'ORGANIZATION',
  'BASELINE',
  membership.user_id,
  membership.organization_id,
  membership.id,
  membership.role,
  left(
    coalesce(
      nullif(btrim(profile.display_name), ''),
      nullif(
        btrim(
          concat_ws(
            ' ',
            nullif(btrim(profile.first_name), ''),
            nullif(btrim(profile.last_name), '')
          )
        ),
        ''
      ),
      nullif(btrim(profile.email), '')
    ),
    240
  ),
  left(nullif(btrim(profile.email), ''), 320),
  left(organization.name, 240),
  'TRACKING_BASELINE',
  now()
from public.organization_members membership
left join public.profiles profile
  on profile.id = membership.user_id
left join public.organizations organization
  on organization.id = membership.organization_id;

insert into public.user_role_history (
  scope,
  event_type,
  subject_user_id,
  new_role,
  subject_display_name,
  subject_email,
  source,
  created_at
)
select
  'PLATFORM',
  'BASELINE',
  role_row.user_id,
  role_row.role,
  left(
    coalesce(
      nullif(btrim(profile.display_name), ''),
      nullif(
        btrim(
          concat_ws(
            ' ',
            nullif(btrim(profile.first_name), ''),
            nullif(btrim(profile.last_name), '')
          )
        ),
        ''
      ),
      nullif(btrim(profile.email), '')
    ),
    240
  ),
  left(nullif(btrim(profile.email), ''), 320),
  'TRACKING_BASELINE',
  now()
from public.platform_user_roles role_row
left join public.profiles profile
  on profile.id = role_row.user_id
where role_row.is_active;

commit;
