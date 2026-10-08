begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Preserve normal Service Request identity immutability while allowing one
-- narrowly-scoped SUPER_ADMIN test-identity cleanup operation:
-- created_by_user_id = selected orphaned test user -> NULL.
create or replace function public.guard_service_request_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleanup_organization_id text :=
    current_setting(
      'dm3oi.test_identity_cleanup_organization_id',
      true
    );
  cleanup_user_id text :=
    current_setting(
      'dm3oi.test_identity_cleanup_user_id',
      true
    );
  permitted_test_identity_cleanup boolean := false;
begin
  if tg_op = 'UPDATE' then
    permitted_test_identity_cleanup :=
      public.is_super_admin(auth.uid())
      and cleanup_organization_id = old.organization_id::text
      and cleanup_user_id = old.created_by_user_id::text
      and new.organization_id is not distinct from old.organization_id
      and new.request_number is not distinct from old.request_number
      and new.created_at is not distinct from old.created_at
      and old.created_by_user_id is not null
      and new.created_by_user_id is null;

    if (
      new.organization_id is distinct from old.organization_id
      or new.request_number is distinct from old.request_number
      or new.created_at is distinct from old.created_at
      or (
        old.created_by_user_id is not null
        and new.created_by_user_id is distinct from old.created_by_user_id
        and not permitted_test_identity_cleanup
      )
    ) then
      raise exception 'service request identity fields are immutable'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Recreate the cleanup RPC with the existing FK-safe ordering plus a
-- transaction-local, organization-and-user-specific creator cleanup window.
create or replace function public.super_admin_cleanup_orphaned_test_identity(
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_organization_id uuid;
  affected integer := 0;
  portal_links_deleted integer := 0;
  service_requests_scrubbed integer := 0;
  service_request_activity_deleted integer := 0;
  service_request_messages_deleted integer := 0;
  service_request_communications_deleted integer := 0;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'active SUPER_ADMIN authorization required'
      using errcode = '42501';
  end if;

  if target_user_id is null then
    raise exception 'target user is required'
      using errcode = '22023';
  end if;

  if target_user_id = actor then
    raise exception 'SUPER_ADMIN cannot delete own platform identity'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_user_id::text, 0)
  );

  if exists (
    select 1
    from public.organization_members membership
    where membership.user_id = target_user_id
  ) then
    raise exception 'target identity is not orphaned'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.platform_user_roles role_assignment
    where role_assignment.user_id = target_user_id
  ) then
    raise exception 'platform administrator identity cannot use test cleanup'
      using errcode = '23514';
  end if;

  /*
   * Process Service Requests one organization at a time so the immutable
   * creator field can be detached only for this exact target identity.
   */
  for target_organization_id in
    select distinct request.organization_id
    from public.service_requests request
    where
      request.requester_user_id = target_user_id
      or request.assigned_user_id = target_user_id
      or request.created_by_user_id = target_user_id
  loop
    perform pg_catalog.set_config(
      'dm3oi.test_identity_cleanup_organization_id',
      target_organization_id::text,
      true
    );

    perform pg_catalog.set_config(
      'dm3oi.test_identity_cleanup_user_id',
      target_user_id::text,
      true
    );

    update public.service_requests request
    set
      requester_user_id = case
        when request.requester_user_id = target_user_id then null
        else request.requester_user_id
      end,
      assigned_user_id = case
        when request.assigned_user_id = target_user_id then null
        else request.assigned_user_id
      end,
      created_by_user_id = case
        when request.created_by_user_id = target_user_id then null
        else request.created_by_user_id
      end
    where request.organization_id = target_organization_id
      and (
        request.requester_user_id = target_user_id
        or request.assigned_user_id = target_user_id
        or request.created_by_user_id = target_user_id
      );

    get diagnostics affected = row_count;

    service_requests_scrubbed :=
      service_requests_scrubbed + affected;

    perform pg_catalog.set_config(
      'dm3oi.test_identity_cleanup_organization_id',
      '',
      true
    );

    perform pg_catalog.set_config(
      'dm3oi.test_identity_cleanup_user_id',
      '',
      true
    );
  end loop;

  delete from public.customer_portal_users portal_user
  where portal_user.user_id = target_user_id;

  get diagnostics portal_links_deleted = row_count;

  delete from public.service_request_activity activity
  where activity.actor_user_id = target_user_id;

  get diagnostics service_request_activity_deleted = row_count;

  for target_organization_id in
    select distinct message.organization_id
    from public.service_request_messages message
    where message.author_user_id = target_user_id
  loop
    perform pg_catalog.set_config(
      'dm3oi.organization_reset_organization_id',
      target_organization_id::text,
      true
    );

    delete from public.service_request_messages message
    where message.organization_id = target_organization_id
      and message.author_user_id = target_user_id;

    get diagnostics affected = row_count;

    service_request_messages_deleted :=
      service_request_messages_deleted + affected;

    perform pg_catalog.set_config(
      'dm3oi.organization_reset_organization_id',
      '',
      true
    );
  end loop;

  delete from public.service_request_communications communication
  where communication.actor_user_id = target_user_id
     or communication.recipient_user_id = target_user_id;

  get diagnostics service_request_communications_deleted = row_count;

  return jsonb_build_object(
    'targetUserId', target_user_id,
    'portalLinksDeleted', portal_links_deleted,
    'serviceRequestsScrubbed', service_requests_scrubbed,
    'serviceRequestActivityDeleted', service_request_activity_deleted,
    'serviceRequestMessagesDeleted', service_request_messages_deleted,
    'serviceRequestCommunicationsDeleted',
      service_request_communications_deleted
  );
end;
$$;

alter function public.guard_service_request_identity()
  owner to postgres;

alter function public.super_admin_cleanup_orphaned_test_identity(uuid)
  owner to postgres;

revoke all
  on function public.super_admin_cleanup_orphaned_test_identity(uuid)
  from public, anon, authenticated;

grant execute
  on function public.super_admin_cleanup_orphaned_test_identity(uuid)
  to authenticated;

comment on function public.super_admin_cleanup_orphaned_test_identity(uuid) is
  'SUPER_ADMIN-only cleanup of an orphaned test identity. Service Request creator immutability is bypassed only transaction-locally for the exact target organization and user before the global deletion guard is re-run.';

commit;
