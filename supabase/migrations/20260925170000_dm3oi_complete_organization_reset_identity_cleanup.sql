-- DM3Oi complete organization reset identity cleanup.
--
-- Extends the SUPER_ADMIN organization reset so the server can permanently
-- remove identities that existed solely for the selected organization's test
-- activity while preserving identities that remain legitimate elsewhere.
--
-- The database transaction does NOT delete auth.users or profiles. It captures
-- reset identity candidates before organization access is removed and returns
-- those UUIDs to the trusted server action for fail-closed global eligibility
-- checks and Supabase Auth administration.

alter table public.platform_organization_reset_audit
  add column if not exists identity_cleanup jsonb
  not null
  default jsonb_build_object(
    'status', 'NOT_REQUIRED',
    'candidateUserIds', jsonb_build_array(),
    'deletedUserIds', jsonb_build_array(),
    'retainedUserIds', jsonb_build_array(),
    'failedUserIds', jsonb_build_array()
  );

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

    'identityCleanupCandidates',
      (
        select count(distinct candidate.user_id)
        from (
          select om.user_id
          from public.organization_members om
          where om.organization_id = target_organization_id
            and om.user_id <> preserved_owner_user_id

          union

          select cpu.user_id
          from public.customer_portal_users cpu
          where cpu.organization_id = target_organization_id
            and cpu.user_id <> preserved_owner_user_id
        ) candidate
      ),

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
  identity_candidate_user_ids uuid[];
  identity_candidate_json jsonb;
  reset_audit_id uuid;
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

  perform public.preview_organization_reset(
    target_organization_id,
    preserved_owner_user_id
  );

  /*
   * Capture all identities whose selected-organization access will disappear.
   * UNION deliberately deduplicates users who have both internal membership
   * and Customer Portal relationships.
   *
   * Permanent deletion is NOT decided here. The trusted server performs a
   * global, fail-closed dependency check after this transaction commits.
   */
  select
    coalesce(
      array_agg(candidate.user_id order by candidate.user_id),
      array[]::uuid[]
    )
  into identity_candidate_user_ids
  from (
    select om.user_id
    from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id <> preserved_owner_user_id

    union

    select cpu.user_id
    from public.customer_portal_users cpu
    where cpu.organization_id = target_organization_id
      and cpu.user_id <> preserved_owner_user_id
  ) candidate;

  select coalesce(
    jsonb_agg(candidate_id order by candidate_id),
    '[]'::jsonb
  )
  into identity_candidate_json
  from unnest(identity_candidate_user_ids) candidate_id;

  counts := jsonb_build_object(
    'organizationId', organization_record.id,
    'organizationName', organization_record.name,
    'preservedOwnerUserId', preserved_owner_user_id,
    'identityCleanupCandidates', cardinality(identity_candidate_user_ids)
  );

  perform pg_catalog.set_config(
    'dm3oi.organization_reset_organization_id',
    target_organization_id::text,
    true
  );

  delete from public.service_request_communications
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object(
    'serviceRequestCommunications', deleted_count
  );

  delete from public.service_request_activity
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object(
    'serviceRequestActivity', deleted_count
  );

  delete from public.service_request_messages
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object(
    'serviceRequestMessages', deleted_count
  );

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
  counts := counts || jsonb_build_object(
    'caseQuestionResponses', deleted_count
  );

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
  counts := counts || jsonb_build_object(
    'customerPortalUsers', deleted_count
  );

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
  counts := counts || jsonb_build_object(
    'organizationUsersRemoved', deleted_count
  );

  delete from public.organization_case_number_counters
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object(
    'caseNumberCounters', deleted_count
  );

  delete from public.organization_customer_annual_number_counters
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object(
    'customerAnnualNumberCounters', deleted_count
  );

  delete from public.organization_customer_number_counters
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object(
    'customerNumberCounters', deleted_count
  );

  delete from public.organization_service_request_annual_number_counters
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object(
    'serviceRequestAnnualNumberCounters', deleted_count
  );

  delete from public.analytics_live_sessions
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object(
    'analyticsLiveSessions', deleted_count
  );

  delete from public.analytics_page_views
  where organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object(
    'analyticsPageViews', deleted_count
  );

  insert into public.platform_organization_reset_audit (
    organization_id,
    organization_name,
    preserved_owner_user_id,
    actor_user_id,
    reset_type,
    deleted_counts,
    identity_cleanup
  )
  values (
    target_organization_id,
    organization_record.name,
    preserved_owner_user_id,
    actor,
    'COMPANY_AND_USERS',
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
    )
  )
  returning id into reset_audit_id;

  return counts || jsonb_build_object(
    'resetAuditId', reset_audit_id,
    'identityCleanupCandidateUserIds', identity_candidate_json
  );
end;
$$;

revoke all on function public.reset_organization_company_and_users(
  uuid,
  uuid,
  text
) from public, anon;

grant execute on function public.reset_organization_company_and_users(
  uuid,
  uuid,
  text
) to authenticated;


/*
 * Only the trusted service-role server may finalize identity cleanup results.
 * The function does not decide eligibility and does not delete identities.
 */
create or replace function public.complete_organization_reset_identity_cleanup(
  target_reset_audit_id uuid,
  deleted_user_ids uuid[],
  retained_user_ids uuid[],
  failed_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_cleanup jsonb;
  candidate_ids uuid[];
  supplied_ids uuid[];
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select identity_cleanup
  into existing_cleanup
  from public.platform_organization_reset_audit
  where id = target_reset_audit_id
  for update;

  if not found then
    raise exception 'reset audit not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(value::uuid order by value::uuid), array[]::uuid[])
  into candidate_ids
  from jsonb_array_elements_text(
    coalesce(existing_cleanup->'candidateUserIds', '[]'::jsonb)
  ) item(value);

  select coalesce(array_agg(distinct supplied_id order by supplied_id), array[]::uuid[])
  into supplied_ids
  from unnest(
    coalesce(deleted_user_ids, array[]::uuid[])
    ||
    coalesce(retained_user_ids, array[]::uuid[])
    ||
    coalesce(failed_user_ids, array[]::uuid[])
  ) supplied_id;

  if supplied_ids <> candidate_ids then
    raise exception 'identity cleanup result does not match reset candidates'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(deleted_user_ids, array[]::uuid[])) d
    join unnest(coalesce(retained_user_ids, array[]::uuid[])) r
      on r = d
  ) or exists (
    select 1
    from unnest(coalesce(deleted_user_ids, array[]::uuid[])) d
    join unnest(coalesce(failed_user_ids, array[]::uuid[])) f
      on f = d
  ) or exists (
    select 1
    from unnest(coalesce(retained_user_ids, array[]::uuid[])) r
    join unnest(coalesce(failed_user_ids, array[]::uuid[])) f
      on f = r
  ) then
    raise exception 'identity cleanup result sets overlap'
      using errcode = '22023';
  end if;

  update public.platform_organization_reset_audit
  set identity_cleanup = jsonb_build_object(
    'status',
      case
        when cardinality(coalesce(failed_user_ids, array[]::uuid[])) > 0
          then 'PARTIAL'
        else 'COMPLETE'
      end,
    'candidateUserIds', existing_cleanup->'candidateUserIds',
    'deletedUserIds', to_jsonb(coalesce(deleted_user_ids, array[]::uuid[])),
    'retainedUserIds', to_jsonb(coalesce(retained_user_ids, array[]::uuid[])),
    'failedUserIds', to_jsonb(coalesce(failed_user_ids, array[]::uuid[])),
    'completedAt', pg_catalog.clock_timestamp()
  )
  where id = target_reset_audit_id;
end;
$$;

revoke all on function public.complete_organization_reset_identity_cleanup(
  uuid,
  uuid[],
  uuid[],
  uuid[]
) from public, anon, authenticated;

grant execute on function public.complete_organization_reset_identity_cleanup(
  uuid,
  uuid[],
  uuid[],
  uuid[]
) to service_role;
