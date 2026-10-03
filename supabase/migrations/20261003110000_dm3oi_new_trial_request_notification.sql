begin;

-- Add the tracked email template used when a new public Trial Request is
-- submitted for platform-administrator review.

alter table public.platform_email_templates
  drop constraint if exists platform_email_templates_template_key_check;

alter table public.platform_email_templates
  add constraint platform_email_templates_template_key_check
  check (
    template_key in (
      'ORGANIZATION_USER_INVITATION',
      'ORGANIZATION_USER_INVITATION_RESEND',
      'CUSTOMER_PORTAL_INVITATION',
      'MISSING_DOCUMENTS_NOTICE',
      'SIGN_IN_CODE',
      'NEW_SERVICE_REQUEST_NOTIFICATION',
      'CUSTOMER_DATA_SUBMISSION_NOTIFICATION',
      'NEW_TRIAL_REQUEST_NOTIFICATION'
    )
  );

alter table public.email_deliveries
  add column trial_request_id uuid
  references public.trial_requests(id)
  on delete set null;

create index email_deliveries_trial_request_idx
  on public.email_deliveries (trial_request_id)
  where trial_request_id is not null;


create or replace function public.email_template_content_is_safe(
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
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'role',
        'action_url'
      ]
    when 'ORGANIZATION_USER_INVITATION_RESEND' then
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'role',
        'action_url'
      ]
    when 'CUSTOMER_PORTAL_INVITATION' then
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'action_url'
      ]
    when 'MISSING_DOCUMENTS_NOTICE' then
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'case_number',
        'missing_documents',
        'action_url'
      ]
    when 'SIGN_IN_CODE' then
      array[
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'sign_in_code',
        'action_url'
      ]
    when 'NEW_SERVICE_REQUEST_NOTIFICATION' then
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'service_request_number',
        'customer_name',
        'request_subject',
        'action_url'
      ]
    when 'CUSTOMER_DATA_SUBMISSION_NOTIFICATION' then
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'uploader_name',
        'uploader_email',
        'filename',
        'submitted_at',
        'action_url'
      ]
    when 'NEW_TRIAL_REQUEST_NOTIFICATION' then
      array[
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'trial_request_number',
        'business_name',
        'contact_name',
        'business_email',
        'phone',
        'primary_use_case',
        'estimated_users',
        'action_url'
      ]
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

  remainder := pg_catalog.regexp_replace(
    target_content,
    '\{\{[a-z_]+\}\}',
    '',
    'g'
  );

  return pg_catalog.strpos(remainder, '{{') = 0
    and pg_catalog.strpos(remainder, '}}') = 0;
end;
$$;

revoke all on function public.email_template_content_is_safe(text, text)
  from public, anon, authenticated;


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
    'MISSING_DOCUMENTS_NOTICE',
    'SIGN_IN_CODE',
    'NEW_SERVICE_REQUEST_NOTIFICATION',
    'CUSTOMER_DATA_SUBMISSION_NOTIFICATION',
    'NEW_TRIAL_REQUEST_NOTIFICATION'
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
    target_subject_template
      || E'\n'
      || target_opening_message
      || E'\n'
      || target_closing_message
  ) then
    raise exception 'invalid email template variable' using errcode = '22023';
  end if;

  update public.platform_email_templates
  set
    subject_template = trim(target_subject_template),
    opening_message = trim(target_opening_message),
    closing_message = trim(target_closing_message),
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where template_key = target_template_key;

  return found;
end;
$$;

revoke all on function public.update_platform_email_template(
  text,
  text,
  text,
  text
) from public, anon;

grant execute on function public.update_platform_email_template(
  text,
  text,
  text,
  text
) to authenticated;


insert into public.platform_email_templates (
  template_key,
  subject_template,
  opening_message,
  closing_message
)
values (
  'NEW_TRIAL_REQUEST_NOTIFICATION',
  'New Trial Request #{{trial_request_number}} — {{business_name}}',
  'A new DM3Oi Trial Request was submitted by {{contact_name}} for {{business_name}}.',
  'Review the Trial Request in DM3Oi: {{action_url}}'
)
on conflict (template_key) do nothing;

commit;
