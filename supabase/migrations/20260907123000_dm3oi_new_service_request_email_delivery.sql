-- Link operational email deliveries to durable in-app notification events.

alter table public.service_request_communications
  add column if not exists notification_id uuid null
  references public.notifications(id);

alter table public.service_request_communications
  drop constraint if exists service_request_communications_notification_email_check;

alter table public.service_request_communications
  add constraint service_request_communications_notification_email_check
  check (
    notification_id is null
    or (
      communication_type = 'EMAIL_NOTIFICATION'
      and channel = 'EMAIL'
      and recipient_user_id is not null
      and related_message_id is null
    )
  );

create unique index if not exists service_request_communications_notification_email_key
on public.service_request_communications(notification_id, communication_type, channel)
where notification_id is not null;

-- SMTP has no provider idempotency key. Keep PENDING, SENT, and FAILED claims
-- durable so automatic reprocessing cannot send an uncertain delivery twice.

create index if not exists service_request_communications_notification_idx
on public.service_request_communications(notification_id)
where notification_id is not null;

comment on column public.service_request_communications.notification_id is
  'Durable in-app event identity used to claim one operational email delivery per notification and channel.';

-- The trusted dispatcher reads only the event identity and recipient fields it
-- needs. Organization-facing clients receive no new notification privileges.
grant select (
  id,
  organization_id,
  recipient_user_id,
  notification_type,
  source_domain,
  source_entity_id,
  source_event_id
)
on public.notifications
to service_role;
