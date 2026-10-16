begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void
language plpgsql
as $$
begin
  if not value then
    raise exception 'assertion failed: %', message;
  end if;
end
$$;

insert into auth.users (id, email) values
  ('96000000-0000-0000-0000-000000000001', 'rpc-super@example.test'),
  ('96000000-0000-0000-0000-000000000002', 'rpc-owner@example.test'),
  ('96000000-0000-0000-0000-000000000003', 'rpc-owner-two@example.test'),
  ('96000000-0000-0000-0000-000000000004', 'rpc-admin@example.test'),
  ('96000000-0000-0000-0000-000000000005', 'rpc-staff@example.test'),
  ('96000000-0000-0000-0000-000000000006', 'rpc-invite-admin@example.test'),
  ('96000000-0000-0000-0000-000000000007', 'rpc-invite-staff@example.test'),
  ('96000000-0000-0000-0000-000000000008', 'rpc-cross-org@example.test'),
  ('96000000-0000-0000-0000-000000000009', 'rpc-admin-allowed@example.test'),
  ('96000000-0000-0000-0000-000000000010', 'rpc-override-target@example.test'),
  ('96000000-0000-0000-0000-000000000011', 'rpc-portal@example.test'),
  ('96000000-0000-0000-0000-000000000012', 'rpc-capacity@example.test'),
  ('96000000-0000-0000-0000-000000000013', 'rpc-lifecycle@example.test');

insert into public.organizations (id, name, slug) values
  ('97000000-0000-0000-0000-000000000001', 'Membership RPC A', 'membership-rpc-a'),
  ('97000000-0000-0000-0000-000000000002', 'Membership RPC B', 'membership-rpc-b');

insert into public.organization_members (
  id,
  organization_id,
  user_id,
  role,
  status,
  is_active
) values
  (
    '99000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000002',
    'BUSINESS_OWNER',
    'ACTIVE',
    true
  ),
  (
    '99000000-0000-0000-0000-000000000002',
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000003',
    'BUSINESS_OWNER',
    'ACTIVE',
    true
  ),
  (
    '99000000-0000-0000-0000-000000000003',
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000004',
    'BUSINESS_ADMIN',
    'ACTIVE',
    true
  ),
  (
    '99000000-0000-0000-0000-000000000004',
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000005',
    'STAFF_USER',
    'ACTIVE',
    true
  ),
  (
    '99000000-0000-0000-0000-000000000005',
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000012',
    'STAFF_USER',
    'ACTIVE',
    true
  ),
  (
    '99000000-0000-0000-0000-000000000006',
    '97000000-0000-0000-0000-000000000002',
    '96000000-0000-0000-0000-000000000008',
    'STAFF_USER',
    'ACTIVE',
    true
  );

insert into public.platform_user_roles (user_id, role, is_active)
values (
  '96000000-0000-0000-0000-000000000001',
  'SUPER_ADMIN',
  true
);

insert into public.customers (
  id,
  organization_id,
  customer_number,
  type,
  name,
  email
)
values (
  '98000000-0000-0000-0000-000000000001',
  '97000000-0000-0000-0000-000000000001',
  'IND-960001',
  'INDIVIDUAL',
  'Portal Target',
  'rpc-portal@example.test'
);

insert into public.customer_portal_users (
  organization_id,
  customer_id,
  user_id,
  is_active
)
values (
  '97000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000011',
  true
);

-- SCENARIO: OWNER_INVITATION_HIERARCHY
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000002',
  true
);

select public.prepare_organization_membership_invitation(
  '97000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000006',
  'BUSINESS_ADMIN'
);
select public.prepare_organization_membership_invitation(
  '97000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000007',
  'STAFF_USER'
);

select pg_temp.assert_true(
  (
    select status = 'INVITED' and not is_active
    from public.organization_members
    where user_id = '96000000-0000-0000-0000-000000000006'
  ),
  'Owner creates an inactive invited Business Admin membership'
);

do $$
begin
  perform public.prepare_organization_membership_invitation(
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000010',
    'BUSINESS_OWNER'
  );
  raise exception 'Owner invitation accepted an Owner role';
exception when invalid_parameter_value then
  if sqlerrm <> 'invalid organization invitation role' then
    raise;
  end if;
end
$$;

-- An authorized retry reuses the same membership and preserves invited_at.
do $$
declare
  before_id uuid;
  after_id uuid;
  before_invited_at timestamptz;
  after_invited_at timestamptz;
begin
  select id, invited_at
  into before_id, before_invited_at
  from public.organization_members
  where user_id = '96000000-0000-0000-0000-000000000007';

  select prepared.id, prepared.invited_at
  into after_id, after_invited_at
  from public.prepare_organization_membership_invitation(
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000007',
    'STAFF_MANAGER'
  ) prepared;

  perform pg_temp.assert_true(
    before_id = after_id
      and before_invited_at is not distinct from after_invited_at,
    'authorized invitation retry is stable and does not duplicate membership'
  );
end
$$;

-- SCENARIO: ADMIN_INVITATION_HIERARCHY
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000004',
  true
);

select public.prepare_organization_membership_invitation(
  '97000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000009',
  'STAFF_USER'
);

do $$
begin
  perform public.prepare_organization_membership_invitation(
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000010',
    'BUSINESS_ADMIN'
  );
  raise exception 'Business Admin invitation accepted a Business Admin role';
exception when insufficient_privilege then
  if sqlerrm <> 'not authorized' then
    raise;
  end if;
end
$$;

-- SCENARIO: EFFECTIVE_MANAGE_USERS_OVERRIDE
reset role;
insert into public.organization_role_permissions (
  organization_id,
  role,
  permission,
  is_allowed,
  updated_by
)
values (
  '97000000-0000-0000-0000-000000000001',
  'BUSINESS_ADMIN',
  'MANAGE_USERS',
  false,
  '96000000-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000004',
  true
);
do $$
begin
  perform public.prepare_organization_membership_invitation(
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000010',
    'STAFF_USER'
  );
  raise exception 'MANAGE_USERS=false override was ignored';
exception when insufficient_privilege then
  if sqlerrm <> 'not authorized' then
    raise;
  end if;
end
$$;

reset role;
update public.organization_role_permissions
set is_allowed = true
where organization_id = '97000000-0000-0000-0000-000000000001'
  and role = 'BUSINESS_ADMIN'
  and permission = 'MANAGE_USERS';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000004',
  true
);
select public.prepare_organization_membership_invitation(
  '97000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000010',
  'STAFF_USER'
);

-- SCENARIO: STAFF_MUTATION_DENIAL
reset role;
insert into public.organization_role_permissions (
  organization_id,
  role,
  permission,
  is_allowed,
  updated_by
)
values (
  '97000000-0000-0000-0000-000000000001',
  'STAFF_USER',
  'MANAGE_USERS',
  true,
  '96000000-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000005',
  true
);
do $$
begin
  perform public.update_organization_membership(
    '99000000-0000-0000-0000-000000000005',
    'STAFF_MANAGER',
    true
  );
  raise exception 'Staff role mutation was accepted';
exception when insufficient_privilege then
  if sqlerrm <> 'not authorized' then
    raise;
  end if;
end
$$;

-- SCENARIO: CROSS_ORGANIZATION_DENIAL
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000002',
  true
);
do $$
begin
  perform public.prepare_organization_membership_invitation(
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000008',
    'STAFF_USER'
  );
  raise exception 'Cross-organization membership was accepted';
exception when unique_violation then
  if sqlerrm <> 'user identity already belongs to another organization' then
    raise;
  end if;
end
$$;

do $$
begin
  perform public.prepare_organization_membership_invitation(
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000011',
    'STAFF_USER'
  );
  raise exception 'Customer Portal identity was accepted';
exception when check_violation then
  if sqlerrm <> 'customer portal identity cannot be invited' then
    raise;
  end if;
end
$$;

do $$
begin
  perform public.prepare_organization_membership_invitation(
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000001',
    'STAFF_USER'
  );
  raise exception 'SUPER_ADMIN identity was accepted';
exception when check_violation then
  if sqlerrm <> 'protected platform identity cannot be invited' then
    raise;
  end if;
end
$$;

-- SCENARIO: INVITATION_LIFECYCLE_RESTRICTIONS
reset role;
insert into public.organization_members (
  organization_id,
  user_id,
  role,
  status,
  is_active,
  verified_at
)
values (
  '97000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000013',
  'STAFF_USER',
  'VERIFIED',
  false,
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000002',
  true
);
do $$
begin
  perform public.prepare_organization_membership_invitation(
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000013',
    'STAFF_USER'
  );
  raise exception 'VERIFIED membership was invited again';
exception when check_violation then
  if sqlerrm <> 'existing membership cannot be invited again' then
    raise;
  end if;
end
$$;

reset role;
update public.organization_members
set status = 'ACTIVE'
where user_id = '96000000-0000-0000-0000-000000000013';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000002',
  true
);
do $$
begin
  perform public.prepare_organization_membership_invitation(
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000013',
    'STAFF_USER'
  );
  raise exception 'ACTIVE membership was invited again';
exception when check_violation then
  if sqlerrm <> 'existing membership cannot be invited again' then
    raise;
  end if;
end
$$;

reset role;
update public.organization_members
set status = 'SUSPENDED', suspended_at = now()
where user_id = '96000000-0000-0000-0000-000000000013';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000002',
  true
);
do $$
begin
  perform public.prepare_organization_membership_invitation(
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000013',
    'STAFF_USER'
  );
  raise exception 'SUSPENDED membership was invited again';
exception when check_violation then
  if sqlerrm <> 'existing membership cannot be invited again' then
    raise;
  end if;
end
$$;

reset role;
update public.organization_members
set status = 'REVOKED', revoked_at = now()
where user_id = '96000000-0000-0000-0000-000000000013';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000002',
  true
);
do $$
begin
  perform public.prepare_organization_membership_invitation(
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000013',
    'STAFF_USER'
  );
  raise exception 'REVOKED membership was invited again';
exception when check_violation then
  if sqlerrm <> 'existing membership cannot be invited again' then
    raise;
  end if;
end
$$;

do $$
declare
  membership_id uuid;
begin
  select id into membership_id
  from public.organization_members
  where user_id = '96000000-0000-0000-0000-000000000007';

  perform public.transition_organization_membership(membership_id, 'ACTIVATE');
  raise exception 'Unverified invitation was activated';
exception when raise_exception then
  if sqlerrm <> 'Only a verified membership can be activated' then
    raise;
  end if;
end
$$;

reset role;
update public.organization_members
set status = 'VERIFIED', verified_at = now()
where user_id = '96000000-0000-0000-0000-000000000007';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000002',
  true
);
select public.transition_organization_membership(
  (
    select id
    from public.organization_members
    where user_id = '96000000-0000-0000-0000-000000000007'
  ),
  'ACTIVATE'
);

select pg_temp.assert_true(
  (
    select status = 'ACTIVE' and is_active
    from public.organization_members
    where user_id = '96000000-0000-0000-0000-000000000007'
  ),
  'verified invitation activates through the lifecycle RPC'
);

-- SCENARIO: OWNER_TO_OWNER_DENIAL
do $$
begin
  perform public.update_organization_membership(
    '99000000-0000-0000-0000-000000000002',
    'STAFF_USER',
    true
  );
  raise exception 'Owner modified another Owner';
exception when insufficient_privilege then
  if sqlerrm <> 'not authorized' then
    raise;
  end if;
end
$$;

-- SCENARIO: SELF_PROMOTION_DENIAL
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000004',
  true
);
do $$
begin
  perform public.update_organization_membership(
    '99000000-0000-0000-0000-000000000003',
    'BUSINESS_OWNER',
    true
  );
  raise exception 'Business Admin self-promotion was accepted';
exception when insufficient_privilege then
  if sqlerrm <> 'not authorized' then
    raise;
  end if;
end
$$;

-- SCENARIO: MEMBERSHIP_EVENT_PRESERVATION
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000002',
  true
);
select pg_temp.assert_true(
  not exists (
    select 1
    from public.organization_membership_events event
    where event.user_id = '96000000-0000-0000-0000-000000000006'
  ),
  'preparation does not record an event before delivery'
);

select public.record_organization_membership_invitation_event(
  (
    select id
    from public.organization_members
    where user_id = '96000000-0000-0000-0000-000000000006'
  ),
  'INVITED'
);
select public.record_organization_membership_invitation_event(
  (
    select id
    from public.organization_members
    where user_id = '96000000-0000-0000-0000-000000000006'
  ),
  'INVITATION_RESENT'
);
select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.organization_membership_events event
    where event.user_id = '96000000-0000-0000-0000-000000000006'
      and event.event_type in ('INVITED', 'INVITATION_RESENT')
  ),
  'delivery and resend event history is preserved'
);

-- SCENARIO: CAPACITY_PROTECTION
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-0000-0000-000000000001',
  true
);
do $$
begin
  perform public.update_organization_membership(
    '99000000-0000-0000-0000-000000000005',
    'BUSINESS_OWNER',
    true
  );
  raise exception 'Third active Owner bypassed the capacity trigger';
exception when check_violation then
  if sqlerrm <> 'maximum active BUSINESS_OWNER memberships reached for organization' then
    raise;
  end if;
end
$$;

-- SCENARIO: SUPER_ADMIN_COMPATIBILITY
select public.update_organization_membership(
  '99000000-0000-0000-0000-000000000005',
  'STAFF_MANAGER',
  true
);
select public.transition_organization_membership(
  '99000000-0000-0000-0000-000000000005',
  'REVOKE'
);
select public.transition_organization_membership(
  '99000000-0000-0000-0000-000000000005',
  'REINSTATE'
);
select pg_temp.assert_true(
  (
    select role = 'STAFF_MANAGER' and status = 'ACTIVE' and is_active
    from public.organization_members
    where id = '99000000-0000-0000-0000-000000000005'
  ),
  'SUPER_ADMIN role and lifecycle administration remains available'
);

-- SCENARIO: ROLE_HISTORY_PRESERVATION
select pg_temp.assert_true(
  exists (
    select 1
    from public.user_role_history history
    where history.membership_id = '99000000-0000-0000-0000-000000000005'
      and history.event_type = 'CHANGED'
      and history.prior_role = 'STAFF_USER'
      and history.new_role = 'STAFF_MANAGER'
      and history.actor_user_id = '96000000-0000-0000-0000-000000000001'
  ),
  'authorized RPC role changes preserve the role-history trigger'
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.organization_membership_events event
    where event.membership_id = '99000000-0000-0000-0000-000000000005'
      and event.event_type = 'REVOKED'
  )
  and exists (
    select 1
    from public.organization_membership_events event
    where event.membership_id = '99000000-0000-0000-0000-000000000005'
      and event.event_type = 'REINSTATED'
  ),
  'SUPER_ADMIN lifecycle events remain preserved'
);

reset role;

-- Concurrency specification (requires two independent database sessions):
-- 1. Session A begins and calls prepare_organization_membership_invitation for
--    the same organization/user pair without committing.
-- 2. Session B calls the same RPC and must block on the target-user advisory
--    lock. After Session A commits, Session B must return the same membership
--    id, leave exactly one row for the user, and retain status INVITED.
-- 3. Begin with one active Owner. Two sessions concurrently promote different
--    active Staff users to BUSINESS_OWNER. The existing constrained-role
--    trigger's organization/role advisory lock must allow exactly one update,
--    reject the other with 23514, and leave exactly two active Owners.

select 'Membership RPC authorization-boundary regression tests passed' result;

rollback;
