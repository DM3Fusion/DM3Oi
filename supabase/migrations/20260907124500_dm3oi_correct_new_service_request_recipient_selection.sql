-- Make assignment authoritative for new Service Request notification recipients.

create or replace function public.notify_staff_of_new_service_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_name text;
  recipient record;
begin
  select c.name
  into customer_name
  from public.customers c
  where c.id = new.customer_id
    and c.organization_id = new.organization_id;

  if customer_name is null then
    raise exception 'service request customer not found' using errcode = 'P0002';
  end if;

  if new.assigned_user_id is not null then
    for recipient in
      select m.user_id
      from public.organization_members m
      join public.profiles p
        on p.id = m.user_id
       and p.is_active
      where m.organization_id = new.organization_id
        and m.user_id = new.assigned_user_id
        and m.is_active
        and m.role in ('BUSINESS_OWNER', 'BUSINESS_ADMIN', 'STAFF_MANAGER', 'STAFF_USER')
        and not public.is_super_admin(m.user_id)
        and public.effective_organization_role_permission(
          new.organization_id,
          m.role,
          'VIEW_SERVICE_DESK'
        )
        and public.effective_organization_role_permission(
          new.organization_id,
          m.role,
          'VIEW_COMMUNICATIONS'
        )
    loop
      perform public.create_notification(
        new.organization_id,
        recipient.user_id,
        'NEW_SERVICE_REQUEST_RECEIVED',
        'SERVICE_REQUEST',
        'New service request received',
        left(customer_name || ' submitted ' || new.request_number || ': ' || new.subject, 500),
        'SERVICE_REQUEST',
        new.id,
        new.id,
        '/service-desk/' || new.id::text
      );
    end loop;
  else
    for recipient in
      select distinct m.user_id
      from public.organization_members m
      join public.profiles p
        on p.id = m.user_id
       and p.is_active
      where m.organization_id = new.organization_id
        and m.is_active
        and m.role in ('BUSINESS_OWNER', 'BUSINESS_ADMIN', 'STAFF_MANAGER', 'STAFF_USER')
        and not public.is_super_admin(m.user_id)
        and public.effective_organization_role_permission(
          new.organization_id,
          m.role,
          'VIEW_COMMUNICATIONS'
        )
        and public.effective_organization_role_permission(
          new.organization_id,
          m.role,
          'MANAGE_SERVICE_REQUEST'
        )
        and (
          new.requester_user_id is not null
          or m.user_id is distinct from new.created_by_user_id
        )
    loop
      perform public.create_notification(
        new.organization_id,
        recipient.user_id,
        'NEW_SERVICE_REQUEST_RECEIVED',
        'SERVICE_REQUEST',
        'New service request received',
        left(customer_name || ' submitted ' || new.request_number || ': ' || new.subject, 500),
        'SERVICE_REQUEST',
        new.id,
        new.id,
        '/service-desk/' || new.id::text
      );
    end loop;
  end if;

  return new;
end
$$;

revoke all on function public.notify_staff_of_new_service_request()
from public, anon, authenticated;

comment on function public.notify_staff_of_new_service_request() is
  'Creates idempotent, tenant-scoped Communications notifications for the assigned eligible internal user, or effective managers when a new Service Request is unassigned.';
