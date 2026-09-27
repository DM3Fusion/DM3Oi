begin;

create table public.platform_email_templates (
  template_key text primary key check (template_key in (
    'ORGANIZATION_USER_INVITATION',
    'ORGANIZATION_USER_INVITATION_RESEND',
    'CUSTOMER_PORTAL_INVITATION',
    'SIGN_IN_CODE',
    'NEW_SERVICE_REQUEST_NOTIFICATION'
  )),
  subject_template text not null check (char_length(trim(subject_template)) between 1 and 200),
  opening_message text not null check (char_length(trim(opening_message)) between 1 and 2000),
  closing_message text not null check (char_length(trim(closing_message)) between 1 and 2000),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references auth.users(id) on delete set null
);

insert into public.platform_email_templates (
  template_key, subject_template, opening_message, closing_message
)
values
  (
    'ORGANIZATION_USER_INVITATION',
    '{{organization_name}} invited you to DM3Oi',
    'Hello {{recipient_first_name}}, You have been invited to join {{organization_name}} in DM3Oi™ Operational Intelligence as {{role}}.',
    'Accept your invitation: {{action_url}}'
  ),
  (
    'ORGANIZATION_USER_INVITATION_RESEND',
    '{{organization_name}} resent your DM3Oi invitation',
    'Hello {{recipient_first_name}}, {{organization_name}} has resent your invitation to join its DM3Oi™ Operational Intelligence workspace as {{role}}.',
    'Accept your invitation: {{action_url}}'
  ),
  (
    'CUSTOMER_PORTAL_INVITATION',
    '{{organization_name}} invited you to their Customer Portal',
    'Hello {{recipient_first_name}}, {{organization_name}} has invited you to access their Customer Portal, powered by DM3Oi™ Operational Intelligence.',
    'Access the Customer Portal: {{action_url}}'
  ),
  (
    'SIGN_IN_CODE',
    'Your DM3Oi sign-in code',
    'Use code {{sign_in_code}} to sign in to DM3Oi™ Operational Intelligence.',
    'If you did not request this code, you can safely ignore this email.'
  ),
  (
    'NEW_SERVICE_REQUEST_NOTIFICATION',
    'New service request: {{service_request_number}}',
    'A new service request was received from {{customer_name}}: {{request_subject}}.',
    'Open the Service Request in DM3Oi: {{action_url}}'
  );

alter table public.platform_email_templates enable row level security;
revoke all on public.platform_email_templates from public, anon, authenticated;

create policy platform_email_templates_super_admin_read
on public.platform_email_templates
for select to authenticated
using (public.is_super_admin(auth.uid()));

grant select on public.platform_email_templates to authenticated;
grant select, insert, update on public.platform_email_templates to service_role;

create function public.email_template_content_is_safe(
  target_template_key text,
  target_content text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  allowed text[];
  token text[];
  remainder text;
begin
  allowed := case target_template_key
    when 'ORGANIZATION_USER_INVITATION' then
      array['organization_name','recipient_first_name','recipient_name','recipient_email','role','action_url']
    when 'ORGANIZATION_USER_INVITATION_RESEND' then
      array['organization_name','recipient_first_name','recipient_name','recipient_email','role','action_url']
    when 'CUSTOMER_PORTAL_INVITATION' then
      array['organization_name','recipient_first_name','recipient_name','recipient_email','action_url']
    when 'SIGN_IN_CODE' then
      array['recipient_first_name','recipient_name','recipient_email','sign_in_code','action_url']
    when 'NEW_SERVICE_REQUEST_NOTIFICATION' then
      array['organization_name','recipient_first_name','recipient_name','recipient_email','service_request_number','customer_name','request_subject','action_url']
    else array[]::text[]
  end;

  for token in
    select captures
    from pg_catalog.regexp_matches(
      target_content,
      '\{\{([a-z_]+)\}\}',
      'g'
    ) as matched(captures)
  loop
    if not token[1] = any(allowed) then
      return false;
    end if;
  end loop;

  remainder := pg_catalog.regexp_replace(target_content, '\{\{[a-z_]+\}\}', '', 'g');
  return pg_catalog.strpos(remainder, '{{') = 0
    and pg_catalog.strpos(remainder, '}}') = 0;
end;
$$;

revoke all on function public.email_template_content_is_safe(text, text)
  from public, anon, authenticated;

-- organization_members predates the canonical (organization_id, id) keys on
-- the other organization-owned entities. Add the narrow key required for the
-- tenant-preserving delivery reference below.
alter table public.organization_members
  add constraint organization_members_organization_id_id_key
  unique (organization_id, id);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  template_key text not null references public.platform_email_templates(template_key),
  recipient_email text not null check (char_length(trim(recipient_email)) between 3 and 320),
  recipient_user_id uuid references auth.users(id) on delete set null,
  membership_id uuid,
  customer_id uuid,
  case_id uuid,
  service_request_id uuid,
  subject text not null check (char_length(trim(subject)) between 1 and 200),
  delivery_status text not null default 'PENDING'
    check (delivery_status in ('PENDING', 'SENT', 'FAILED')),
  provider_message_id text,
  tracking_token uuid not null default gen_random_uuid() unique,
  sent_at timestamptz,
  failed_at timestamptz,
  opened_at timestamptz,
  error_code text check (error_code is null or char_length(error_code) <= 100),
  error_summary text check (error_summary is null or char_length(error_summary) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (organization_id is not null or (
    membership_id is null and customer_id is null and case_id is null and service_request_id is null
  )),
  foreign key (organization_id, membership_id)
    references public.organization_members(organization_id, id)
    on delete set null (membership_id),
  foreign key (organization_id, customer_id)
    references public.customers(organization_id, id)
    on delete set null (customer_id),
  foreign key (organization_id, case_id)
    references public.cases(organization_id, id)
    on delete set null (case_id),
  foreign key (organization_id, service_request_id)
    references public.service_requests(organization_id, id)
    on delete set null (service_request_id)
);

create index email_deliveries_organization_activity_idx
  on public.email_deliveries (organization_id, created_at desc);
create index email_deliveries_membership_idx on public.email_deliveries (membership_id)
  where membership_id is not null;
create index email_deliveries_customer_idx on public.email_deliveries (customer_id)
  where customer_id is not null;
create index email_deliveries_service_request_idx on public.email_deliveries (service_request_id)
  where service_request_id is not null;

alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from public, anon, authenticated;

create policy email_deliveries_super_admin_read
on public.email_deliveries
for select to authenticated
using (public.is_super_admin(auth.uid()));

grant select on public.email_deliveries to authenticated;
grant select, insert, update, delete on public.email_deliveries to service_role;

create or replace function public.update_platform_email_template(
  target_template_key text,
  target_subject_template text,
  target_opening_message text,
  target_closing_message text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_template_key not in (
    'ORGANIZATION_USER_INVITATION',
    'ORGANIZATION_USER_INVITATION_RESEND',
    'CUSTOMER_PORTAL_INVITATION',
    'SIGN_IN_CODE',
    'NEW_SERVICE_REQUEST_NOTIFICATION'
  ) then
    raise exception 'unsupported email template' using errcode = '22023';
  end if;

  if nullif(trim(target_subject_template), '') is null
    or char_length(trim(target_subject_template)) > 200
    or target_subject_template like '%' || E'\n' || '%'
    or target_subject_template like '%' || E'\r' || '%'
    or nullif(trim(target_opening_message), '') is null
    or char_length(trim(target_opening_message)) > 2000
    or nullif(trim(target_closing_message), '') is null
    or char_length(trim(target_closing_message)) > 2000 then
    raise exception 'invalid email template' using errcode = '22023';
  end if;

  if not public.email_template_content_is_safe(
      target_template_key,
      target_subject_template || E'\n' || target_opening_message || E'\n' || target_closing_message
    ) then
    raise exception 'invalid email template variable' using errcode = '22023';
  end if;

  update public.platform_email_templates
  set subject_template = trim(target_subject_template),
      opening_message = trim(target_opening_message),
      closing_message = trim(target_closing_message),
      updated_at = now(),
      updated_by_user_id = auth.uid()
  where template_key = target_template_key;

  return found;
end;
$$;

revoke all on function public.update_platform_email_template(text, text, text, text)
  from public, anon;
grant execute on function public.update_platform_email_template(text, text, text, text)
  to authenticated;

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
    coalesce(delivery.opened_at, delivery.failed_at, delivery.sent_at, delivery.created_at)
  from public.email_deliveries delivery
  where delivery.organization_id = target_organization_id
    and public.has_effective_organization_permission(
      target_organization_id,
      'VIEW_COMMUNICATIONS'
    )
    and public.has_organization_role(
      target_organization_id,
      array['BUSINESS_OWNER']::public.application_role[],
      auth.uid()
    )
    and not public.is_super_admin(auth.uid())
    and not exists (
      select 1
      from public.platform_user_roles platform_role
      where platform_role.user_id = delivery.recipient_user_id
        and platform_role.role = 'SUPER_ADMIN'
        and platform_role.is_active = true
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
    coalesce(delivery.opened_at, delivery.failed_at, delivery.sent_at, delivery.created_at) desc,
    delivery.id desc;
$$;

revoke all on function public.get_organization_email_delivery_audit(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.get_organization_email_delivery_audit(uuid, timestamptz, text)
  to authenticated;

-- Extend reset/delete previews and result counts without rewriting the applied
-- implementations. Organization-owned email history is operational test data;
-- platform-only delivery history and platform templates remain durable.
alter function public.preview_organization_reset(uuid, uuid)
  rename to preview_organization_reset_without_email_deliveries;
revoke all on function public.preview_organization_reset_without_email_deliveries(uuid, uuid)
  from public, anon, authenticated;

create function public.preview_organization_reset(
  target_organization_id uuid,
  preserved_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  result := public.preview_organization_reset_without_email_deliveries(
    target_organization_id,
    preserved_owner_user_id
  );
  return result || jsonb_build_object(
    'emailDeliveries',
    (select count(*) from public.email_deliveries
     where organization_id = target_organization_id)
  );
end;
$$;

alter function public.reset_organization_company_and_users(uuid, uuid, text)
  rename to reset_organization_company_and_users_without_email_deliveries;
revoke all on function public.reset_organization_company_and_users_without_email_deliveries(uuid, uuid, text)
  from public, anon, authenticated;

create function public.reset_organization_company_and_users(
  target_organization_id uuid,
  preserved_owner_user_id uuid,
  confirmation_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  deleted_count bigint;
  actor uuid := auth.uid();
begin
  result := public.reset_organization_company_and_users_without_email_deliveries(
    target_organization_id,
    preserved_owner_user_id,
    confirmation_text
  );

  delete from public.email_deliveries
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('emailDeliveries', deleted_count);

  update public.platform_organization_reset_audit
  set deleted_counts = result
  where id = (
    select id
    from public.platform_organization_reset_audit
    where organization_id = target_organization_id
      and actor_user_id = actor
    order by created_at desc, id desc
    limit 1
  );

  return result;
end;
$$;

alter function public.preview_permanent_organization_deletion(uuid)
  rename to preview_permanent_organization_deletion_without_email_deliveries;
revoke all on function public.preview_permanent_organization_deletion_without_email_deliveries(uuid)
  from public, anon, authenticated;

create function public.preview_permanent_organization_deletion(
  target_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  result := public.preview_permanent_organization_deletion_without_email_deliveries(
    target_organization_id
  );
  return result || jsonb_build_object(
    'emailDeliveries',
    (select count(*) from public.email_deliveries
     where organization_id = target_organization_id)
  );
end;
$$;

alter function public.permanently_delete_organization(uuid, text)
  rename to permanently_delete_organization_without_email_deliveries;
revoke all on function public.permanently_delete_organization_without_email_deliveries(uuid, text)
  from public, anon, authenticated;

create function public.permanently_delete_organization(
  target_organization_id uuid,
  confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  delivery_count bigint;
  actor uuid := auth.uid();
begin
  select count(*) into delivery_count
  from public.email_deliveries
  where organization_id = target_organization_id;

  result := public.permanently_delete_organization_without_email_deliveries(
    target_organization_id,
    confirmation
  ) || jsonb_build_object('emailDeliveries', delivery_count);

  update public.platform_organization_deletion_audit
  set deleted_counts = result
  where id = (
    select id
    from public.platform_organization_deletion_audit
    where deleted_organization_id = target_organization_id
      and actor_user_id = actor
    order by created_at desc, id desc
    limit 1
  );

  return result;
end;
$$;

revoke all on function public.preview_organization_reset(uuid, uuid) from public, anon;
revoke all on function public.reset_organization_company_and_users(uuid, uuid, text) from public, anon;
revoke all on function public.preview_permanent_organization_deletion(uuid) from public, anon;
revoke all on function public.permanently_delete_organization(uuid, text) from public, anon;

grant execute on function public.preview_organization_reset(uuid, uuid) to authenticated;
grant execute on function public.reset_organization_company_and_users(uuid, uuid, text) to authenticated;
grant execute on function public.preview_permanent_organization_deletion(uuid) to authenticated;
grant execute on function public.permanently_delete_organization(uuid, text) to authenticated;

commit;
