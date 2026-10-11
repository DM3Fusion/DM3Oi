begin;

-- ============================================================
-- DM3Oi Platform Support — Submitter Tracking
--
-- Authenticated organization users may review only support
-- requests they personally submitted for their active
-- organization. This is read-only submitter access.
-- ============================================================

create or replace function public.get_my_platform_support_requests(
  target_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  organization_row public.organizations;
  member_row public.organization_members;
  profile_row public.profiles;
begin
  if actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select *
  into organization_row
  from public.organizations
  where id = target_organization_id
    and status = 'ACTIVE';

  if organization_row.id is null then
    raise exception 'Organization unavailable'
      using errcode = '42501';
  end if;

  select *
  into member_row
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = actor_id
    and is_active
    and role in (
      'BUSINESS_OWNER',
      'BUSINESS_ADMIN',
      'STAFF_MANAGER',
      'STAFF_USER'
    );

  if member_row.id is null then
    raise exception 'Organization access denied'
      using errcode = '42501';
  end if;

  select *
  into profile_row
  from public.profiles
  where id = actor_id
    and is_active;

  if profile_row.id is null then
    raise exception 'Active user profile required'
      using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', request.id,
          'organization_id', request.organization_id,
          'organization_name', request.organization_name,
          'category', request.category,
          'subject', request.subject,
          'message', request.message,
          'status', request.status,
          'created_at', request.created_at,
          'updated_at', request.updated_at,
          'responded_at', request.responded_at,
          'closed_at', request.closed_at
        )
        order by request.updated_at desc, request.id desc
      )
      from public.platform_support_requests request
      where request.organization_id = target_organization_id
        and request.submitted_by_user_id = actor_id
    ),
    '[]'::jsonb
  );
end;
$$;


create or replace function public.get_my_platform_support_request(
  target_organization_id uuid,
  target_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  organization_row public.organizations;
  member_row public.organization_members;
  profile_row public.profiles;
  request_row public.platform_support_requests;
  messages jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select *
  into organization_row
  from public.organizations
  where id = target_organization_id
    and status = 'ACTIVE';

  if organization_row.id is null then
    raise exception 'Organization unavailable'
      using errcode = '42501';
  end if;

  select *
  into member_row
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = actor_id
    and is_active
    and role in (
      'BUSINESS_OWNER',
      'BUSINESS_ADMIN',
      'STAFF_MANAGER',
      'STAFF_USER'
    );

  if member_row.id is null then
    raise exception 'Organization access denied'
      using errcode = '42501';
  end if;

  select *
  into profile_row
  from public.profiles
  where id = actor_id
    and is_active;

  if profile_row.id is null then
    raise exception 'Active user profile required'
      using errcode = '42501';
  end if;

  select *
  into request_row
  from public.platform_support_requests
  where id = target_request_id
    and organization_id = target_organization_id
    and submitted_by_user_id = actor_id;

  if request_row.id is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', message.id,
        'sender_type', message.sender_type,
        'sender_name', message.sender_name,
        'body', message.body,
        'created_at', message.created_at
      )
      order by message.created_at, message.id
    ),
    '[]'::jsonb
  )
  into messages
  from public.platform_support_messages message
  where message.request_id = request_row.id;

  return jsonb_build_object(
    'id', request_row.id,
    'organization_id', request_row.organization_id,
    'organization_name', request_row.organization_name,
    'category', request_row.category,
    'subject', request_row.subject,
    'message', request_row.message,
    'status', request_row.status,
    'created_at', request_row.created_at,
    'updated_at', request_row.updated_at,
    'responded_at', request_row.responded_at,
    'closed_at', request_row.closed_at,
    'messages', messages
  );
end;
$$;


revoke all
on function public.get_my_platform_support_requests(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.get_my_platform_support_requests(uuid)
to authenticated;


revoke all
on function public.get_my_platform_support_request(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.get_my_platform_support_request(uuid, uuid)
to authenticated;


comment on function public.get_my_platform_support_requests(uuid) is
  'Returns platform support requests personally submitted by the authenticated organization user.';

comment on function public.get_my_platform_support_request(uuid, uuid) is
  'Returns one platform support request and conversation only when personally submitted by the authenticated organization user.';

notify pgrst, 'reload schema';

commit;
