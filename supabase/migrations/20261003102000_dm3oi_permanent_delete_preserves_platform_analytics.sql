begin;

create or replace function public.preview_permanent_organization_deletion(
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

  return (result - 'analyticsPageViews') || jsonb_build_object(
    'emailDeliveries',
    (
      select count(*)
      from public.email_deliveries
      where organization_id = target_organization_id
    )
  );
end;
$$;

-- This is the active implementation called by the public email-delivery wrapper.
-- Durable page views remain in place; deleting organizations only detaches their
-- nullable live FK while analytics_organization_key preserves attribution.
create or replace function public.permanently_delete_organization_without_email_deliveries(
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

  select * into organization_record
  from public.organizations
  where id = target_organization_id
  for update;

  if not found then
    raise exception 'organization not found' using errcode = '22023';
  end if;

  if confirmation is distinct from ('DELETE ' || organization_record.name) then
    raise exception 'confirmation text does not match organization name'
      using errcode = '22023';
  end if;

  perform public.preview_permanent_organization_deletion(target_organization_id);

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

  select o.avatar_path into organization_avatar_path
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

  update public.trial_requests
  set
    converted_organization_deleted_id = organization_record.id,
    converted_organization_deleted_name = organization_record.name,
    converted_organization_deleted_slug = organization_record.slug,
    converted_organization_id = null
  where converted_organization_id = target_organization_id;
  get diagnostics deleted_count = row_count;
  counts := counts || jsonb_build_object('trialRequestLinksDetached', deleted_count);

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
      'status', case
        when cardinality(identity_candidate_user_ids) = 0 then 'NOT_REQUIRED'
        else 'PENDING'
      end,
      'candidateUserIds', identity_candidate_json,
      'deletedUserIds', jsonb_build_array(),
      'retainedUserIds', jsonb_build_array(),
      'failedUserIds', jsonb_build_array()
    ),
    jsonb_build_object(
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
    raise exception 'organization deletion failed' using errcode = 'P0001';
  end if;

  return counts || jsonb_build_object(
    'deletionAuditId', deletion_audit_id,
    'identityCleanupCandidateUserIds', identity_candidate_json,
    'organizationAvatarPath', organization_avatar_path
  );
end;
$$;

revoke all on function public.preview_permanent_organization_deletion(uuid)
  from public, anon;
grant execute on function public.preview_permanent_organization_deletion(uuid)
  to authenticated;

revoke all on function public.permanently_delete_organization_without_email_deliveries(uuid, text)
  from public, anon, authenticated;

commit;
