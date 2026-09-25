-- A platform role is effective only while its corresponding application profile is active.
create or replace function public.is_super_admin(
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = check_user_id
      and r.role = 'SUPER_ADMIN'
      and r.is_active
      and p.is_active
  )
$$;

-- Function replacement can inherit default PUBLIC execution. Re-establish the
-- intended application-only posture explicitly.
revoke all on function public.is_super_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_super_admin(uuid) to authenticated;

-- These authenticated security-definer entry points predate the centralized
-- profile-active gate and formerly repeated only the role-row portion of it.
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
  if actor is null or not public.is_super_admin(actor) then
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

revoke all on function public.publish_public_landing_page() from public, anon, authenticated;
grant execute on function public.publish_public_landing_page() to authenticated;

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
  if actor is null or not public.is_super_admin(actor) then
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

revoke all on function public.revert_public_landing_page(integer) from public, anon, authenticated;
grant execute on function public.revert_public_landing_page(integer) to authenticated;
