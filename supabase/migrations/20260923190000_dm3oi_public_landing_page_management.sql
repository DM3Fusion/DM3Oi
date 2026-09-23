create table if not exists public.public_landing_page_drafts (
  id uuid primary key default gen_random_uuid(),
  page_key text not null unique,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.public_landing_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  version integer not null,
  content jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id),
  unique (page_key, version)
);

create table if not exists public.public_landing_page_publications (
  page_key text primary key,
  version_id uuid not null
    references public.public_landing_page_versions(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.public_landing_page_publication_history (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  action text not null
    check (action in ('BASELINE', 'PUBLISH', 'REVERT')),
  from_version_id uuid
    references public.public_landing_page_versions(id),
  to_version_id uuid not null
    references public.public_landing_page_versions(id),
  acted_by uuid references auth.users(id),
  acted_at timestamptz not null default now(),
  constraint public_landing_page_history_transition_check
    check (
      action = 'BASELINE'
      or from_version_id is distinct from to_version_id
    )
);

create index if not exists public_landing_page_publication_history_page_idx
on public.public_landing_page_publication_history (
  page_key,
  acted_at desc
);

alter table public.public_landing_page_drafts
  enable row level security;

alter table public.public_landing_page_versions
  enable row level security;

alter table public.public_landing_page_publications
  enable row level security;

alter table public.public_landing_page_publication_history
  enable row level security;

revoke all
on table public.public_landing_page_drafts
from anon, authenticated;

revoke all
on table public.public_landing_page_versions
from anon, authenticated;

revoke all
on table public.public_landing_page_publications
from anon, authenticated;

revoke all
on table public.public_landing_page_publication_history
from anon, authenticated;

grant select
on table public.public_landing_page_drafts
to service_role;

grant select, insert, update
on table public.public_landing_page_versions
to service_role;

grant select, insert, update
on table public.public_landing_page_publications
to service_role;

grant select
on table public.public_landing_page_publication_history
to service_role;

insert into public.public_landing_page_drafts (
  page_key,
  content
)
values (
  'HOME',
  jsonb_build_object(
    'seo', jsonb_build_object(
      'title', 'DM3Oi™ | Business Operations Intelligence',
      'description', 'DM3Oi™ brings customer requests, communications, cases, tasks, workflows, and operational insight together in one secure web-based workspace.'
    ),

    'hero', jsonb_build_object(
      'eyebrow', 'Business Operations Intelligence',
      'headlinePrimary', 'People. Work.',
      'headlineSecondary', 'Progress. Intelligence.',
      'lead', 'DM3Oi™ brings customer requests, communications, cases, tasks, workflows, and operational insight together in one secure web-based workspace.',
      'signInLabel', 'Sign In to DM3Oi',
      'trialLabel', 'Request Trial',
      'points', jsonb_build_array(
        'Customer service',
        'Accountable work',
        'Operational intelligence'
      )
    ),

    'features', jsonb_build_object(
      'eyebrow', 'Business workflow',
      'heading', 'Everything you need to keep operational work moving',
      'lead', 'Keep customer requests, communications, cases, tasks, operating rules, and team access organized within one business platform.',
      'workflowImageUrl', '/brand/dm3oi-workflow-panels-baseline.png',
      'items', jsonb_build_array(
        jsonb_build_object(
          'key', 'inbox',
          'title', 'Inbox',
          'description', 'Keep operational communications visible and connected to the work.'
        ),
        jsonb_build_object(
          'key', 'service',
          'title', 'Service Desk',
          'description', 'Receive, assign, track, and resolve customer service requests.'
        ),
        jsonb_build_object(
          'key', 'cases',
          'title', 'Cases',
          'description', 'Organize customer work, responsibility, progress, and history.'
        ),
        jsonb_build_object(
          'key', 'tasks',
          'title', 'Tasks',
          'description', 'Turn operational requirements into clear, accountable work.'
        ),
        jsonb_build_object(
          'key', 'rules',
          'title', 'Questions & Rules',
          'description', 'Use structured questions and rules to guide repeatable workflows.'
        ),
        jsonb_build_object(
          'key', 'secure',
          'title', 'Secure Access',
          'description', 'Use email verification and organization-based workspace access.'
        )
      )
    ),

    'value', jsonb_build_object(
      'eyebrow', 'Business value',
      'heading', 'Keep operational work organized from request to outcome.',
      'lead', 'Give customer service, responsibility, work progress, communication, and operational visibility a consistent place within your organization.',
      'points', jsonb_build_array(
        'Keep customer requests and communications organized',
        'Maintain clear ownership and responsibility',
        'Connect cases, tasks, and service activity',
        'Preserve operational history and progress',
        'Manage access by organization role'
      ),
      'panelEyebrow', 'Organization-based access',
      'panelHeading', 'Business operational information stays within the appropriate workspace.',
      'panelBody', 'DM3Oi combines email verification with organization-based access so users enter the workspace associated with their business role.'
    ),

    'trialRequest', jsonb_build_object(
      'eyebrow', 'Getting Started.',
      'heading', 'See whether DM3Oi fits your operational needs.',
      'body', 'Tell us a little about your organization and operational needs. Your request can be reviewed before a DM3Oi workspace is provisioned.',
      'points', jsonb_build_array(
        'Secure organization workspace',
        'Customer service and operational workflow',
        'Cases, tasks, communications, and intelligence'
      ),
      'formHeading', 'Trial Request',
      'formBody', 'Required fields help us understand the appropriate starting configuration for your organization.',
      'successEyebrow', 'Request Received',
      'successHeading', 'Thank you for your interest in DM3Oi.',
      'successBody', 'Your trial request has been received for review. We will use the information you provided to evaluate the appropriate workspace configuration.',
      'returnLabel', 'Return to DM3Oi'
    ),

    'cta', jsonb_build_object(
      'eyebrow', 'DM3Oi™ Business Operations Intelligence',
      'heading', 'People. Work. Progress. Intelligence.',
      'body', 'Access your organization''s DM3Oi workspace to continue managing operational work.',
      'buttonLabel', 'Sign In to DM3Oi'
    )
  )
)
on conflict (page_key) do nothing;

insert into public.public_landing_page_versions (
  page_key,
  version,
  content
)
select
  'HOME',
  1,
  content
from public.public_landing_page_drafts
where page_key = 'HOME'
  and not exists (
    select 1
    from public.public_landing_page_versions
    where page_key = 'HOME'
  );

insert into public.public_landing_page_publications (
  page_key,
  version_id
)
select
  'HOME',
  id
from public.public_landing_page_versions
where page_key = 'HOME'
  and version = 1
on conflict (page_key) do nothing;

insert into public.public_landing_page_publication_history (
  page_key,
  action,
  from_version_id,
  to_version_id,
  acted_by,
  acted_at
)
select
  p.page_key,
  'BASELINE',
  null,
  p.version_id,
  p.updated_by,
  p.updated_at
from public.public_landing_page_publications p
where p.page_key = 'HOME'
  and not exists (
    select 1
    from public.public_landing_page_publication_history h
    where h.page_key = p.page_key
  );

create or replace function public.publish_public_landing_page()
returns table (
  version_id uuid,
  version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  next_version integer;
  created_id uuid;
  previous_id uuid;
begin
  if actor is null or not exists (
    select 1
    from public.platform_user_roles
    where user_id = actor
      and role = 'SUPER_ADMIN'
      and is_active = true
  ) then
    raise exception 'SUPER_ADMIN access required';
  end if;

  perform 1
  from public.public_landing_page_drafts
  where page_key = 'HOME'
  for update;

  if not found then
    raise exception 'HOME landing-page draft not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('DM3OI_PUBLIC_LANDING_PAGE_HOME')
  );

  select p.version_id
  into previous_id
  from public.public_landing_page_publications p
  where p.page_key = 'HOME'
  for update;

  select coalesce(max(v.version), 0) + 1
  into next_version
  from public.public_landing_page_versions v
  where v.page_key = 'HOME';

  insert into public.public_landing_page_versions (
    page_key,
    version,
    content,
    published_by
  )
  select
    'HOME',
    next_version,
    d.content,
    actor
  from public.public_landing_page_drafts d
  where d.page_key = 'HOME'
  returning id into created_id;

  insert into public.public_landing_page_publications (
    page_key,
    version_id,
    updated_at,
    updated_by
  )
  values (
    'HOME',
    created_id,
    now(),
    actor
  )
  on conflict (page_key)
  do update set
    version_id = excluded.version_id,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  insert into public.public_landing_page_publication_history (
    page_key,
    action,
    from_version_id,
    to_version_id,
    acted_by
  )
  values (
    'HOME',
    'PUBLISH',
    previous_id,
    created_id,
    actor
  );

  return query
  select created_id, next_version;
end;
$$;

revoke all
on function public.publish_public_landing_page()
from public;

grant execute
on function public.publish_public_landing_page()
to authenticated;

create or replace function public.revert_public_landing_page(
  target_version integer
)
returns table (
  version_id uuid,
  version integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  target_id uuid;
  previous_id uuid;
begin
  if actor is null or not exists (
    select 1
    from public.platform_user_roles
    where user_id = actor
      and role = 'SUPER_ADMIN'
      and is_active = true
  ) then
    raise exception 'SUPER_ADMIN access required';
  end if;

  if target_version is null or target_version < 1 then
    raise exception 'Valid landing-page version required';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('DM3OI_PUBLIC_LANDING_PAGE_HOME')
  );

  select p.version_id
  into previous_id
  from public.public_landing_page_publications p
  where p.page_key = 'HOME'
  for update;

  if previous_id is null then
    raise exception 'HOME landing-page publication not found';
  end if;

  select v.id
  into target_id
  from public.public_landing_page_versions v
  where v.page_key = 'HOME'
    and v.version = target_version;

  if target_id is null then
    raise exception 'Landing-page version % not found',
      target_version;
  end if;

  if target_id = previous_id then
    raise exception 'Landing-page version % is already current',
      target_version;
  end if;

  update public.public_landing_page_publications
  set
    version_id = target_id,
    updated_at = now(),
    updated_by = actor
  where page_key = 'HOME';

  insert into public.public_landing_page_publication_history (
    page_key,
    action,
    from_version_id,
    to_version_id,
    acted_by
  )
  values (
    'HOME',
    'REVERT',
    previous_id,
    target_id,
    actor
  );

  return query
  select target_id, target_version;
end;
$$;

revoke all
on function public.revert_public_landing_page(integer)
from public;

grant execute
on function public.revert_public_landing_page(integer)
to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'landing-page-assets',
  'landing-page-assets',
  true,
  5242880,
  array[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists landing_page_assets_public_select
on storage.objects;

create policy landing_page_assets_public_select
on storage.objects
for select
to public
using (
  bucket_id = 'landing-page-assets'
);

drop policy if exists landing_page_assets_super_admin_insert
on storage.objects;

create policy landing_page_assets_super_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'landing-page-assets'
  and public.is_super_admin()
);
