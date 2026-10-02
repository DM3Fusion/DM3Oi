create or replace function public.get_my_access_context(
  target_organization_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  profile_row public.profiles%rowtype;
  super_admin boolean := false;
  organizations_json jsonb := '[]'::jsonb;
  active_organization_id uuid := null;
  active_role public.application_role := null;
  permission_overrides_json jsonb := '[]'::jsonb;
  license_json jsonb := null;
  customer_portal_ids_json jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    return null;
  end if;

  select *
  into profile_row
  from public.profiles
  where id = actor_id;

  if profile_row.id is null or profile_row.is_active is not true then
    return null;
  end if;

  select public.is_super_admin(actor_id)
  into super_admin;

  if super_admin then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'slug', o.slug,
          'avatar_path', o.avatar_path,
          'avatar_updated_at', o.avatar_updated_at,
          'role', 'SUPER_ADMIN'
        )
        order by o.name
      ),
      '[]'::jsonb
    )
    into organizations_json
    from public.organizations o
    where o.status = 'ACTIVE';

    if target_organization_id is not null
       and exists (
         select 1
         from public.organizations o
         where o.id = target_organization_id
           and o.status = 'ACTIVE'
       )
    then
      active_organization_id := target_organization_id;
      active_role := 'SUPER_ADMIN';
    end if;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'slug', o.slug,
          'avatar_path', o.avatar_path,
          'avatar_updated_at', o.avatar_updated_at,
          'role', m.role
        )
        order by o.name
      ),
      '[]'::jsonb
    )
    into organizations_json
    from public.organization_members m
    join public.organizations o
      on o.id = m.organization_id
    where m.user_id = actor_id
      and m.is_active
      and o.status = 'ACTIVE';

    select
      m.organization_id,
      m.role
    into
      active_organization_id,
      active_role
    from public.organization_members m
    join public.organizations o
      on o.id = m.organization_id
    where m.user_id = actor_id
      and m.is_active
      and o.status = 'ACTIVE'
      and (
        target_organization_id is null
        or m.organization_id = target_organization_id
      )
    order by
      case
        when target_organization_id is not null
         and m.organization_id = target_organization_id
        then 0
        else 1
      end,
      o.name
    limit 1;

    if active_organization_id is null then
      select
        m.organization_id,
        m.role
      into
        active_organization_id,
        active_role
      from public.organization_members m
      join public.organizations o
        on o.id = m.organization_id
      where m.user_id = actor_id
        and m.is_active
        and o.status = 'ACTIVE'
      order by o.name
      limit 1;
    end if;
  end if;

  if active_organization_id is not null
     and active_role is not null
     and active_role <> 'SUPER_ADMIN'
  then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'role', p.role,
          'permission', p.permission,
          'is_allowed', p.is_allowed
        )
        order by p.permission
      ),
      '[]'::jsonb
    )
    into permission_overrides_json
    from public.organization_role_permissions p
    where p.organization_id = active_organization_id
      and p.role = active_role;
  end if;

  if active_organization_id is not null then
    select jsonb_build_object(
      'license_status', l.license_status,
      'commercial_state', l.commercial_state,
      'starts_at', l.starts_at,
      'expires_at', l.expires_at,
      'grace_ends_at', l.grace_ends_at,
      'notice_days', l.notice_days,
      'notification_thresholds', l.notification_thresholds
    )
    into license_json
    from public.organization_licenses l
    where l.organization_id = active_organization_id
      and l.is_current
    limit 1;
  end if;

  select coalesce(
    jsonb_agg(cpu.customer_id order by cpu.customer_id),
    '[]'::jsonb
  )
  into customer_portal_ids_json
  from public.customer_portal_users cpu
  join public.organizations o
    on o.id = cpu.organization_id
  join public.customers c
    on c.id = cpu.customer_id
   and c.organization_id = cpu.organization_id
  left join public.organization_settings s
    on s.organization_id = cpu.organization_id
  where cpu.user_id = actor_id
    and cpu.is_active
    and o.status = 'ACTIVE'
    and c.status = 'ACTIVE'
    and s.portal_enabled is distinct from false;

  return jsonb_build_object(
    'profile',
    jsonb_build_object(
      'id', profile_row.id,
      'display_name', profile_row.display_name,
      'first_name', profile_row.first_name,
      'last_name', profile_row.last_name,
      'email', profile_row.email,
      'title', profile_row.title,
      'avatar_path', profile_row.avatar_path,
      'avatar_updated_at', profile_row.avatar_updated_at,
      'is_active', profile_row.is_active
    ),
    'is_super_admin', super_admin,
    'organizations', organizations_json,
    'active_organization_id', active_organization_id,
    'active_role', active_role,
    'permission_overrides', permission_overrides_json,
    'license', license_json,
    'customer_portal_ids', customer_portal_ids_json
  );
end;
$function$;

revoke all on function public.get_my_access_context(uuid) from public;
revoke all on function public.get_my_access_context(uuid) from anon;
grant execute on function public.get_my_access_context(uuid) to authenticated;
