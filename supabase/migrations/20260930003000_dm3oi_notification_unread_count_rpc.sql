begin;

create or replace function public.get_my_unread_notification_count(
  target_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  unread_count integer;
begin
  if actor is null then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if not public.has_effective_organization_permission(
    target_organization_id,
    'VIEW_COMMUNICATIONS'
  ) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select count(*)::integer
    into unread_count
  from public.notifications notification
  where notification.organization_id = target_organization_id
    and notification.recipient_user_id = actor
    and notification.read_at is null
    and notification.archived_at is null;

  return coalesce(unread_count, 0);
end
$$;

alter function public.get_my_unread_notification_count(uuid)
  owner to postgres;

revoke all
  on function public.get_my_unread_notification_count(uuid)
  from public, anon, authenticated;

grant execute
  on function public.get_my_unread_notification_count(uuid)
  to authenticated;

commit;
