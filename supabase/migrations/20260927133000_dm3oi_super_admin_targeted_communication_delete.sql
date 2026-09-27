-- DM3Oi SUPER_ADMIN targeted Communications deletion.
-- Allows an active SUPER_ADMIN to remove one exact organization communication
-- while preserving a durable platform-only deletion audit.

create table if not exists public.platform_communication_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_name text not null,
  record_kind text not null
    check (record_kind in ('NOTIFICATION', 'EMAIL_DELIVERY')),
  deleted_record_id uuid not null,
  actor_user_id uuid not null,
  recipient_user_id uuid,
  recipient_email text,
  title text not null,
  record_created_at timestamptz,
  reason text
    check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

alter table public.platform_communication_deletion_audit
  enable row level security;

revoke all on table public.platform_communication_deletion_audit
  from public, anon, authenticated;

drop policy if exists platform_communication_deletion_audit_super_admin_read
  on public.platform_communication_deletion_audit;

create policy platform_communication_deletion_audit_super_admin_read
on public.platform_communication_deletion_audit
for select
to authenticated
using (public.is_super_admin(auth.uid()));

grant select on table public.platform_communication_deletion_audit
  to authenticated;

drop policy if exists notifications_super_admin_select
  on public.notifications;

create policy notifications_super_admin_select
on public.notifications
for select
to authenticated
using (public.is_super_admin(auth.uid()));

create or replace function public.get_organization_email_delivery_audit(
  target_organization_id uuid,
  created_after timestamptz default null,
  search_text text default null
)
returns table (
  id uuid,
  organization_id uuid,
  template_key text,
  recipient_email text,
  recipient_user_id uuid,
  membership_id uuid,
  customer_id uuid,
  case_id uuid,
  service_request_id uuid,
  subject text,
  delivery_status text,
  sent_at timestamptz,
  failed_at timestamptz,
  opened_at timestamptz,
  error_summary text,
  activity_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    delivery.id,
    delivery.organization_id,
    delivery.template_key,
    delivery.recipient_email,
    delivery.recipient_user_id,
    delivery.membership_id,
    delivery.customer_id,
    delivery.case_id,
    delivery.service_request_id,
    delivery.subject,
    delivery.delivery_status,
    delivery.sent_at,
    delivery.failed_at,
    delivery.opened_at,
    delivery.error_summary,
    coalesce(
      delivery.opened_at,
      delivery.failed_at,
      delivery.sent_at,
      delivery.created_at
    )
  from public.email_deliveries delivery
  where delivery.organization_id = target_organization_id
    and (
      public.is_super_admin(auth.uid())
      or (
        public.has_effective_organization_permission(
          target_organization_id,
          'VIEW_COMMUNICATIONS'
        )
        and public.has_organization_role(
          target_organization_id,
          array['BUSINESS_OWNER']::public.application_role[],
          auth.uid()
        )
        and not exists (
          select 1
          from public.platform_user_roles platform_role
          where platform_role.user_id = delivery.recipient_user_id
            and platform_role.role = 'SUPER_ADMIN'
            and platform_role.is_active = true
        )
      )
    )
    and (created_after is null or delivery.created_at >= created_after)
    and (
      nullif(trim(search_text), '') is null
      or delivery.subject ilike '%' || trim(search_text) || '%'
      or delivery.recipient_email ilike '%' || trim(search_text) || '%'
      or delivery.template_key ilike '%' || trim(search_text) || '%'
      or delivery.delivery_status ilike '%' || trim(search_text) || '%'
    )
  order by
    coalesce(
      delivery.opened_at,
      delivery.failed_at,
      delivery.sent_at,
      delivery.created_at
    ) desc,
    delivery.id desc;
$$;

revoke all on function public.get_organization_email_delivery_audit(
  uuid,
  timestamptz,
  text
) from public, anon;

grant execute on function public.get_organization_email_delivery_audit(
  uuid,
  timestamptz,
  text
) to authenticated;

create or replace function public.delete_platform_communication(
  target_organization_id uuid,
  target_record_kind text,
  target_record_id uuid,
  target_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  organization_record record;
  notification_record public.notifications;
  delivery_record public.email_deliveries;
  deletion_audit_id uuid;
  normalized_kind text := upper(trim(target_record_kind));
  normalized_reason text := nullif(trim(target_reason), '');
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_organization_id is null or target_record_id is null then
    raise exception 'organization and communication are required'
      using errcode = '22023';
  end if;

  if normalized_kind is null
     or normalized_kind not in ('NOTIFICATION', 'EMAIL_DELIVERY') then
    raise exception 'unsupported communication type'
      using errcode = '22023';
  end if;

  if normalized_reason is not null
     and char_length(normalized_reason) > 500 then
    raise exception 'deletion reason is too long'
      using errcode = '22023';
  end if;

  select organization.id, organization.name
  into organization_record
  from public.organizations organization
  where organization.id = target_organization_id;

  if not found then
    raise exception 'organization not found'
      using errcode = 'P0002';
  end if;

  if normalized_kind = 'NOTIFICATION' then
    select *
    into notification_record
    from public.notifications notification
    where notification.id = target_record_id
      and notification.organization_id = target_organization_id
    for update;

    if not found then
      raise exception 'communication not found'
        using errcode = 'P0002';
    end if;

    if exists (
      select 1
      from public.service_request_communications communication
      where communication.notification_id = notification_record.id
    ) then
      raise exception 'communication is part of durable Service Request delivery history'
        using errcode = '23503';
    end if;

    insert into public.platform_communication_deletion_audit (
      organization_id,
      organization_name,
      record_kind,
      deleted_record_id,
      actor_user_id,
      recipient_user_id,
      recipient_email,
      title,
      record_created_at,
      reason
    )
    values (
      target_organization_id,
      organization_record.name,
      normalized_kind,
      notification_record.id,
      actor,
      notification_record.recipient_user_id,
      null,
      notification_record.title,
      notification_record.created_at,
      normalized_reason
    )
    returning id into deletion_audit_id;

    delete from public.notifications notification
    where notification.id = notification_record.id
      and notification.organization_id = target_organization_id;

  else
    select *
    into delivery_record
    from public.email_deliveries delivery
    where delivery.id = target_record_id
      and delivery.organization_id = target_organization_id
    for update;

    if not found then
      raise exception 'communication not found'
        using errcode = 'P0002';
    end if;

    insert into public.platform_communication_deletion_audit (
      organization_id,
      organization_name,
      record_kind,
      deleted_record_id,
      actor_user_id,
      recipient_user_id,
      recipient_email,
      title,
      record_created_at,
      reason
    )
    values (
      target_organization_id,
      organization_record.name,
      normalized_kind,
      delivery_record.id,
      actor,
      delivery_record.recipient_user_id,
      delivery_record.recipient_email,
      delivery_record.subject,
      delivery_record.created_at,
      normalized_reason
    )
    returning id into deletion_audit_id;

    delete from public.email_deliveries delivery
    where delivery.id = delivery_record.id
      and delivery.organization_id = target_organization_id;
  end if;

  return jsonb_build_object(
    'deleted', true,
    'recordKind', normalized_kind,
    'recordId', target_record_id,
    'deletionAuditId', deletion_audit_id
  );
end;
$$;

revoke all on function public.delete_platform_communication(
  uuid,
  text,
  uuid,
  text
) from public, anon;

grant execute on function public.delete_platform_communication(
  uuid,
  text,
  uuid,
  text
) to authenticated;
