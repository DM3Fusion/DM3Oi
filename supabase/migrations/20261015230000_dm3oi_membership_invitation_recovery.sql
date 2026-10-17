begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Phase 02A.4A: database-controlled invitation recovery state.
-- The existing invitation RPC remains unchanged during additive deployment.

-- Revision is incremented by the database for every membership UPDATE.
-- Recovery uses it to detect intervening changes, including updates that
-- do not modify role, status, or updated_at.
alter table public.organization_members
  add column membership_revision bigint not null default 0
  check (membership_revision >= 0);

create or replace function public.increment_organization_membership_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.membership_revision := old.membership_revision + 1;
  return new;
end;
$$;

revoke all
on function public.increment_organization_membership_revision()
from public, anon, authenticated, service_role;

create trigger organization_members_increment_revision
before update on public.organization_members
for each row
execute function public.increment_organization_membership_revision();


create table public.organization_membership_invitation_operations (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id) on delete restrict,

  membership_id uuid
    references public.organization_members(id) on delete set null,

  initiated_by uuid not null
    references public.profiles(id) on delete restrict,

  created_membership boolean not null,

  previous_role public.application_role,
  previous_status public.organization_membership_status,
  previous_is_active boolean,
  previous_verified_at timestamptz,
  previous_suspended_at timestamptz,
  previous_revoked_at timestamptz,
  previous_updated_at timestamptz,

  -- Captured by the preparation RPC after updating the membership.
  -- Recovery must match these values before changing membership state.
  expected_role public.application_role not null,
  expected_status public.organization_membership_status not null
    default 'INVITED',
  expected_is_active boolean not null default false,
  expected_verified_at timestamptz,
  expected_updated_at timestamptz not null,
  expected_membership_revision bigint not null
    check (expected_membership_revision >= 0),

  -- Random token identifying this specific preparation operation.
  -- Recovery must match the operation rather than relying on timestamps alone.
  operation_token uuid not null default gen_random_uuid(),

  status text not null default 'PREPARED'
    check (
      status in (
        'PREPARED',
        'COMPLETED',
        'ROLLED_BACK',
        'RECOVERY_RETAINED'
      )
    ),

  created_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint membership_invitation_operation_previous_state_check
    check (
      (
        created_membership
        and previous_role is null
        and previous_status is null
        and previous_is_active is null
        and previous_verified_at is null
        and previous_suspended_at is null
        and previous_revoked_at is null
        and previous_updated_at is null
      )
      or
      (
        not created_membership
        and previous_role is not null
        and previous_status is not null
        and previous_is_active is not null
      )
    )
);

create index organization_membership_invitation_operations_member_idx
on public.organization_membership_invitation_operations (
  membership_id,
  created_at desc
);

create index organization_membership_invitation_operations_org_idx
on public.organization_membership_invitation_operations (
  organization_id,
  created_at desc
);

-- Associate invitation delivery attempts with their preparation.
-- Other application emails leave this nullable reference unset.
alter table public.email_deliveries
  add column invitation_operation_id uuid
  references public.organization_membership_invitation_operations(id)
  on delete restrict;

create index email_deliveries_invitation_operation_idx
on public.email_deliveries (invitation_operation_id)
where invitation_operation_id is not null;

create or replace function public.validate_invitation_delivery_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_operation public.organization_membership_invitation_operations;
begin
  -- Once a delivery is associated with an invitation operation,
  -- its recovery identity and invitation context cannot be changed.
  if tg_op = 'UPDATE'
     and old.invitation_operation_id is not null
     and (
       new.invitation_operation_id is distinct from
         old.invitation_operation_id
       or new.organization_id is distinct from old.organization_id
       or new.membership_id is distinct from old.membership_id
       or new.template_key is distinct from old.template_key
     ) then
    raise exception 'invitation delivery association is immutable'
      using errcode = '23514';
  end if;

  if new.invitation_operation_id is null then
    return new;
  end if;

  -- Serialize new delivery associations with completion and rollback.
  -- A finalized operation cannot acquire a new delivery claim.
  select operation.*
  into invitation_operation
  from public.organization_membership_invitation_operations operation
  where operation.id = new.invitation_operation_id
  for update;

  if not found
     or new.organization_id is distinct from invitation_operation.organization_id
     or new.membership_id is distinct from invitation_operation.membership_id
     or new.template_key not in (
       'ORGANIZATION_USER_INVITATION',
       'ORGANIZATION_USER_INVITATION_RESEND'
     ) then
    raise exception 'invitation delivery operation mismatch'
      using errcode = '23514';
  end if;

  -- A new delivery claim must belong to an unfinished operation.
  -- Existing delivery audit updates remain permitted after completion.
  if tg_op = 'INSERT'
     and invitation_operation.status <> 'PREPARED' then
    raise exception 'invitation operation is already finalized'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and new.invitation_operation_id is distinct from
         old.invitation_operation_id
     and invitation_operation.status <> 'PREPARED' then
    raise exception 'cannot attach delivery to finalized invitation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter function public.validate_invitation_delivery_operation()
owner to postgres;

revoke all
on function public.validate_invitation_delivery_operation()
from public, anon, authenticated, service_role;

create trigger email_deliveries_validate_invitation_operation
before insert or update of
  invitation_operation_id,
  organization_id,
  membership_id,
  template_key
on public.email_deliveries
for each row
execute function public.validate_invitation_delivery_operation();


-- Only one unfinished preparation may exist per membership.
create unique index organization_membership_invitation_one_prepared_idx
on public.organization_membership_invitation_operations (membership_id)
where status = 'PREPARED' and membership_id is not null;

alter table public.organization_membership_invitation_operations
  enable row level security;

-- No client-side table access. SECURITY DEFINER RPCs will own mutations.
revoke all
on public.organization_membership_invitation_operations
from public, anon, authenticated, service_role;


-- Phase 02A.4A: operation-aware invitation preparation.
-- Keep the original RPC available during application migration.
create or replace function public.prepare_organization_membership_invitation_v2(
  organization_id uuid,
  user_id uuid,
  role public.application_role
)
returns table (
  membership_id uuid,
  operation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.application_role;
  previous_membership public.organization_members;
  prepared_membership public.organization_members;
  prepared_operation_id uuid;
  existing_membership boolean := false;
begin
  if actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if $1 is null or $2 is null then
    raise exception 'organization and user are required'
      using errcode = '22023';
  end if;

  if $3 is null
     or $3 not in ('BUSINESS_ADMIN', 'STAFF_MANAGER', 'STAFF_USER') then
    raise exception 'invalid organization invitation role'
      using errcode = '22023';
  end if;

  -- Fail authorization before touching or locking the target identity.
  -- The original preparation RPC repeats these checks as the authoritative
  -- mutation boundary after this wrapper captures the prior state.
  select member.role
  into actor_role
  from public.organization_members member
  join public.profiles profile
    on profile.id = member.user_id
  join public.organizations organization
    on organization.id = member.organization_id
  where member.organization_id = $1
    and member.user_id = actor
    and member.status = 'ACTIVE'
    and member.is_active
    and profile.is_active
    and organization.status = 'ACTIVE'
  for share of member, profile, organization;

  if actor_role is null
     or not public.has_effective_organization_permission($1, 'MANAGE_USERS') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if actor_role = 'BUSINESS_OWNER' then
    if $3 not in ('BUSINESS_ADMIN', 'STAFF_MANAGER', 'STAFF_USER') then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  elsif actor_role = 'BUSINESS_ADMIN' then
    if $3 not in ('STAFF_MANAGER', 'STAFF_USER') then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  else
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Serialize preparations for this identity.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'organization-membership-invitation:' || $2::text,
      0
    )
  );

  select member.*
  into previous_membership
  from public.organization_members member
  where member.user_id = $2
  for update;

  existing_membership := found;

  if existing_membership and exists (
    select 1
    from public.organization_membership_invitation_operations operation
    where operation.membership_id = previous_membership.id
      and operation.status = 'PREPARED'
  ) then
    raise exception 'an invitation preparation is already pending'
      using errcode = '23514';
  end if;

  -- The original RPC performs authoritative authorization and
  -- membership eligibility checks. Both calls share this transaction.
  select *
  into prepared_membership
  from public.prepare_organization_membership_invitation(
    $1, $2, $3
  );

  if prepared_membership.id is null then
    raise exception 'invitation preparation failed'
      using errcode = 'P0002';
  end if;

  insert into public.organization_membership_invitation_operations (
    organization_id,
    membership_id,
    initiated_by,
    created_membership,
    previous_role,
    previous_status,
    previous_is_active,
    previous_verified_at,
    previous_suspended_at,
    previous_revoked_at,
    previous_updated_at,
    expected_role,
    expected_status,
    expected_is_active,
    expected_verified_at,
    expected_updated_at,
    expected_membership_revision
  )
  values (
    $1,
    prepared_membership.id,
    actor,
    not existing_membership,
    case when existing_membership then previous_membership.role else null end,
    case when existing_membership then previous_membership.status else null end,
    case when existing_membership then previous_membership.is_active else null end,
    case when existing_membership then previous_membership.verified_at else null end,
    case when existing_membership then previous_membership.suspended_at else null end,
    case when existing_membership then previous_membership.revoked_at else null end,
    case when existing_membership then previous_membership.updated_at else null end,
    prepared_membership.role,
    prepared_membership.status,
    prepared_membership.is_active,
    prepared_membership.verified_at,
    prepared_membership.updated_at,
    prepared_membership.membership_revision
  )
  returning id into prepared_operation_id;

  return query
  select prepared_membership.id, prepared_operation_id;
end;
$$;

alter function public.prepare_organization_membership_invitation_v2(
  uuid,
  uuid,
  public.application_role
) owner to postgres;

revoke all
on function public.prepare_organization_membership_invitation_v2(
  uuid,
  uuid,
  public.application_role
)
from public, anon, authenticated, service_role;

grant execute
on function public.prepare_organization_membership_invitation_v2(
  uuid,
  uuid,
  public.application_role
)
to authenticated;



-- Finalize a successfully delivered invitation.
-- Completion does not modify organization_members.
create or replace function public.complete_organization_membership_invitation(
  target_operation_id uuid,
  target_initiator_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_record public.organization_membership_invitation_operations;
begin
  -- Completion is performed by the trusted server after SMTP acceptance.
  if auth.role() is distinct from 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_operation_id is null or target_initiator_id is null then
    raise exception 'operation and initiator are required'
      using errcode = '22023';
  end if;

  select operation.*
  into operation_record
  from public.organization_membership_invitation_operations operation
  where operation.id = target_operation_id
  for update;

  if not found then
    raise exception 'invitation operation not found'
      using errcode = 'P0002';
  end if;

  if operation_record.initiated_by <> target_initiator_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if operation_record.status = 'COMPLETED' then
    return;
  end if;

  if operation_record.status <> 'PREPARED' then
    raise exception 'invitation operation cannot be completed'
      using errcode = '23514';
  end if;

  -- Verification may legitimately advance the membership after delivery.
  -- Require continued membership identity, not an unchanged revision.
  if not exists (
    select 1
    from public.organization_members member
    where member.id = operation_record.membership_id
      and member.organization_id = operation_record.organization_id
  ) then
    raise exception 'invitation membership no longer exists'
      using errcode = 'P0002';
  end if;

  update public.organization_membership_invitation_operations operation
  set status = 'COMPLETED',
      completed_at = now()
  where operation.id = target_operation_id;
end;
$$;

alter function public.complete_organization_membership_invitation(uuid, uuid)
owner to postgres;

revoke all
on function public.complete_organization_membership_invitation(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.complete_organization_membership_invitation(uuid, uuid)
to service_role;

-- Server-only recovery after a confirmed invitation preparation/delivery failure.
create or replace function public.rollback_organization_membership_invitation(
  target_operation_id uuid,
  target_initiator_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_record public.organization_membership_invitation_operations;
  current_membership public.organization_members;
begin
  -- SECURITY DEFINER changes current_user to the function owner.
  -- Check the request's authenticated database role instead.
  if auth.role() is distinct from 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_operation_id is null or target_initiator_id is null then
    raise exception 'operation and initiator are required'
      using errcode = '22023';
  end if;

  select operation.*
  into operation_record
  from public.organization_membership_invitation_operations operation
  where operation.id = target_operation_id
  for update;

  if not found then
    raise exception 'invitation operation not found'
      using errcode = 'P0002';
  end if;

  if operation_record.initiated_by <> target_initiator_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if operation_record.status = 'ROLLED_BACK' then
    return case
      when operation_record.created_membership
        then 'ROLLED_BACK_DELETED'
      else 'ROLLED_BACK_RESTORED'
    end;
  end if;

  if operation_record.status = 'RECOVERY_RETAINED' then
    return 'RECOVERY_RETAINED';
  end if;

  if operation_record.status <> 'PREPARED' then
    raise exception 'invitation operation cannot be rolled back'
      using errcode = '23514';
  end if;

  select member.*
  into current_membership
  from public.organization_members member
  where member.id = operation_record.membership_id
    and member.organization_id = operation_record.organization_id
  for update;

  if not found then
    raise exception 'membership no longer exists'
      using errcode = 'P0002';
  end if;

  if current_membership.membership_revision
       <> operation_record.expected_membership_revision
     or current_membership.role
       is distinct from operation_record.expected_role
     or current_membership.status
       is distinct from operation_record.expected_status
     or current_membership.is_active
       is distinct from operation_record.expected_is_active
     or current_membership.verified_at
       is distinct from operation_record.expected_verified_at
     or current_membership.updated_at
       is distinct from operation_record.expected_updated_at then
    raise exception 'membership changed after invitation preparation'
      using errcode = '23514';
  end if;

  -- Never reverse a membership when tracked delivery indicates
  -- SMTP acceptance or an unresolved delivery attempt.
  if exists (
    select 1
    from public.email_deliveries delivery
    where delivery.organization_id = operation_record.organization_id
      and delivery.invitation_operation_id = target_operation_id
      and delivery.delivery_status in ('SENT', 'PENDING')
  ) then
    raise exception 'invitation delivery is accepted or unresolved'
      using errcode = '23514';
  end if;

  if operation_record.created_membership then
    -- Retain inactive membership when delivery or audit history references it.
    -- The operation records that invitation recovery did not delete the row.
    if exists (
      select 1
      from public.email_deliveries delivery
      where delivery.organization_id = operation_record.organization_id
        and delivery.membership_id = current_membership.id
    ) or exists (
      select 1
      from public.organization_membership_events event
      where event.organization_id = operation_record.organization_id
        and event.membership_id = current_membership.id
    ) then
      if current_membership.status <> 'INVITED'
         or current_membership.is_active then
        raise exception 'membership is not safely inactive'
          using errcode = '23514';
      end if;

      update public.organization_membership_invitation_operations operation
      set status = 'RECOVERY_RETAINED',
          completed_at = now()
      where operation.id = target_operation_id;

      return 'RECOVERY_RETAINED';
    end if;

    -- Other operational dependencies remain protected by foreign keys.
    -- Role-history records are intentionally retained.
    delete from public.organization_members member
    where member.id = current_membership.id
      and member.organization_id = operation_record.organization_id;
  else
    update public.organization_members member
    set
      role = operation_record.previous_role,
      status = operation_record.previous_status,
      is_active = operation_record.previous_is_active,
      verified_at = operation_record.previous_verified_at,
      suspended_at = operation_record.previous_suspended_at,
      revoked_at = operation_record.previous_revoked_at,
      updated_at = operation_record.previous_updated_at
    where member.id = current_membership.id
      and member.organization_id = operation_record.organization_id;
  end if;

  update public.organization_membership_invitation_operations operation
  set status = 'ROLLED_BACK',
      completed_at = now()
  where operation.id = target_operation_id;

  return case
    when operation_record.created_membership
      then 'ROLLED_BACK_DELETED'
    else 'ROLLED_BACK_RESTORED'
  end;
end;
$$;

alter function public.rollback_organization_membership_invitation(uuid, uuid)
owner to postgres;

revoke all
on function public.rollback_organization_membership_invitation(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.rollback_organization_membership_invitation(uuid, uuid)
to service_role;


commit;
