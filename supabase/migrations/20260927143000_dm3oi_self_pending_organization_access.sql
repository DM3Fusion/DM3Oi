-- Expose only the authenticated identity's own pending organization membership.
-- This avoids widening organization_members RLS for inactive INVITED/VERIFIED rows.

create or replace function public.get_my_pending_organization_membership()
returns table (
  membership_id uuid,
  organization_id uuid,
  organization_name text,
  status public.organization_membership_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
  select
    member.id,
    member.organization_id,
    organization.name,
    member.status
  from public.organization_members member
  join public.organizations organization
    on organization.id = member.organization_id
  where member.user_id = actor
    and member.is_active = false
    and member.status in ('INVITED', 'VERIFIED')
    and organization.status = 'ACTIVE'
  order by
    case member.status
      when 'VERIFIED' then 0
      else 1
    end,
    member.invited_at asc nulls last,
    member.created_at asc
  limit 1;
end
$$;

revoke all
on function public.get_my_pending_organization_membership()
from public, anon;

grant execute
on function public.get_my_pending_organization_membership()
to authenticated;

comment on function public.get_my_pending_organization_membership()
is 'Returns only the authenticated user own INVITED or VERIFIED membership for pending-access routing.';
