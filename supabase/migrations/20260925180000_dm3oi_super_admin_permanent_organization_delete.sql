-- DM3Oi: SUPER_ADMIN permanent organization deletion
--
-- This migration introduces a deliberately separate lifecycle from
-- Reset Company & Users.
--
-- Permanent deletion:
--   * removes the organization and all organization-owned data/configuration;
--   * preserves durable platform audit history outside the organization FK;
--   * preserves trial-request history while detaching the deleted organization;
--   * captures identity cleanup candidates for trusted post-commit Auth cleanup;
--   * never deletes auth.users or profiles directly.
--
-- Supabase Auth and Storage cleanup are performed by the trusted server after
-- this database transaction commits and are reconciled through the durable
-- deletion audit.

-- Historical reset audits must survive permanent deletion of an organization.
alter table public.platform_organization_reset_audit
  drop constraint if exists platform_organization_reset_audit_organization_id_fkey;

-- A converted Trial Request is platform history and must survive deletion of
-- the organization that was originally created from it. Keep the live FK while
-- the organization exists, and snapshot the organization identity before that
-- FK is detached by permanent deletion.
alter table public.trial_requests
  add column if not exists converted_organization_deleted_id uuid,
  add column if not exists converted_organization_deleted_name text,
  add column if not exists converted_organization_deleted_slug text;

-- The original anonymous CHECK from the Trial Request foundation requires a
-- live converted_organization_id for every CONVERTED request. Replace only the
-- CHECK that references converted_organization_id with a historical-safe
-- contract. This block deliberately discovers the generated constraint name
-- rather than assuming PostgreSQL's anonymous CHECK name.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select c.conname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t
      on t.oid = c.conrelid
    join pg_catalog.pg_namespace n
      on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'trial_requests'
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid)
        ilike '%converted_organization_id%'
  loop
    execute format(
      'alter table public.trial_requests drop constraint %I',
      constraint_record.conname
    );
  end loop;
end
$$;

alter table public.trial_requests
  add constraint trial_requests_converted_history_check
  check (
    status <> 'CONVERTED'
    or (
      converted_at is not null
      and (
        (
          converted_organization_id is not null
          and converted_organization_deleted_id is null
          and converted_organization_deleted_name is null
          and converted_organization_deleted_slug is null
        )
        or (
          converted_organization_id is null
          and converted_organization_deleted_id is not null
          and converted_organization_deleted_name is not null
          and converted_organization_deleted_slug is not null
        )
      )
    )
  );

create table if not exists public.platform_organization_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  deleted_organization_id uuid not null,
  organization_name text not null,
  organization_slug text not null,
  actor_user_id uuid not null,
  deletion_type text not null default 'PERMANENT'
    check (deletion_type = 'PERMANENT'),
  deleted_counts jsonb not null default '{}'::jsonb,
  identity_cleanup jsonb not null default jsonb_build_object(
    'status', 'NOT_REQUIRED',
    'candidateUserIds', jsonb_build_array(),
    'deletedUserIds', jsonb_build_array(),
    'retainedUserIds', jsonb_build_array(),
    'failedUserIds', jsonb_build_array()
  ),
  storage_cleanup jsonb not null default jsonb_build_object(
    'status', 'NOT_REQUIRED',
    'organizationAvatarPath', null,
    'organizationAvatarSourcePrefix', null,
    'deletedPaths', jsonb_build_array(),
    'failedPaths', jsonb_build_array()
  ),
  created_at timestamptz not null default now(),
  cleanup_updated_at timestamptz not null default now()
);

alter table public.platform_organization_deletion_audit enable row level security;

drop policy if exists platform_organization_deletion_audit_super_admin_read
  on public.platform_organization_deletion_audit;

create policy platform_organization_deletion_audit_super_admin_read
on public.platform_organization_deletion_audit
for select
to authenticated
using (public.is_super_admin(auth.uid()));

grant select on table public.platform_organization_deletion_audit to authenticated;

-- Extend the existing immutable-message guard only for the transaction-local
-- permanent organization deletion window. Normal message deletion remains
-- prohibited.
create or replace function public.guard_service_request_message_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if (
      current_setting(
        'dm3oi.organization_reset_organization_id',
        true
      ) = old.organization_id::text
      or
      current_setting(
        'dm3oi.organization_delete_organization_id',
        true
      ) = old.organization_id::text
    )
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


create or replace function public.preview_permanent_organization_deletion(
  target_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  organization_record public.organizations;
  result jsonb;
  identity_candidate_user_ids uuid[];
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'active SUPER_ADMIN authorization required'
      using errcode = '42501';
  end if;

  select *
  into organization_record
  from public.organizations
  where id = target_organization_id;

  if not found then
    raise exception 'organization not found'
      using errcode = '22023';
  end if;

  select coalesce(
    array_agg(candidate.user_id order by candidate.user_id),
    array[]::uuid[]
  )
  into identity_candidate_user_ids
  from (
    select om.user_id
    from public.organization_members om
    where om.organization_id = target_organization_id

    union

    select cpu.user_id
    from public.customer_portal_users cpu
    where cpu.organization_id = target_organization_id
  ) candidate
  where candidate.user_id <> actor;

  result := jsonb_build_object(
    'organizationId', organization_record.id,
    'organizationName', organization_record.name,
    'organizationSlug', organization_record.slug,
    'identityCleanupCandidates', cardinality(identity_candidate_user_ids),
    'organizationUsers',
      (select count(*) from public.organization_members
       where organization_id = target_organization_id),
    'customerPortalUsers',
      (select count(*) from public.customer_portal_users
       where organization_id = target_organization_id),
    'customers',
      (select count(*) from public.customers
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
    'membershipEvents',
      (select count(*) from public.organization_membership_events
       where organization_id = target_organization_id),
    'questionDefinitions',
      (select count(*) from public.question_definitions
       where organization_id = target_organization_id),
    'questionOptions',
      (select count(*) from public.question_options
       where organization_id = target_organization_id),
    'ruleDefinitions',
      (select count(*) from public.rule_definitions
       where organization_id = target_organization_id),
    'ruleActions',
      (select count(*) from public.rule_actions
       where organization_id = target_organization_id),
    'caseTypes',
      (select count(*) from public.organization_case_types
       where organization_id = target_organization_id),
    'lifecycleStatuses',
      (select count(*) from public.organization_lifecycle_statuses
       where organization_id = target_organization_id),
    'rolePermissions',
      (select count(*) from public.organization_role_permissions
       where organization_id = target_organization_id),
    'organizationSettings',
      (select count(*) from public.organization_settings
       where organization_id = target_organization_id),
    'licenses',
      (select count(*) from public.organization_licenses
       where organization_id = target_organization_id),
    'licenseEvents',
      (select count(*) from public.organization_license_events
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
       where organization_id = target_organization_id),
    'resetAuditRows',
      (select count(*) from public.platform_organization_reset_audit
       where organization_id = target_organization_id),
    'trialRequestLinks',
      (select count(*) from public.trial_requests
       where converted_organization_id = target_organization_id)
  );

  return result;
end;
$$;

revoke all on function public.preview_permanent_organization_deletion(uuid)
  from public, anon;

grant execute on function public.preview_permanent_organization_deletion(uuid)
  to authenticated;


create or replace function public.permanently_delete_organization(
  target_organization_id uuid,
  confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  organization_record public.organizations;
  counts jsonb := '{}'::jsonb;
  deleted_count integer;
  deletion_audit_id uuid;
  identity_candidate_user_ids uuid[];
  identity_candidate_json jsonb;
  organization_avatar_path text;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'active SUPER_ADMIN authorization required'
      using errcode = '42501';
  end if;

  select *
  into organization_record
  from public.organizations
  where id = target_organization_id
  for update;

  if not found then
    raise exception 'organization not found'
      using errcode = '22023';
  end if;

  if confirmation is distinct from ('DELETE ' || organization_record.name) then
    raise exception 'confirmation text does not match organization name'
      using errcode = '22023';
  end if;

  -- Revalidate immediately before mutation.
  perform public.preview_permanent_organization_deletion(
    target_organization_id
  );

  select coalesce(
    array_agg(candidate.user_id order by candidate.user_id),
    array[]::uuid[]
  )
  into identity_candidate_user_ids
  from (
    select om.user_id
    from public.organization_members om
    where om.organization_id = target_organization_id

    union

    select cpu.user_id
    from public.customer_portal_users cpu
    where cpu.organization_id = target_organization_id
  ) candidate
  where candidate.user_id <> actor;

  select coalesce(
    jsonb_agg(candidate_id order by candidate_id),
    '[]'::jsonb
  )
  into identity_candidate_json
  from unnest(identity_candidate_user_ids) candidate_id;

  select o.avatar_path
  into organization_avatar_path
  from public.organizations o
  where o.id = target_organization_id;

  counts := jsonb_build_object(
    'organizationId', organization_record.id,
    'organizationName', organization_record.name,
    'organizationSlug', organization_record.slug,
    'identityCleanupCandidates', cardinality(identity_candidate_user_ids)
  );

  perform pg_catalog.set_config(
    'dm3oi.organization_delete_organization_id',
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

  perform pg_catalog.set_config(
    'dm3oi.organization_delete_organization_id',
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

  -- Rules must be removed before Questions because of RESTRICT lineage FKs.
  delete from public.rule_actions
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('ruleActions', deleted_count);

  delete from public.rule_definitions
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('ruleDefinitions', deleted_count);

  delete from public.question_options
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('questionOptions', deleted_count);

  delete from public.question_definitions
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('questionDefinitions', deleted_count);

  delete from public.organization_members
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('organizationUsers', deleted_count);

  delete from public.analytics_live_sessions
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('analyticsLiveSessions', deleted_count);

  delete from public.analytics_page_views
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('analyticsPageViews', deleted_count);

  -- Preserve the conversion as durable platform history before detaching the
  -- live organization FK. The historical snapshot satisfies the converted
  -- Trial Request invariant after the organization row is removed.
  update public.trial_requests
  set
    converted_organization_deleted_id = organization_record.id,
    converted_organization_deleted_name = organization_record.name,
    converted_organization_deleted_slug = organization_record.slug,
    converted_organization_id = null
  where converted_organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object(
    'trialRequestLinksDetached',
    deleted_count
  );

  /*
   * These tables have ON DELETE CASCADE to organizations. Their current
   * row counts are recorded before the organization row is removed.
   */
  counts := counts || jsonb_build_object(
    'caseTypes',
      (select count(*) from public.organization_case_types
       where organization_id = target_organization_id),
    'lifecycleStatuses',
      (select count(*) from public.organization_lifecycle_statuses
       where organization_id = target_organization_id),
    'rolePermissions',
      (select count(*) from public.organization_role_permissions
       where organization_id = target_organization_id),
    'organizationSettings',
      (select count(*) from public.organization_settings
       where organization_id = target_organization_id),
    'licenses',
      (select count(*) from public.organization_licenses
       where organization_id = target_organization_id),
    'licenseEvents',
      (select count(*) from public.organization_license_events
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
       where organization_id = target_organization_id)
  );

  insert into public.platform_organization_deletion_audit (
    deleted_organization_id,
    organization_name,
    organization_slug,
    actor_user_id,
    deleted_counts,
    identity_cleanup,
    storage_cleanup
  )
  values (
    organization_record.id,
    organization_record.name,
    organization_record.slug,
    actor,
    counts,
    jsonb_build_object(
      'status',
        case
          when cardinality(identity_candidate_user_ids) = 0
            then 'NOT_REQUIRED'
          else 'PENDING'
        end,
      'candidateUserIds', identity_candidate_json,
      'deletedUserIds', jsonb_build_array(),
      'retainedUserIds', jsonb_build_array(),
      'failedUserIds', jsonb_build_array()
    ),
    jsonb_build_object(
      -- Storage is reconciled post-commit by the trusted server for every
      -- organization. Even when avatar_path is null, an interrupted upload may
      -- have left source objects beneath the organization UUID prefix.
      'status', 'PENDING',
      'organizationAvatarPath', organization_avatar_path,
      'organizationAvatarSourcePrefix', target_organization_id::text || '/',
        'deletedPaths', jsonb_build_array(),
      'failedPaths', jsonb_build_array()
    )
  )
  returning id into deletion_audit_id;

  delete from public.organizations
  where id = target_organization_id;

  if not found then
    raise exception 'organization deletion failed'
      using errcode = 'P0001';
  end if;

  return counts || jsonb_build_object(
    'deletionAuditId', deletion_audit_id,
    'identityCleanupCandidateUserIds', identity_candidate_json,
    'organizationAvatarPath', organization_avatar_path
  );
end;
$$;

revoke all on function public.permanently_delete_organization(uuid, text)
  from public, anon;

grant execute on function public.permanently_delete_organization(uuid, text)
  to authenticated;


create or replace function public.complete_permanent_organization_deletion_cleanup(
  target_deletion_audit_id uuid,
  deleted_user_ids uuid[],
  retained_user_ids uuid[],
  failed_user_ids uuid[],
  storage_status text,
  storage_deleted_paths text[],
  storage_failed_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_record public.platform_organization_deletion_audit;
  expected_ids uuid[];
  supplied_ids uuid[];
  identity_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role authorization required'
      using errcode = '42501';
  end if;

  select *
  into audit_record
  from public.platform_organization_deletion_audit
  where id = target_deletion_audit_id
  for update;

  if not found then
    raise exception 'organization deletion audit not found'
      using errcode = '22023';
  end if;

  select coalesce(
    array_agg(value::uuid order by value::uuid),
    array[]::uuid[]
  )
  into expected_ids
  from jsonb_array_elements_text(
    audit_record.identity_cleanup -> 'candidateUserIds'
  ) value;

  select coalesce(
    array_agg(distinct candidate order by candidate),
    array[]::uuid[]
  )
  into supplied_ids
  from unnest(
    coalesce(deleted_user_ids, array[]::uuid[]) ||
    coalesce(retained_user_ids, array[]::uuid[]) ||
    coalesce(failed_user_ids, array[]::uuid[])
  ) candidate;

  if supplied_ids is distinct from expected_ids then
    raise exception 'identity cleanup result does not exactly partition candidates'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(deleted_user_ids, array[]::uuid[])) d
    join unnest(coalesce(retained_user_ids, array[]::uuid[])) r
      on r = d
  )
  or exists (
    select 1
    from unnest(coalesce(deleted_user_ids, array[]::uuid[])) d
    join unnest(coalesce(failed_user_ids, array[]::uuid[])) f
      on f = d
  )
  or exists (
    select 1
    from unnest(coalesce(retained_user_ids, array[]::uuid[])) r
    join unnest(coalesce(failed_user_ids, array[]::uuid[])) f
      on f = r
  ) then
    raise exception 'identity cleanup result sets overlap'
      using errcode = '22023';
  end if;

  identity_status :=
    case
      when cardinality(expected_ids) = 0 then 'NOT_REQUIRED'
      when cardinality(coalesce(failed_user_ids, array[]::uuid[])) > 0
        then 'PARTIAL'
      else 'COMPLETE'
    end;

  if storage_status not in ('NOT_REQUIRED', 'COMPLETE', 'PARTIAL') then
    raise exception 'invalid storage cleanup status'
      using errcode = '22023';
  end if;

  update public.platform_organization_deletion_audit
  set
    identity_cleanup = jsonb_build_object(
      'status', identity_status,
      'candidateUserIds', audit_record.identity_cleanup -> 'candidateUserIds',
      'deletedUserIds', to_jsonb(coalesce(deleted_user_ids, array[]::uuid[])),
      'retainedUserIds', to_jsonb(coalesce(retained_user_ids, array[]::uuid[])),
      'failedUserIds', to_jsonb(coalesce(failed_user_ids, array[]::uuid[]))
    ),
    storage_cleanup =
      coalesce(audit_record.storage_cleanup, '{}'::jsonb)
      || jsonb_build_object(
        'status', storage_status,
        'deletedPaths', to_jsonb(coalesce(storage_deleted_paths, array[]::text[])),
        'failedPaths', to_jsonb(coalesce(storage_failed_paths, array[]::text[]))
      ),
    cleanup_updated_at = now()
  where id = target_deletion_audit_id
  returning *
  into audit_record;

  return jsonb_build_object(
    'deletionAuditId', audit_record.id,
    'identityCleanup', audit_record.identity_cleanup,
    'storageCleanup', audit_record.storage_cleanup
  );
end;
$$;

revoke all on function public.complete_permanent_organization_deletion_cleanup(
  uuid,
  uuid[],
  uuid[],
  uuid[],
  text,
  text[],
  text[]
) from public, anon, authenticated;

grant execute on function public.complete_permanent_organization_deletion_cleanup(
  uuid,
  uuid[],
  uuid[],
  uuid[],
  text,
  text[],
  text[]
) to service_role;
