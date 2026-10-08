-- Preserve visibility of internally created Service Requests for STAFF_USER
-- creators when the request is not assigned to them.
--
-- This changes read visibility only. Management/assignment authority remains
-- governed by can_manage_service_request and effective mutation permissions.

create or replace function public.can_access_service_request(
  target_service_request_id uuid,
  target_organization_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin(target_user_id)
    or exists (
      select 1
      from public.service_requests r
      join public.organization_members m
        on m.organization_id = r.organization_id
       and m.user_id = target_user_id
       and m.is_active
      where r.id = target_service_request_id
        and r.organization_id = target_organization_id
        and (
          m.role in ('BUSINESS_OWNER', 'BUSINESS_ADMIN', 'STAFF_MANAGER')
          or (
            m.role = 'STAFF_USER'
            and (
              r.assigned_user_id = target_user_id
              or r.created_by_user_id = target_user_id
            )
          )
        )
    )
$$;

-- Preserve the existing security boundary: this helper is consumed by RLS
-- and security-barrier views, not called directly by application users.
revoke execute on function public.can_access_service_request(uuid, uuid, uuid)
from public, anon, authenticated;

comment on function public.can_access_service_request(uuid, uuid, uuid) is
  'Determines Service Request read visibility. STAFF_USER may read requests assigned to them or internally created by them; creator visibility does not grant management authority.';
