-- DM3Oi SUPER_ADMIN organization reset.
-- Preserves organization configuration and one selected BUSINESS_OWNER while
-- removing organization transactional/test data and all other access paths.

create table if not exists public.platform_organization_reset_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  organization_name text not null,
  -- Historical identity UUIDs intentionally have no profile FK so the
  -- durable reset audit survives later account/profile lifecycle cleanup.
  preserved_owner_user_id uuid not null,
  actor_user_id uuid not null,
  reset_type text not null default 'COMPANY_AND_USERS'
    check (reset_type = 'COMPANY_AND_USERS'),
  deleted_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.platform_organization_reset_audit enable row level security;

revoke all on table public.platform_organization_reset_audit
  from public, anon, authenticated;

create policy platform_organization_reset_audit_super_admin_read
on public.platform_organization_reset_audit
for select
to authenticated
using (public.is_super_admin(auth.uid()));

grant select on table public.platform_organization_reset_audit to authenticated;


-- Preserve normal service-request message immutability while permitting
-- deletion only inside this guarded SUPER_ADMIN reset transaction.
create or replace function public.guard_service_request_message_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting(
         'dm3oi.organization_reset_organization_id',
         true
       ) = old.organization_id::text
       and public.is_super_admin(auth.uid()) then
      return old;
    end if;

    raise exception 'service request messages are immutable'
      using errcode = '42501';
  end if;

  if new.organization_id is distinct from old.organization_id
    or new.service_request_id is distinct from old.service_request_id
    or new.author_user_id is distinct from old.author_user_id
    or new.author_type is distinct from old.author_type
    or new.body is distinct from old.body
    or new.created_at is distinct from old.created_at then
    raise exception 'service request messages are immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


create or replace function public.preview_organization_reset(
  target_organization_id uuid,
  preserved_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  organization_record public.organizations;
  owner_membership public.organization_members;
  result jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select *
  into organization_record
  from public.organizations
  where id = target_organization_id;

  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  select *
  into owner_membership
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = preserved_owner_user_id
    and role = 'BUSINESS_OWNER'::public.application_role
    and status = 'ACTIVE'
    and is_active = true;

  if not found then
    raise exception 'preserved user must be an active BUSINESS_OWNER'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'organizationId', organization_record.id,
    'organizationName', organization_record.name,
    'preservedOwnerUserId', preserved_owner_user_id,

    'customers',
      (select count(*) from public.customers
       where organization_id = target_organization_id),

    'customerPortalUsers',
      (select count(*) from public.customer_portal_users
       where organization_id = target_organization_id),

    'cases',
      (select count(*) from public.cases
       where organization_id = target_organization_id),

    'caseTasks',
      (select count(*) from public.case_tasks
       where organization_id = target_organization_id),

    'caseActivity',
      (select count(*) from public.case_activity
       where organization_id = target_organization_id),

    'caseAssignments',
      (select count(*) from public.case_assignments
       where organization_id = target_organization_id),

    'caseQuestions',
      (select count(*) from public.case_questions
       where organization_id = target_organization_id),

    'caseQuestionResponses',
      (select count(*) from public.case_question_responses
       where organization_id = target_organization_id),

    'serviceRequests',
      (select count(*) from public.service_requests
       where organization_id = target_organization_id),

    'serviceRequestMessages',
      (select count(*) from public.service_request_messages
       where organization_id = target_organization_id),

    'serviceRequestActivity',
      (select count(*) from public.service_request_activity
       where organization_id = target_organization_id),

    'serviceRequestCommunications',
      (select count(*) from public.service_request_communications
       where organization_id = target_organization_id),

    'notifications',
      (select count(*) from public.notifications
       where organization_id = target_organization_id),

    'organizationUsersRemoved',
      (select count(*)
       from public.organization_members
       where organization_id = target_organization_id
         and user_id <> preserved_owner_user_id),

    'membershipEvents',
      (select count(*) from public.organization_membership_events
       where organization_id = target_organization_id),

    'caseNumberCounters',
      (select count(*) from public.organization_case_number_counters
       where organization_id = target_organization_id),

    'customerAnnualNumberCounters',
      (select count(*) from public.organization_customer_annual_number_counters
       where organization_id = target_organization_id),

    'customerNumberCounters',
      (select count(*) from public.organization_customer_number_counters
       where organization_id = target_organization_id),

    'serviceRequestAnnualNumberCounters',
      (select count(*) from public.organization_service_request_annual_number_counters
       where organization_id = target_organization_id),

    'analyticsLiveSessions',
      (select count(*) from public.analytics_live_sessions
       where organization_id = target_organization_id),

    'analyticsPageViews',
      (select count(*) from public.analytics_page_views
       where organization_id = target_organization_id)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.preview_organization_reset(uuid, uuid)
  from public, anon;

grant execute on function public.preview_organization_reset(uuid, uuid)
  to authenticated;


create or replace function public.reset_organization_company_and_users(
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
  actor uuid := auth.uid();
  organization_record public.organizations;
  owner_membership public.organization_members;
  counts jsonb;
  deleted_count bigint;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select *
  into organization_record
  from public.organizations
  where id = target_organization_id
  for update;

  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  if confirmation_text <> ('RESET ' || organization_record.name) then
    raise exception 'confirmation text does not match'
      using errcode = '22023';
  end if;

  select *
  into owner_membership
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = preserved_owner_user_id
    and role = 'BUSINESS_OWNER'::public.application_role
    and status = 'ACTIVE'
    and is_active = true
  for update;

  if not found then
    raise exception 'preserved user must be an active BUSINESS_OWNER'
      using errcode = '22023';
  end if;

  -- Revalidate the reset contract immediately before mutation.
  perform public.preview_organization_reset(
    target_organization_id,
    preserved_owner_user_id
  );

  -- From this point forward, counts records rows actually deleted rather
  -- than the pre-reset preview.
  counts := jsonb_build_object(
    'organizationId', organization_record.id,
    'organizationName', organization_record.name,
    'preservedOwnerUserId', preserved_owner_user_id
  );

  -- Transaction-local flag. The message immutability trigger remains enabled
  -- and independently rechecks active SUPER_ADMIN authorization.
  perform pg_catalog.set_config(
    'dm3oi.organization_reset_organization_id',
    target_organization_id::text,
    true
  );

  delete from public.service_request_communications
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('serviceRequestCommunications', deleted_count);

  delete from public.service_request_activity
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('serviceRequestActivity', deleted_count);

  delete from public.service_request_messages
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('serviceRequestMessages', deleted_count);

  -- End the exceptional message-delete window immediately.
  perform pg_catalog.set_config(
    'dm3oi.organization_reset_organization_id',
    '',
    true
  );

  delete from public.service_requests
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('serviceRequests', deleted_count);

  delete from public.case_activity
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('caseActivity', deleted_count);

  delete from public.case_question_responses
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('caseQuestionResponses', deleted_count);

  delete from public.case_questions
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('caseQuestions', deleted_count);

  delete from public.case_assignments
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('caseAssignments', deleted_count);

  delete from public.case_tasks
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('caseTasks', deleted_count);

  delete from public.cases
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('cases', deleted_count);

  delete from public.customer_portal_users
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('customerPortalUsers', deleted_count);

  delete from public.customers
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('customers', deleted_count);

  delete from public.notifications
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('notifications', deleted_count);

  delete from public.organization_membership_events
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('membershipEvents', deleted_count);

  delete from public.organization_members
  where organization_id = target_organization_id
    and user_id <> preserved_owner_user_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('organizationUsersRemoved', deleted_count);

  delete from public.organization_case_number_counters
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('caseNumberCounters', deleted_count);

  delete from public.organization_customer_annual_number_counters
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('customerAnnualNumberCounters', deleted_count);

  delete from public.organization_customer_number_counters
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('customerNumberCounters', deleted_count);

  delete from public.organization_service_request_annual_number_counters
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('serviceRequestAnnualNumberCounters', deleted_count);

  delete from public.analytics_live_sessions
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('analyticsLiveSessions', deleted_count);

  delete from public.analytics_page_views
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('analyticsPageViews', deleted_count);

  insert into public.platform_organization_reset_audit (
    organization_id,
    organization_name,
    preserved_owner_user_id,
    actor_user_id,
    reset_type,
    deleted_counts
  )
  values (
    target_organization_id,
    organization_record.name,
    preserved_owner_user_id,
    actor,
    'COMPANY_AND_USERS',
    counts
  );

  return counts;
end;
$$;

revoke all on function public.reset_organization_company_and_users(uuid, uuid, text)
  from public, anon;

grant execute on function public.reset_organization_company_and_users(uuid, uuid, text)
  to authenticated;
