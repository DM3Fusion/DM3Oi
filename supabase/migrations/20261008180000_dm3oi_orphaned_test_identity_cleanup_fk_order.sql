begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

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
   * Clear Service Request identity references first.
   *
   * requester_user_id participates in the composite foreign key:
   * (organization_id, customer_id, requester_user_id)
   *   -> customer_portal_users(organization_id, customer_id, user_id)
   *
   * The Portal relationship therefore cannot be deleted until these
   * requester references have been detached.
   */
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
  where
    request.requester_user_id = target_user_id
    or request.assigned_user_id = target_user_id
    or request.created_by_user_id = target_user_id;

  get diagnostics service_requests_scrubbed = row_count;

  /*
   * Portal links can now be removed without violating requester-bound
   * Service Request integrity. Dependent Portal invitations cascade and
   * document-confirmation portal_access_id references become NULL through
   * their existing foreign-key actions.
   */
  delete from public.customer_portal_users portal_user
  where portal_user.user_id = target_user_id;

  get diagnostics portal_links_deleted = row_count;

  delete from public.service_request_activity activity
  where activity.actor_user_id = target_user_id;

  get diagnostics service_request_activity_deleted = row_count;

  /*
   * Service Request messages are immutable during normal application use.
   * Reuse the existing organization-scoped reset deletion window only for
   * messages authored by this selected orphaned identity.
   */
  for target_organization_id in
    select distinct message.organization_id
    from public.service_request_messages message
    where message.author_user_id = target_user_id
  loop
    perform set_config(
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

alter function public.super_admin_cleanup_orphaned_test_identity(uuid)
  owner to postgres;

revoke all
  on function public.super_admin_cleanup_orphaned_test_identity(uuid)
  from public, anon, authenticated;

grant execute
  on function public.super_admin_cleanup_orphaned_test_identity(uuid)
  to authenticated;

comment on function public.super_admin_cleanup_orphaned_test_identity(uuid) is
  'SUPER_ADMIN-only cleanup of Customer Portal and Service Desk references for an orphaned identity. Service Request requester references are detached before Portal access is removed, then the application re-runs the global deletion guard.';

commit;
