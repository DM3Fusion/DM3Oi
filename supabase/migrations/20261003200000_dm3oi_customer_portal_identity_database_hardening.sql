begin;

set local lock_timeout='5s';
set local statement_timeout='60s';

-- Serialize identity-bearing writes while legacy active links are reconciled.
-- The locks are held only for this transactional migration and prevent a stale
-- link or invitation from racing the cleanup/index/trigger installation.
lock table auth.users,
  public.profiles,
  public.customers,
  public.customer_portal_users,
  public.customer_portal_invitations
in share row exclusive mode;

-- Rank only identities proven to match the Customer's current email through
-- both public.profiles and auth.users. Newest is only a tie-breaker among
-- matching identities; an unmatched identity is never preserved by recency.
create temporary table dm3oi_portal_identity_survivors
on commit drop
as
with matching_active_identities as (
  select
    access.id,
    row_number() over (
      partition by access.organization_id,access.customer_id
      order by access.updated_at desc,access.created_at desc,access.id
    ) as identity_rank
  from public.customer_portal_users access
  join public.customers customer
    on customer.organization_id=access.organization_id
   and customer.id=access.customer_id
  join public.profiles profile
    on profile.id=access.user_id
   and profile.is_active
  join auth.users auth_user
    on auth_user.id=access.user_id
  where access.is_active
    and nullif(lower(btrim(customer.email)),'') is not null
    and lower(btrim(profile.email))=lower(btrim(customer.email))
    and lower(btrim(auth_user.email))=lower(btrim(customer.email))
)
select id
from matching_active_identities
where identity_rank=1;

create temporary table dm3oi_superseded_portal_identities
on commit drop
as
select
  access.id,
  access.organization_id,
  access.customer_id,
  access.user_id
from public.customer_portal_users access
where access.is_active
  and not exists (
    select 1
    from dm3oi_portal_identity_survivors survivor
    where survivor.id=access.id
  );

update public.customer_portal_users access
set is_active=false
from dm3oi_superseded_portal_identities superseded
where access.id=superseded.id
  and access.organization_id=superseded.organization_id
  and access.customer_id=superseded.customer_id
  and access.user_id=superseded.user_id
  and access.is_active;

update public.customer_portal_invitations invitation
set status='CANCELLED'
from dm3oi_superseded_portal_identities superseded
where invitation.organization_id=superseded.organization_id
  and invitation.customer_id=superseded.customer_id
  and invitation.user_id=superseded.user_id
  and invitation.status in ('PENDING','SENT');

-- Historical inactive links remain available for audit/reactivation, but only
-- one row per organization/customer may be active at any instant.
create unique index customer_portal_users_one_active_identity_uidx
on public.customer_portal_users(organization_id,customer_id)
where is_active=true;

-- Central effective-access predicate used by Customer, Service Request,
-- conversation, and organization-projection RLS/view chains. auth.users stays
-- behind this boolean SECURITY DEFINER boundary and is never exposed.
create or replace function public.is_customer_portal_user(
  check_organization_id uuid,
  check_customer_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select check_user_id is not null
    and check_user_id=auth.uid()
    and exists (
      select 1
      from public.customer_portal_users access
      join public.customers customer
        on customer.organization_id=access.organization_id
       and customer.id=access.customer_id
       and customer.status='ACTIVE'
      join public.profiles profile
        on profile.id=access.user_id
       and profile.is_active
      join auth.users auth_user
        on auth_user.id=access.user_id
      join public.organizations organization
        on organization.id=access.organization_id
       and organization.status='ACTIVE'
      left join public.organization_settings settings
        on settings.organization_id=access.organization_id
      where access.organization_id=check_organization_id
        and access.customer_id=check_customer_id
        and access.user_id=check_user_id
        and access.is_active
        and nullif(lower(btrim(customer.email)),'') is not null
        and lower(btrim(profile.email))=lower(btrim(customer.email))
        and lower(btrim(auth_user.email))=lower(btrim(customer.email))
        and coalesce(settings.portal_enabled,true)
    )
$$;

alter function public.is_customer_portal_user(uuid,uuid,uuid)
  owner to postgres;
revoke all on function public.is_customer_portal_user(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.is_customer_portal_user(uuid,uuid,uuid)
  to authenticated;

-- Portal-facing SECURITY DEFINER RPCs retain their account-selector and
-- tenant/customer checks, and now also require the central effective-identity
-- predicate before returning data or mutating workflow state.
create or replace function public.create_customer_service_request(
  target_portal_access_id uuid,
  target_subject text,
  target_description text
)
returns public.service_requests
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  link public.customer_portal_users;
  customer public.customers;
  created public.service_requests;
  request_number text;
  settings_row public.organization_settings;
begin
  if actor is null then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select access.*
  into link
  from public.customer_portal_users access
  where access.id=target_portal_access_id
    and access.user_id=actor
    and access.is_active;

  if not found then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if not public.is_customer_portal_user(
    link.organization_id,
    link.customer_id,
    actor
  ) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select settings.*
  into settings_row
  from public.organization_settings settings
  where settings.organization_id=link.organization_id;

  if coalesce(settings_row.portal_enabled,true)=false then
    raise exception 'customer portal is unavailable' using errcode='42501';
  end if;

  if coalesce(settings_row.portal_submission_enabled,true)=false then
    raise exception 'customer portal submissions are disabled'
      using errcode='42501';
  end if;

  select customer_row.*
  into customer
  from public.customers customer_row
  join public.organizations organization
    on organization.id=customer_row.organization_id
  where customer_row.id=link.customer_id
    and customer_row.organization_id=link.organization_id
    and customer_row.status='ACTIVE'
    and organization.status='ACTIVE';

  if not found then
    raise exception 'customer portal access is inactive'
      using errcode='42501';
  end if;

  if target_subject is null
    or length(trim(target_subject))=0
    or target_description is null
    or length(trim(target_description))=0
  then
    raise exception 'subject and description are required'
      using errcode='22023';
  end if;

  request_number:=public.allocate_service_request_number(link.organization_id);

  insert into public.service_requests(
    organization_id,
    request_number,
    customer_id,
    requester_user_id,
    created_by_user_id,
    subject,
    description,
    status,
    priority,
    assigned_user_id,
    created_at,
    updated_at
  )
  values(
    link.organization_id,
    request_number,
    link.customer_id,
    actor,
    actor,
    trim(target_subject),
    trim(target_description),
    'NEW',
    'NORMAL',
    null,
    now(),
    now()
  )
  returning * into created;

  insert into public.service_request_activity(
    organization_id,
    service_request_id,
    event_type,
    actor_user_id,
    new_value,
    metadata
  )
  values(
    created.organization_id,
    created.id,
    'CREATED',
    actor,
    jsonb_build_object('status','NEW','priority','NORMAL'),
    jsonb_build_object('request_number',created.request_number)
  );

  return created;
end
$$;

alter function public.create_customer_service_request(uuid,text,text)
  owner to postgres;
revoke all on function public.create_customer_service_request(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.create_customer_service_request(uuid,text,text)
  to authenticated;

create or replace function public.get_customer_portal_cases(
  target_portal_access_id uuid
)
returns table(
  case_number text,
  service_label text,
  customer_status text,
  progress_percent integer,
  intake_finalized boolean,
  tax_outcome text
)
language sql
stable
security definer
set search_path=''
as $$
  with authorized_portal_access as (
    select
      access.organization_id,
      access.customer_id
    from public.customer_portal_users access
    join public.profiles profile
      on profile.id=access.user_id
     and profile.is_active
    join public.organizations organization
      on organization.id=access.organization_id
     and organization.status='ACTIVE'
    join public.customers customer
      on customer.id=access.customer_id
     and customer.organization_id=access.organization_id
     and customer.status='ACTIVE'
    left join public.organization_settings settings
      on settings.organization_id=access.organization_id
    where access.id=target_portal_access_id
      and access.user_id=auth.uid()
      and access.is_active
      and coalesce(settings.portal_enabled,true)
      and public.is_customer_portal_user(
        access.organization_id,
        access.customer_id,
        auth.uid()
      )
  )
  select
    item.case_number,
    item.case_type as service_label,
    case item.status
      when 'NEW' then 'Getting Started'
      when 'UNASSIGNED' then 'Getting Started'
      when 'ASSIGNED' then 'Getting Started'
      when 'IN_PROGRESS' then 'In Progress'
      when 'WAITING' then 'Waiting'
      when 'REVIEW' then 'Under Review'
      when 'COMPLETED' then 'Completed'
    end as customer_status,
    case
      when item.status='COMPLETED' then 100
      else greatest(0,least(100,progress.percentage))
    end as progress_percent,
    exists(
      select 1
      from public.guided_case_intake_drafts draft
      where draft.organization_id=item.organization_id
        and draft.case_id=item.id
        and draft.finalized_at is not null
    ) as intake_finalized,
    item.tax_outcome
  from authorized_portal_access access
  join public.cases item
    on item.organization_id=access.organization_id
   and item.customer_id=access.customer_id
  cross join lateral public.get_case_progress(item.id) progress
  where item.status not in ('CLOSED','CANCELLED')
  order by
    case when item.status='COMPLETED' then 1 else 0 end,
    item.opened_at desc,
    item.case_number desc
$$;

alter function public.get_customer_portal_cases(uuid)
  owner to postgres;
revoke all on function public.get_customer_portal_cases(uuid)
  from public,anon,authenticated;
grant execute on function public.get_customer_portal_cases(uuid)
  to authenticated;

create or replace function public.get_customer_portal_case_requirements(
  target_portal_access_id uuid
)
returns table(
  task_id uuid,
  case_number text,
  missing_documents jsonb,
  reported_sent_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  with authorized_portal_access as (
    select access.organization_id,access.customer_id
    from public.customer_portal_users access
    join public.profiles profile
      on profile.id=access.user_id
     and profile.is_active
    join public.organizations organization
      on organization.id=access.organization_id
     and organization.status='ACTIVE'
    join public.customers customer
      on customer.id=access.customer_id
     and customer.organization_id=access.organization_id
     and customer.status='ACTIVE'
    left join public.organization_settings settings
      on settings.organization_id=access.organization_id
    where access.id=target_portal_access_id
      and access.user_id=auth.uid()
      and access.is_active
      and coalesce(settings.portal_enabled,true)
      and public.is_customer_portal_user(
        access.organization_id,
        access.customer_id,
        auth.uid()
      )
  )
  select
    task.id,
    item.case_number,
    task.intake_requirement_context->'missing_option_labels',
    confirmation.reported_sent_at
  from authorized_portal_access access
  join public.cases item
    on item.organization_id=access.organization_id
   and item.customer_id=access.customer_id
  join public.case_tasks task
    on task.organization_id=item.organization_id
   and task.case_id=item.id
  left join public.case_document_confirmations confirmation
    on confirmation.task_id=task.id
  where item.status not in ('COMPLETED','CLOSED','CANCELLED')
    and task.status='WAITING_ON_CUSTOMER'
    and task.intake_follow_up_id is not null
    and task.intake_question_definition_id is not null
    and coalesce(
      task.intake_requirement_context->>'kind',''
    )='DOCUMENT_REQUIREMENT'
    and jsonb_typeof(
      task.intake_requirement_context->'missing_option_labels'
    )='array'
    and jsonb_array_length(
      task.intake_requirement_context->'missing_option_labels'
    )>0
  order by item.opened_at desc,item.case_number desc,task.sequence
$$;

alter function public.get_customer_portal_case_requirements(uuid)
  owner to postgres;
revoke all on function public.get_customer_portal_case_requirements(uuid)
  from public,anon,authenticated;
grant execute on function public.get_customer_portal_case_requirements(uuid)
  to authenticated;

create or replace function public.report_customer_case_documents_sent(
  target_portal_access_id uuid,
  target_task_id uuid
)
returns table(
  confirmation_id uuid,
  case_number text,
  task_id uuid,
  reported_sent_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  access_row public.customer_portal_users;
  case_row public.cases;
  task_row public.case_tasks;
  customer_name text;
  confirmation public.case_document_confirmations;
  recipient record;
  document_labels text;
begin
  if actor is null then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select access.*
  into access_row
  from public.customer_portal_users access
  join public.profiles profile
    on profile.id=access.user_id
   and profile.is_active
  join public.organizations organization
    on organization.id=access.organization_id
   and organization.status='ACTIVE'
  join public.customers customer
    on customer.id=access.customer_id
   and customer.organization_id=access.organization_id
   and customer.status='ACTIVE'
  left join public.organization_settings settings
    on settings.organization_id=access.organization_id
  where access.id=target_portal_access_id
    and access.user_id=actor
    and access.is_active
    and coalesce(settings.portal_enabled,true)
    and public.is_customer_portal_user(
      access.organization_id,
      access.customer_id,
      actor
    );

  if not found then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select item.*
  into case_row
  from public.cases item
  join public.case_tasks task
    on task.organization_id=item.organization_id
   and task.case_id=item.id
  where task.id=target_task_id
    and item.organization_id=access_row.organization_id
    and item.customer_id=access_row.customer_id;

  if not found then
    raise exception 'document requirement not found'
      using errcode='P0002';
  end if;

  select task.*
  into task_row
  from public.case_tasks task
  where task.id=target_task_id
    and task.organization_id=case_row.organization_id
    and task.case_id=case_row.id
    and task.intake_follow_up_id is not null
    and task.intake_question_definition_id is not null
    and jsonb_typeof(
      task.intake_requirement_context->'missing_option_labels'
    )='array'
    and jsonb_array_length(
      task.intake_requirement_context->'missing_option_labels'
    )>0;

  if not found then
    raise exception 'document requirement not found'
      using errcode='P0002';
  end if;

  select existing.*
  into confirmation
  from public.case_document_confirmations existing
  where existing.task_id=task_row.id;

  if found then
    return query
    select
      confirmation.id,
      case_row.case_number,
      confirmation.task_id,
      confirmation.reported_sent_at;
    return;
  end if;

  if case_row.status in ('COMPLETED','CLOSED','CANCELLED')
    or task_row.status <> 'IN_PROGRESS'
  then
    raise exception 'document requirement is not awaiting confirmation'
      using errcode='23514';
  end if;

  select customer.name
  into customer_name
  from public.customers customer
  where customer.organization_id=access_row.organization_id
    and customer.id=access_row.customer_id;

  select string_agg(label,', ' order by ordinal)
  into document_labels
  from jsonb_array_elements_text(
    task_row.intake_requirement_context->'missing_option_labels'
  ) with ordinality as labels(label,ordinal);

  insert into public.case_document_confirmations(
    organization_id,
    case_id,
    task_id,
    customer_id,
    portal_access_id,
    reported_by_user_id
  )
  values(
    case_row.organization_id,
    case_row.id,
    task_row.id,
    access_row.customer_id,
    access_row.id,
    actor
  )
  on conflict on constraint case_document_confirmations_task_key
    do nothing
  returning *
  into confirmation;

  if confirmation.id is null then
    select existing.*
    into confirmation
    from public.case_document_confirmations existing
    where existing.task_id=task_row.id;

    return query
    select
      confirmation.id,
      case_row.case_number,
      confirmation.task_id,
      confirmation.reported_sent_at;
    return;
  end if;

  for recipient in
    select distinct assignment.user_id
    from public.case_assignments assignment
    join public.organization_members member
      on member.organization_id=assignment.organization_id
     and member.user_id=assignment.user_id
     and member.is_active
     and member.role in (
       'BUSINESS_OWNER',
       'BUSINESS_ADMIN',
       'STAFF_MANAGER',
       'STAFF_USER'
     )
    join public.profiles profile
      on profile.id=assignment.user_id
     and profile.is_active
    where assignment.organization_id=case_row.organization_id
      and assignment.case_id=case_row.id
      and assignment.is_active
      and assignment.assignment_role in ('MANAGER','STAFF')
  loop
    perform public.create_notification(
      case_row.organization_id,
      recipient.user_id,
      'DOCUMENTS_REPORTED_SENT',
      'CASE',
      coalesce(customer_name,'Customer') || ' reported documents sent',
      case_row.case_number || ' · ' || coalesce(document_labels,'Documents'),
      'TASK',
      task_row.id,
      confirmation.id,
      '/cases/' || case_row.id::text || '#task-' || task_row.id::text
    );
  end loop;

  return query
  select
    confirmation.id,
    case_row.case_number,
    confirmation.task_id,
    confirmation.reported_sent_at;
end
$$;

alter function public.report_customer_case_documents_sent(uuid,uuid)
  owner to postgres;
revoke all on function public.report_customer_case_documents_sent(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.report_customer_case_documents_sent(uuid,uuid)
  to authenticated;

create or replace function public.get_my_access_context(
  target_organization_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  actor_id uuid:=auth.uid();
  profile_row public.profiles%rowtype;
  super_admin boolean:=false;
  organizations_json jsonb:='[]'::jsonb;
  active_organization_id uuid:=null;
  active_role public.application_role:=null;
  permission_overrides_json jsonb:='[]'::jsonb;
  license_json jsonb:=null;
  customer_portal_ids_json jsonb:='[]'::jsonb;
begin
  if actor_id is null then
    return null;
  end if;

  select *
  into profile_row
  from public.profiles
  where id=actor_id;

  if profile_row.id is null or profile_row.is_active is not true then
    return null;
  end if;

  select public.is_super_admin(actor_id)
  into super_admin;

  if super_admin then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',organization.id,
          'name',organization.name,
          'slug',organization.slug,
          'avatar_path',organization.avatar_path,
          'avatar_updated_at',organization.avatar_updated_at,
          'role','SUPER_ADMIN'
        )
        order by organization.name
      ),
      '[]'::jsonb
    )
    into organizations_json
    from public.organizations organization
    where organization.status='ACTIVE';

    if target_organization_id is not null
      and exists (
        select 1
        from public.organizations organization
        where organization.id=target_organization_id
          and organization.status='ACTIVE'
      )
    then
      active_organization_id:=target_organization_id;
      active_role:='SUPER_ADMIN';
    end if;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',organization.id,
          'name',organization.name,
          'slug',organization.slug,
          'avatar_path',organization.avatar_path,
          'avatar_updated_at',organization.avatar_updated_at,
          'role',member.role
        )
        order by organization.name
      ),
      '[]'::jsonb
    )
    into organizations_json
    from public.organization_members member
    join public.organizations organization
      on organization.id=member.organization_id
    where member.user_id=actor_id
      and member.is_active
      and organization.status='ACTIVE';

    select
      member.organization_id,
      member.role
    into
      active_organization_id,
      active_role
    from public.organization_members member
    join public.organizations organization
      on organization.id=member.organization_id
    where member.user_id=actor_id
      and member.is_active
      and organization.status='ACTIVE'
      and (
        target_organization_id is null
        or member.organization_id=target_organization_id
      )
    order by
      case
        when target_organization_id is not null
          and member.organization_id=target_organization_id
        then 0
        else 1
      end,
      organization.name
    limit 1;

    if active_organization_id is null then
      select
        member.organization_id,
        member.role
      into
        active_organization_id,
        active_role
      from public.organization_members member
      join public.organizations organization
        on organization.id=member.organization_id
      where member.user_id=actor_id
        and member.is_active
        and organization.status='ACTIVE'
      order by organization.name
      limit 1;
    end if;
  end if;

  if active_organization_id is not null
    and active_role is not null
    and active_role <> 'SUPER_ADMIN'
  then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'role',permission.role,
          'permission',permission.permission,
          'is_allowed',permission.is_allowed
        )
        order by permission.permission
      ),
      '[]'::jsonb
    )
    into permission_overrides_json
    from public.organization_role_permissions permission
    where permission.organization_id=active_organization_id
      and permission.role=active_role;
  end if;

  if active_organization_id is not null then
    select jsonb_build_object(
      'license_status',license.license_status,
      'commercial_state',license.commercial_state,
      'starts_at',license.starts_at,
      'expires_at',license.expires_at,
      'grace_ends_at',license.grace_ends_at,
      'notice_days',license.notice_days,
      'notification_thresholds',license.notification_thresholds
    )
    into license_json
    from public.organization_licenses license
    where license.organization_id=active_organization_id
      and license.is_current
    limit 1;
  end if;

  select coalesce(
    jsonb_agg(access.customer_id order by access.customer_id),
    '[]'::jsonb
  )
  into customer_portal_ids_json
  from public.customer_portal_users access
  join public.organizations organization
    on organization.id=access.organization_id
  join public.customers customer
    on customer.id=access.customer_id
   and customer.organization_id=access.organization_id
  left join public.organization_settings settings
    on settings.organization_id=access.organization_id
  where access.user_id=actor_id
    and access.is_active
    and organization.status='ACTIVE'
    and customer.status='ACTIVE'
    and settings.portal_enabled is distinct from false
    and public.is_customer_portal_user(
      access.organization_id,
      access.customer_id,
      actor_id
    );

  return jsonb_build_object(
    'profile',
    jsonb_build_object(
      'id',profile_row.id,
      'display_name',profile_row.display_name,
      'first_name',profile_row.first_name,
      'last_name',profile_row.last_name,
      'email',profile_row.email,
      'title',profile_row.title,
      'avatar_path',profile_row.avatar_path,
      'avatar_updated_at',profile_row.avatar_updated_at,
      'is_active',profile_row.is_active
    ),
    'is_super_admin',super_admin,
    'organizations',organizations_json,
    'active_organization_id',active_organization_id,
    'active_role',active_role,
    'permission_overrides',permission_overrides_json,
    'license',license_json,
    'customer_portal_ids',customer_portal_ids_json
  );
end;
$function$;

alter function public.get_my_access_context(uuid)
  owner to postgres;
revoke all on function public.get_my_access_context(uuid)
  from public,anon,authenticated;
grant execute on function public.get_my_access_context(uuid)
  to authenticated;

-- Keep the proxy's "active portal" classification on the same authoritative
-- predicate. Without this replacement, an inactive Customer/organization or
-- disabled Portal could still be reported as active routing access.
create or replace function public.get_my_route_access_state()
returns table (
  profile_active boolean,
  has_active_super_admin_access boolean,
  has_active_organization_access boolean,
  has_active_customer_portal_access boolean,
  has_pending_organization_membership boolean
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor_id uuid:=auth.uid();
begin
  if actor_id is null then
    raise exception 'not authenticated' using errcode='42501';
  end if;

  return query
  select
    coalesce(
      (
        select profile.is_active
        from public.profiles profile
        where profile.id=actor_id
      ),
      false
    ),
    exists (
      select 1
      from public.platform_user_roles platform_role
      where platform_role.user_id=actor_id
        and platform_role.role='SUPER_ADMIN'
        and platform_role.is_active=true
    ),
    exists (
      select 1
      from public.organization_members member
      where member.user_id=actor_id
        and member.is_active=true
    ),
    exists (
      select 1
      from public.customer_portal_users portal_user
      where portal_user.user_id=actor_id
        and public.is_customer_portal_user(
          portal_user.organization_id,
          portal_user.customer_id,
          actor_id
        )
    ),
    exists (
      select 1
      from public.organization_members member
      join public.organizations organization
        on organization.id=member.organization_id
      where member.user_id=actor_id
        and member.is_active=false
        and member.status in ('INVITED','VERIFIED')
        and organization.status='ACTIVE'
    );
end
$$;

alter function public.get_my_route_access_state()
  owner to postgres;
revoke all on function public.get_my_route_access_state()
  from public,anon,authenticated;
grant execute on function public.get_my_route_access_state()
  to authenticated;

-- Active link rows are a database invariant consumed by existing locked-down
-- Customer Portal SECURITY DEFINER RPCs. The deferred guard permits legitimate
-- multi-step operations such as a same-transaction Customer merge, while every
-- committed active row must match Customer, Profile, and Auth identity email.
create or replace function public.enforce_customer_portal_identity_consistency()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  current_access public.customer_portal_users;
  customer_email text;
  profile_email text;
  profile_active boolean;
  auth_email text;
begin
  select access.*
  into current_access
  from public.customer_portal_users access
  where access.id=new.id;

  if not found or not current_access.is_active then
    return new;
  end if;

  select customer.email
  into customer_email
  from public.customers customer
  where customer.organization_id=current_access.organization_id
    and customer.id=current_access.customer_id
  for share;
  if not found then
    raise exception 'active Customer Portal link has no scoped Customer'
      using errcode='23514';
  end if;

  select profile.email,profile.is_active
  into profile_email,profile_active
  from public.profiles profile
  where profile.id=current_access.user_id
  for share;
  if not found then
    raise exception 'active Customer Portal link has no Profile identity'
      using errcode='23514';
  end if;

  select auth_user.email
  into auth_email
  from auth.users auth_user
  where auth_user.id=current_access.user_id
  for share;
  if not found then
    raise exception 'active Customer Portal link has no Auth identity'
      using errcode='23514';
  end if;

  if profile_active is not true
    or nullif(lower(btrim(customer_email)),'') is null
    or lower(btrim(profile_email)) is distinct from lower(btrim(customer_email))
    or lower(btrim(auth_email)) is distinct from lower(btrim(customer_email))
  then
    raise exception 'active Customer Portal identity does not match current Customer email'
      using errcode='23514';
  end if;

  return new;
end
$$;

alter function public.enforce_customer_portal_identity_consistency()
  owner to postgres;
revoke all on function public.enforce_customer_portal_identity_consistency()
  from public,anon,authenticated;

drop trigger if exists customer_portal_identity_consistency_guard
  on public.customer_portal_users;
create constraint trigger customer_portal_identity_consistency_guard
after insert or update of id,organization_id,customer_id,user_id,is_active
on public.customer_portal_users
deferrable initially deferred
for each row execute function public.enforce_customer_portal_identity_consistency();

-- Email/profile changes revoke stale links and their live invitation lifecycle
-- immediately. Each branch scopes cancellation through the exact retired
-- organization/customer/user tuple, preserving unrelated tenant access.
create or replace function public.retire_inconsistent_customer_portal_identities()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_table_schema='public' and tg_table_name='customers' then
    with retired as (
      update public.customer_portal_users access
      set is_active=false
      where access.organization_id=new.organization_id
        and access.customer_id=new.id
        and access.is_active
        and not exists (
          select 1
          from public.profiles profile
          join auth.users auth_user on auth_user.id=profile.id
          where profile.id=access.user_id
            and profile.is_active
            and nullif(lower(btrim(new.email)),'') is not null
            and lower(btrim(profile.email))=lower(btrim(new.email))
            and lower(btrim(auth_user.email))=lower(btrim(new.email))
        )
      returning access.organization_id,access.customer_id,access.user_id
    )
    update public.customer_portal_invitations invitation
    set status='CANCELLED'
    from retired
    where invitation.organization_id=retired.organization_id
      and invitation.customer_id=retired.customer_id
      and invitation.user_id=retired.user_id
      and invitation.status in ('PENDING','SENT');
  elsif tg_table_schema='public' and tg_table_name='profiles' then
    with retired as (
      update public.customer_portal_users access
      set is_active=false
      where access.user_id=new.id
        and access.is_active
        and not exists (
          select 1
          from public.customers customer
          join auth.users auth_user on auth_user.id=new.id
          where customer.organization_id=access.organization_id
            and customer.id=access.customer_id
            and new.is_active
            and nullif(lower(btrim(customer.email)),'') is not null
            and lower(btrim(new.email))=lower(btrim(customer.email))
            and lower(btrim(auth_user.email))=lower(btrim(customer.email))
        )
      returning access.organization_id,access.customer_id,access.user_id
    )
    update public.customer_portal_invitations invitation
    set status='CANCELLED'
    from retired
    where invitation.organization_id=retired.organization_id
      and invitation.customer_id=retired.customer_id
      and invitation.user_id=retired.user_id
      and invitation.status in ('PENDING','SENT');
  elsif tg_table_schema='auth' and tg_table_name='users' then
    with retired as (
      update public.customer_portal_users access
      set is_active=false
      where access.user_id=new.id
        and access.is_active
        and not exists (
          select 1
          from public.customers customer
          join public.profiles profile on profile.id=new.id
          where customer.organization_id=access.organization_id
            and customer.id=access.customer_id
            and profile.is_active
            and nullif(lower(btrim(customer.email)),'') is not null
            and lower(btrim(profile.email))=lower(btrim(customer.email))
            and lower(btrim(new.email))=lower(btrim(customer.email))
        )
      returning access.organization_id,access.customer_id,access.user_id
    )
    update public.customer_portal_invitations invitation
    set status='CANCELLED'
    from retired
    where invitation.organization_id=retired.organization_id
      and invitation.customer_id=retired.customer_id
      and invitation.user_id=retired.user_id
      and invitation.status in ('PENDING','SENT');
  end if;

  return new;
end
$$;

alter function public.retire_inconsistent_customer_portal_identities()
  owner to postgres;
revoke all on function public.retire_inconsistent_customer_portal_identities()
  from public,anon,authenticated;

drop trigger if exists customer_portal_customer_identity_retirement
  on public.customers;
create trigger customer_portal_customer_identity_retirement
after update of email on public.customers
for each row
when (old.email is distinct from new.email)
execute function public.retire_inconsistent_customer_portal_identities();

drop trigger if exists customer_portal_profile_identity_retirement
  on public.profiles;
create trigger customer_portal_profile_identity_retirement
after update of email,is_active on public.profiles
for each row
when (
  old.email is distinct from new.email
  or old.is_active is distinct from new.is_active
)
execute function public.retire_inconsistent_customer_portal_identities();

drop trigger if exists customer_portal_auth_identity_retirement
  on auth.users;
create trigger customer_portal_auth_identity_retirement
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.retire_inconsistent_customer_portal_identities();

-- A stale identity cannot even enumerate its historical link through REST.
-- Platform and organization administrators retain their existing visibility.
drop policy if exists portal_links_self_select
  on public.customer_portal_users;
create policy portal_links_self_select
on public.customer_portal_users
for select
to authenticated
using (
  (
    user_id=auth.uid()
    and public.is_customer_portal_user(
      organization_id,
      customer_id,
      auth.uid()
    )
  )
  or public.is_super_admin()
  or public.has_organization_role(
    organization_id,
    array['BUSINESS_ADMIN','BUSINESS_OWNER']::public.application_role[]
  )
);

comment on index public.customer_portal_users_one_active_identity_uidx is
  'Allows at most one active Customer Portal identity per organization/customer; inactive history remains available.';
comment on function public.is_customer_portal_user(uuid,uuid,uuid) is
  'Self-only effective Customer Portal authorization. Requires active tenant/customer/profile/link, enabled Portal, and normalized Customer/Profile/Auth email equality.';
comment on function public.get_my_route_access_state() is
  'Returns only the authenticated identity own minimum access flags for request routing, including identity-consistent effective Customer Portal access.';

commit;
