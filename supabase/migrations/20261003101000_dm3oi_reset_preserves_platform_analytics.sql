begin;

-- The public preview remains signature-compatible with the deployed app while
-- removing durable page views from reset-owned data.
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
  result jsonb;
begin
  result := public.preview_organization_reset_without_customer_import_submissions(
    target_organization_id,
    preserved_owner_user_id
  );

  return (result - 'analyticsPageViews') || jsonb_build_object(
    'customerImportSubmissions',
    (
      select count(*)
      from public.customer_import_submissions
      where organization_id = target_organization_id
    )
  );
end;
$$;

-- This is the active innermost reset implementation called by the later email
-- and Customer-import wrappers. Live presence is transient and is still reset;
-- analytics_page_views is deliberately absent from the destructive statements.
create or replace function public.reset_organization_company_and_users_without_email_deliveries(
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

  select * into organization_record
  from public.organizations
  where id = target_organization_id
  for update;

  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  if confirmation_text <> ('RESET ' || organization_record.name) then
    raise exception 'confirmation text does not match' using errcode = '22023';
  end if;

  select * into owner_membership
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

  select coalesce(
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
      'status', case
        when cardinality(identity_candidate_user_ids) = 0 then 'NOT_REQUIRED'
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

revoke all on function public.preview_organization_reset(uuid, uuid)
  from public, anon;
grant execute on function public.preview_organization_reset(uuid, uuid)
  to authenticated;

revoke all on function public.reset_organization_company_and_users_without_email_deliveries(uuid, uuid, text)
  from public, anon, authenticated;

commit;
