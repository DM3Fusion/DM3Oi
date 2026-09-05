-- DM3iQCM-07E.4: shared, tenant-scoped in-application communications inbox.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null check (length(trim(notification_type)) between 1 and 80),
  category text not null check (length(trim(category)) between 1 and 80),
  title text not null check (length(trim(title)) between 1 and 240),
  message text not null check (length(trim(message)) between 1 and 500),
  source_domain text not null check (length(trim(source_domain)) between 1 and 80),
  source_entity_id uuid not null,
  source_event_id uuid,
  destination_path text not null check (
    destination_path like '/%'
    and destination_path not like '//%'
    and length(destination_path) <= 500
  ),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  archived_at timestamptz,
  unique (organization_id, recipient_user_id, notification_type, source_domain, source_event_id)
);

create index notifications_recipient_inbox_idx
  on public.notifications(organization_id, recipient_user_id, created_at desc, id desc)
  where archived_at is null;
create index notifications_recipient_unread_idx
  on public.notifications(organization_id, recipient_user_id, created_at desc)
  where read_at is null and archived_at is null;
create index notifications_source_idx
  on public.notifications(organization_id, source_domain, source_entity_id, source_event_id);

comment on table public.notifications is
  'Shared tenant-scoped in-application communications inbox for reusable DM3iQCM domain events.';
comment on column public.notifications.source_event_id is
  'Durable event/message identity used with recipient identity for notification idempotency.';

create or replace function public.create_notification(
  target_organization_id uuid,
  target_recipient_user_id uuid,
  target_notification_type text,
  target_category text,
  target_title text,
  target_message text,
  target_source_domain text,
  target_source_entity_id uuid,
  target_source_event_id uuid,
  target_destination_path text
) returns public.notifications language plpgsql security definer set search_path='' as $$
declare created public.notifications;
begin
  if target_source_event_id is null then
    raise exception 'notification source event is required' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.organization_members m
    join public.profiles p on p.id=m.user_id and p.is_active
    where m.organization_id=target_organization_id
      and m.user_id=target_recipient_user_id
      and m.is_active
      and m.role in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER')
  ) then
    raise exception 'invalid staff notification recipient' using errcode='23514';
  end if;
  insert into public.notifications(
    organization_id,recipient_user_id,notification_type,category,title,message,
    source_domain,source_entity_id,source_event_id,destination_path
  ) values (
    target_organization_id,target_recipient_user_id,trim(target_notification_type),trim(target_category),
    trim(target_title),trim(target_message),trim(target_source_domain),target_source_entity_id,
    target_source_event_id,target_destination_path
  ) on conflict (organization_id,recipient_user_id,notification_type,source_domain,source_event_id)
    do update set source_entity_id=excluded.source_entity_id
  returning * into created;
  return created;
end $$;

create or replace function public.notify_staff_of_customer_service_request_message()
returns trigger language plpgsql security definer set search_path='' as $$
declare request_row public.service_requests; recipient record;
begin
  if new.author_type <> 'CUSTOMER' then return new; end if;
  select * into request_row from public.service_requests
    where id=new.service_request_id and organization_id=new.organization_id;
  if not found then raise exception 'service request not found' using errcode='P0002'; end if;

  for recipient in
    select distinct m.user_id
    from public.organization_members m
    join public.profiles p on p.id=m.user_id and p.is_active
    where m.organization_id=new.organization_id and m.is_active
      and m.role in ('BUSINESS_OWNER','BUSINESS_ADMIN','STAFF_MANAGER','STAFF_USER')
      and (
        (request_row.assigned_user_id is not null and m.user_id=request_row.assigned_user_id)
        or (request_row.assigned_user_id is null and m.role in ('BUSINESS_OWNER','BUSINESS_ADMIN'))
      )
  loop
    perform public.create_notification(
      new.organization_id,recipient.user_id,'CUSTOMER_RESPONSE_RECEIVED','SERVICE_REQUEST',
      'Customer response received',
      'A customer added a message to ' || request_row.request_number || '.',
      'SERVICE_REQUEST',request_row.id,new.id,
      '/service-desk/' || request_row.id::text
    );
  end loop;
  return new;
end $$;

create trigger service_request_customer_message_notification
after insert on public.service_request_messages
for each row execute function public.notify_staff_of_customer_service_request_message();

create or replace function public.set_notification_read_state(
  target_notification_id uuid,
  target_read boolean
) returns public.notifications language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.notifications;
begin
  update public.notifications n
    set read_at=case when target_read then coalesce(n.read_at,now()) else null end
    where n.id=target_notification_id
      and n.recipient_user_id=actor
      and (public.is_super_admin(actor) or public.is_internal_member(n.organization_id,actor))
    returning * into item;
  if not found then raise exception 'notification not found or not authorized' using errcode='42501'; end if;
  return item;
end $$;

create or replace function public.mark_all_notifications_read(target_organization_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); changed integer;
begin
  if actor is null or not (public.is_super_admin(actor) or public.is_internal_member(target_organization_id,actor)) then
    raise exception 'not authorized' using errcode='42501';
  end if;
  update public.notifications set read_at=now()
    where organization_id=target_organization_id and recipient_user_id=actor
      and read_at is null and archived_at is null;
  get diagnostics changed=row_count;
  return changed;
end $$;

create or replace function public.archive_notification(target_notification_id uuid)
returns public.notifications language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.notifications;
begin
  update public.notifications n set archived_at=coalesce(n.archived_at,now())
    where n.id=target_notification_id and n.recipient_user_id=actor
      and (public.is_super_admin(actor) or public.is_internal_member(n.organization_id,actor))
    returning * into item;
  if not found then raise exception 'notification not found or not authorized' using errcode='42501'; end if;
  return item;
end $$;

alter table public.notifications enable row level security;
create policy notifications_recipient_select on public.notifications
  for select to authenticated
  using (
    recipient_user_id=auth.uid()
    and (public.is_super_admin() or public.is_internal_member(organization_id))
  );

revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;
revoke all on function public.create_notification(uuid,uuid,text,text,text,text,text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.notify_staff_of_customer_service_request_message() from public,anon,authenticated;
revoke all on function public.set_notification_read_state(uuid,boolean) from public,anon;
revoke all on function public.mark_all_notifications_read(uuid) from public,anon;
revoke all on function public.archive_notification(uuid) from public,anon;
grant execute on function public.set_notification_read_state(uuid,boolean) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;
grant execute on function public.archive_notification(uuid) to authenticated;
