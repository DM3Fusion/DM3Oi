begin;

-- ============================================================
-- DM3Oi Platform Support Inbox
--
-- Authenticated organization users can contact the DM3Oi
-- platform operator. Requests are durable platform records and
-- are deliberately separate from tenant Communications.
-- ============================================================

create table public.platform_support_requests (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id) on delete restrict,

  submitted_by_user_id uuid not null,

  organization_name text not null
    check (
      length(trim(organization_name)) between 1 and 240
    ),

  submitter_name text not null
    check (
      length(trim(submitter_name)) between 1 and 240
    ),

  submitter_email text not null
    check (
      length(trim(submitter_email)) between 3 and 320
    ),

  category text not null
    check (
      category in (
        'TERMS',
        'PRIVACY',
        'LICENSING',
        'ACCOUNT',
        'TECHNICAL',
        'OTHER'
      )
    ),

  subject text not null
    check (
      length(trim(subject)) between 1 and 240
    ),

  message text not null
    check (
      length(trim(message)) between 1 and 5000
    ),

  status text not null default 'SUBMITTED'
    check (
      status in (
        'SUBMITTED',
        'RECEIVED',
        'IN_REVIEW',
        'RESPONDED',
        'CLOSED'
      )
    ),

  notification_email_status text not null default 'PENDING'
    check (
      notification_email_status in (
        'PENDING',
        'SENT',
        'FAILED'
      )
    ),

  notification_email_sent_at timestamptz,
  notification_email_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  closed_at timestamptz
);

create index platform_support_requests_created_idx
  on public.platform_support_requests(
    created_at desc,
    id desc
  );

create index platform_support_requests_status_idx
  on public.platform_support_requests(
    status,
    created_at desc
  );

create index platform_support_requests_organization_idx
  on public.platform_support_requests(
    organization_id,
    created_at desc
  );


create table public.platform_support_messages (
  id uuid primary key default gen_random_uuid(),

  request_id uuid not null
    references public.platform_support_requests(id)
    on delete cascade,

  sender_user_id uuid not null,

  sender_type text not null
    check (
      sender_type in (
        'ORGANIZATION_USER',
        'PLATFORM_ADMIN'
      )
    ),

  sender_name text not null
    check (
      length(trim(sender_name)) between 1 and 240
    ),

  sender_email text not null
    check (
      length(trim(sender_email)) between 3 and 320
    ),

  body text not null
    check (
      length(trim(body)) between 1 and 5000
    ),

  email_status text
    check (
      email_status is null
      or email_status in (
        'PENDING',
        'SENT',
        'FAILED'
      )
    ),

  email_sent_at timestamptz,
  email_error text,

  created_at timestamptz not null default now()
);

create index platform_support_messages_request_idx
  on public.platform_support_messages(
    request_id,
    created_at,
    id
  );


-- Read state is per platform administrator.
-- Missing row means unread.
create table public.platform_support_request_reads (
  request_id uuid not null
    references public.platform_support_requests(id)
    on delete cascade,

  user_id uuid not null,

  read_at timestamptz,

  primary key (request_id, user_id)
);

create index platform_support_request_reads_user_idx
  on public.platform_support_request_reads(
    user_id,
    read_at
  );


alter table public.platform_support_requests
  enable row level security;
alter table public.platform_support_messages
  enable row level security;
alter table public.platform_support_request_reads
  enable row level security;

alter table public.platform_support_requests
  force row level security;
alter table public.platform_support_messages
  force row level security;
alter table public.platform_support_request_reads
  force row level security;

revoke all
on public.platform_support_requests
from public, anon, authenticated, service_role;

revoke all
on public.platform_support_messages
from public, anon, authenticated, service_role;

revoke all
on public.platform_support_request_reads
from public, anon, authenticated, service_role;


-- ============================================================
-- Submit support request
--
-- Caller must be an authenticated, active internal organization
-- user. Customer Portal and anonymous callers are excluded.
-- Organization and identity snapshots are server-derived.
-- ============================================================

create or replace function public.submit_platform_support_request(
  target_organization_id uuid,
  target_category text,
  target_subject text,
  target_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  organization_row public.organizations;
  member_row public.organization_members;
  profile_row public.profiles;
  created public.platform_support_requests;
  actor_name text;
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

  if profile_row.id is null
     or nullif(trim(profile_row.email), '') is null
  then
    raise exception 'Active user profile required'
      using errcode = '42501';
  end if;

  if target_category not in (
    'TERMS',
    'PRIVACY',
    'LICENSING',
    'ACCOUNT',
    'TECHNICAL',
    'OTHER'
  ) then
    raise exception 'Invalid support category'
      using errcode = '22023';
  end if;

  if length(trim(coalesce(target_subject, ''))) not between 1 and 240 then
    raise exception 'Invalid support subject'
      using errcode = '22023';
  end if;

  if length(trim(coalesce(target_message, ''))) not between 1 and 5000 then
    raise exception 'Invalid support message'
      using errcode = '22023';
  end if;

  actor_name := coalesce(
    nullif(trim(profile_row.display_name), ''),
    nullif(
      trim(
        concat_ws(
          ' ',
          profile_row.first_name,
          profile_row.last_name
        )
      ),
      ''
    ),
    profile_row.email
  );

  insert into public.platform_support_requests(
    organization_id,
    submitted_by_user_id,
    organization_name,
    submitter_name,
    submitter_email,
    category,
    subject,
    message
  )
  values (
    organization_row.id,
    actor_id,
    organization_row.name,
    actor_name,
    lower(trim(profile_row.email)),
    target_category,
    trim(target_subject),
    trim(target_message)
  )
  returning *
  into created;

  insert into public.platform_support_messages(
    request_id,
    sender_user_id,
    sender_type,
    sender_name,
    sender_email,
    body
  )
  values (
    created.id,
    actor_id,
    'ORGANIZATION_USER',
    actor_name,
    lower(trim(profile_row.email)),
    created.message
  );

  return jsonb_build_object(
    'id', created.id,
    'organization_id', created.organization_id,
    'organization_name', created.organization_name,
    'submitter_name', created.submitter_name,
    'submitter_email', created.submitter_email,
    'category', created.category,
    'subject', created.subject,
    'message', created.message,
    'status', created.status,
    'created_at', created.created_at
  );
end;
$$;


-- ============================================================
-- Finalize initial notification email.
-- Server/service-role only.
-- ============================================================

create or replace function public.finalize_platform_support_notification_server(
  target_request_id uuid,
  target_sent boolean,
  target_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  update public.platform_support_requests
  set
    notification_email_status =
      case when target_sent then 'SENT' else 'FAILED' end,
    notification_email_sent_at =
      case when target_sent then now() else null end,
    notification_email_error =
      case
        when target_sent then null
        else left(
          coalesce(
            nullif(trim(target_error), ''),
            'Email delivery failed'
          ),
          500
        )
      end,
    updated_at = now()
  where id = target_request_id;
end;
$$;


-- ============================================================
-- Platform Inbox aggregate
-- ============================================================

create or replace function public.get_platform_support_inbox(
  target_status text default null,
  target_category text default null,
  target_query text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_query text :=
    nullif(trim(coalesce(target_query, '')), '');
begin
  if not public.is_super_admin(actor_id) then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  if target_status is not null
     and target_status not in (
       'SUBMITTED',
       'RECEIVED',
       'IN_REVIEW',
       'RESPONDED',
       'CLOSED'
     )
  then
    raise exception 'Invalid support status'
      using errcode = '22023';
  end if;

  if target_category is not null
     and target_category not in (
       'TERMS',
       'PRIVACY',
       'LICENSING',
       'ACCOUNT',
       'TECHNICAL',
       'OTHER'
     )
  then
    raise exception 'Invalid support category'
      using errcode = '22023';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', request.id,
          'organization_id', request.organization_id,
          'organization_name', request.organization_name,
          'submitter_name', request.submitter_name,
          'submitter_email', request.submitter_email,
          'category', request.category,
          'subject', request.subject,
          'message', request.message,
          'status', request.status,
          'created_at', request.created_at,
          'updated_at', request.updated_at,
          'responded_at', request.responded_at,
          'closed_at', request.closed_at,
          'notification_email_status',
            request.notification_email_status,
          'read',
            coalesce(read_state.read_at is not null, false)
        )
        order by request.updated_at desc, request.id desc
      )
      from public.platform_support_requests request
      left join public.platform_support_request_reads read_state
        on read_state.request_id = request.id
       and read_state.user_id = actor_id
      where
        (
          target_status is null
          or request.status = target_status
        )
        and (
          target_category is null
          or request.category = target_category
        )
        and (
          normalized_query is null
          or request.subject ilike '%' || normalized_query || '%'
          or request.message ilike '%' || normalized_query || '%'
          or request.organization_name ilike '%' || normalized_query || '%'
          or request.submitter_name ilike '%' || normalized_query || '%'
          or request.submitter_email ilike '%' || normalized_query || '%'
        )
    ),
    '[]'::jsonb
  );
end;
$$;


create or replace function public.get_platform_support_unread_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  result integer;
begin
  if not public.is_super_admin(actor_id) then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into result
  from public.platform_support_requests request
  left join public.platform_support_request_reads read_state
    on read_state.request_id = request.id
   and read_state.user_id = actor_id
  where request.status <> 'CLOSED'
    and read_state.read_at is null;

  return result;
end;
$$;


create or replace function public.set_platform_support_request_read_state(
  target_request_id uuid,
  target_read boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if not public.is_super_admin(actor_id) then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.platform_support_requests
    where id = target_request_id
  ) then
    raise exception 'Support request not found'
      using errcode = 'P0002';
  end if;

  insert into public.platform_support_request_reads(
    request_id,
    user_id,
    read_at
  )
  values (
    target_request_id,
    actor_id,
    case when target_read then now() else null end
  )
  on conflict (request_id, user_id)
  do update
  set read_at =
    case
      when target_read then now()
      else null
    end;
end;
$$;


create or replace function public.mark_all_platform_support_requests_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  changed integer := 0;
begin
  if not public.is_super_admin(actor_id) then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  insert into public.platform_support_request_reads(
    request_id,
    user_id,
    read_at
  )
  select
    request.id,
    actor_id,
    now()
  from public.platform_support_requests request
  where request.status <> 'CLOSED'
  on conflict (request_id, user_id)
  do update set read_at = excluded.read_at;

  get diagnostics changed = row_count;
  return changed;
end;
$$;


create or replace function public.get_platform_support_request(
  target_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  request_row public.platform_support_requests;
  messages jsonb;
begin
  if not public.is_super_admin(actor_id) then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  select *
  into request_row
  from public.platform_support_requests
  where id = target_request_id;

  if request_row.id is null then
    return null;
  end if;

  perform public.set_platform_support_request_read_state(
    target_request_id,
    true
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', message.id,
        'sender_type', message.sender_type,
        'sender_name', message.sender_name,
        'sender_email', message.sender_email,
        'body', message.body,
        'email_status', message.email_status,
        'email_sent_at', message.email_sent_at,
        'email_error', message.email_error,
        'created_at', message.created_at
      )
      order by message.created_at, message.id
    ),
    '[]'::jsonb
  )
  into messages
  from public.platform_support_messages message
  where message.request_id = target_request_id;

  return jsonb_build_object(
    'id', request_row.id,
    'organization_id', request_row.organization_id,
    'organization_name', request_row.organization_name,
    'submitter_name', request_row.submitter_name,
    'submitter_email', request_row.submitter_email,
    'category', request_row.category,
    'subject', request_row.subject,
    'message', request_row.message,
    'status', request_row.status,
    'notification_email_status',
      request_row.notification_email_status,
    'created_at', request_row.created_at,
    'updated_at', request_row.updated_at,
    'responded_at', request_row.responded_at,
    'closed_at', request_row.closed_at,
    'messages', messages
  );
end;
$$;


create or replace function public.set_platform_support_request_status(
  target_request_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  if target_status not in (
    'RECEIVED',
    'IN_REVIEW',
    'RESPONDED',
    'CLOSED'
  ) then
    raise exception 'Invalid support status'
      using errcode = '22023';
  end if;

  update public.platform_support_requests
  set
    status = target_status,
    responded_at =
      case
        when target_status = 'RESPONDED'
          then coalesce(responded_at, now())
        else responded_at
      end,
    closed_at =
      case
        when target_status = 'CLOSED'
          then coalesce(closed_at, now())
        else null
      end,
    updated_at = now()
  where id = target_request_id;

  if not found then
    raise exception 'Support request not found'
      using errcode = 'P0002';
  end if;
end;
$$;


-- ============================================================
-- Begin a Platform response.
-- The durable message is created before transport is attempted.
-- ============================================================

create or replace function public.create_platform_support_response(
  target_request_id uuid,
  target_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  profile_row public.profiles;
  request_row public.platform_support_requests;
  created public.platform_support_messages;
  actor_name text;
begin
  if not public.is_super_admin(actor_id) then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(target_body, ''))) not between 1 and 5000 then
    raise exception 'Invalid response'
      using errcode = '22023';
  end if;

  select *
  into request_row
  from public.platform_support_requests
  where id = target_request_id
  for update;

  if request_row.id is null then
    raise exception 'Support request not found'
      using errcode = 'P0002';
  end if;

  if request_row.status = 'CLOSED' then
    raise exception 'Closed support requests cannot be replied to'
      using errcode = '55000';
  end if;

  select *
  into profile_row
  from public.profiles
  where id = actor_id
    and is_active;

  actor_name := coalesce(
    nullif(trim(profile_row.display_name), ''),
    nullif(
      trim(
        concat_ws(
          ' ',
          profile_row.first_name,
          profile_row.last_name
        )
      ),
      ''
    ),
    profile_row.email,
    'DM3Oi'
  );

  insert into public.platform_support_messages(
    request_id,
    sender_user_id,
    sender_type,
    sender_name,
    sender_email,
    body,
    email_status
  )
  values (
    request_row.id,
    actor_id,
    'PLATFORM_ADMIN',
    actor_name,
    coalesce(
      nullif(lower(trim(profile_row.email)), ''),
      'dm3@pobox.com'
    ),
    trim(target_body),
    'PENDING'
  )
  returning *
  into created;

  update public.platform_support_requests
  set
    status = 'IN_REVIEW',
    updated_at = now()
  where id = request_row.id;

  perform public.set_platform_support_request_read_state(
    request_row.id,
    true
  );

  return jsonb_build_object(
    'message_id', created.id,
    'request_id', request_row.id,
    'recipient_email', request_row.submitter_email,
    'recipient_name', request_row.submitter_name,
    'organization_name', request_row.organization_name,
    'subject', request_row.subject,
    'body', created.body
  );
end;
$$;


create or replace function public.finalize_platform_support_response(
  target_message_id uuid,
  target_sent boolean,
  target_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  message_row public.platform_support_messages;
begin
  if not public.is_super_admin(actor_id) then
    raise exception 'Not authorized'
      using errcode = '42501';
  end if;

  select *
  into message_row
  from public.platform_support_messages
  where id = target_message_id
    and sender_type = 'PLATFORM_ADMIN'
  for update;

  if message_row.id is null then
    raise exception 'Support response not found'
      using errcode = 'P0002';
  end if;

  update public.platform_support_messages
  set
    email_status =
      case when target_sent then 'SENT' else 'FAILED' end,
    email_sent_at =
      case when target_sent then now() else null end,
    email_error =
      case
        when target_sent then null
        else left(
          coalesce(
            nullif(trim(target_error), ''),
            'Email delivery failed'
          ),
          500
        )
      end
  where id = target_message_id;

  update public.platform_support_requests
  set
    status =
      case
        when target_sent then 'RESPONDED'
        else 'IN_REVIEW'
      end,
    responded_at =
      case
        when target_sent then coalesce(responded_at, now())
        else responded_at
      end,
    updated_at = now()
  where id = message_row.request_id;
end;
$$;


-- ============================================================
-- Execution boundary
-- ============================================================

revoke all
on function public.submit_platform_support_request(
  uuid,
  text,
  text,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.submit_platform_support_request(
  uuid,
  text,
  text,
  text
)
to authenticated;


revoke all
on function public.finalize_platform_support_notification_server(
  uuid,
  boolean,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.finalize_platform_support_notification_server(
  uuid,
  boolean,
  text
)
to service_role;


revoke all
on function public.get_platform_support_inbox(
  text,
  text,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.get_platform_support_inbox(
  text,
  text,
  text
)
to authenticated;


revoke all
on function public.get_platform_support_unread_count()
from public, anon, authenticated, service_role;

grant execute
on function public.get_platform_support_unread_count()
to authenticated;


revoke all
on function public.set_platform_support_request_read_state(
  uuid,
  boolean
)
from public, anon, authenticated, service_role;

grant execute
on function public.set_platform_support_request_read_state(
  uuid,
  boolean
)
to authenticated;


revoke all
on function public.mark_all_platform_support_requests_read()
from public, anon, authenticated, service_role;

grant execute
on function public.mark_all_platform_support_requests_read()
to authenticated;


revoke all
on function public.get_platform_support_request(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.get_platform_support_request(uuid)
to authenticated;


revoke all
on function public.set_platform_support_request_status(
  uuid,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.set_platform_support_request_status(
  uuid,
  text
)
to authenticated;


revoke all
on function public.create_platform_support_response(
  uuid,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.create_platform_support_response(
  uuid,
  text
)
to authenticated;


revoke all
on function public.finalize_platform_support_response(
  uuid,
  boolean,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.finalize_platform_support_response(
  uuid,
  boolean,
  text
)
to authenticated;


comment on table public.platform_support_requests is
  'Durable authenticated organization-user requests to the DM3Oi platform operator.';

comment on table public.platform_support_messages is
  'Durable conversation history for DM3Oi platform support requests.';

comment on table public.platform_support_request_reads is
  'Per-platform-administrator unread/read state for the Platform Inbox.';

notify pgrst, 'reload schema';

commit;
