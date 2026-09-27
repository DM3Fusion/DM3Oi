create or replace function public.transition_organization_membership(
  target_membership_id uuid,
  target_action text
)
returns public.organization_membership_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  membership public.organization_members;
  actor_role public.application_role;
  next_status public.organization_membership_status;
  action_name text := upper(trim(target_action));
begin
  if actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select *
  into membership
  from public.organization_members
  where id = target_membership_id
  for update;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if public.is_super_admin(actor) then
    null;
  else
    select m.role
    into actor_role
    from public.organization_members m
    join public.profiles p
      on p.id = m.user_id
    join public.organizations o
      on o.id = m.organization_id
    where m.organization_id = membership.organization_id
      and m.user_id = actor
      and m.is_active
      and m.status = 'ACTIVE'
      and p.is_active
      and o.status = 'ACTIVE'
    limit 1;

    if actor_role = 'BUSINESS_OWNER' then
      if membership.role = 'BUSINESS_OWNER' then
        raise exception 'not authorized' using errcode = '42501';
      end if;
    elsif actor_role = 'BUSINESS_ADMIN' then
      if membership.role not in ('STAFF_MANAGER', 'STAFF_USER') then
        raise exception 'not authorized' using errcode = '42501';
      end if;
    else
      raise exception 'not authorized' using errcode = '42501';
    end if;
  end if;

  if membership.user_id = actor
     and action_name in ('SUSPEND', 'REVOKE') then
    raise exception 'A user cannot suspend or revoke their own organization access'
      using errcode = '42501';
  end if;

  case action_name
    when 'ACTIVATE' then
      if membership.status <> 'VERIFIED' then
        raise exception 'Only a verified membership can be activated';
      end if;

      next_status := 'ACTIVE';
      membership.activated_at := now();
      membership.suspended_at := null;
      membership.revoked_at := null;

    when 'SUSPEND' then
      if membership.status <> 'ACTIVE' then
        raise exception 'Only an active membership can be suspended';
      end if;

      next_status := 'SUSPENDED';
      membership.suspended_at := now();

    when 'REACTIVATE' then
      if membership.status <> 'SUSPENDED' then
        raise exception 'Only a suspended membership can be reactivated';
      end if;

      next_status := 'ACTIVE';
      membership.suspended_at := null;
      membership.activated_at := coalesce(membership.activated_at, now());

    when 'REVOKE' then
      if membership.status = 'REVOKED' then
        raise exception 'Membership is already revoked';
      end if;

      next_status := 'REVOKED';
      membership.revoked_at := now();

    when 'REINSTATE' then
      if not public.is_super_admin(actor) then
        raise exception 'Only SUPER_ADMIN can reinstate revoked membership'
          using errcode = '42501';
      end if;

      if membership.status <> 'REVOKED' then
        raise exception 'Only a revoked membership can be reinstated';
      end if;

      next_status := 'ACTIVE';
      membership.revoked_at := null;
      membership.suspended_at := null;
      membership.activated_at := now();

    else
      raise exception 'invalid membership lifecycle action'
        using errcode = '22023';
  end case;

  update public.organization_members
  set
    status = next_status,
    activated_at = membership.activated_at,
    suspended_at = membership.suspended_at,
    revoked_at = membership.revoked_at,
    updated_at = now()
  where id = membership.id;

  insert into public.organization_membership_events (
    organization_id,
    membership_id,
    user_id,
    user_email,
    user_display_name,
    user_role,
    actor_user_id,
    event_type,
    prior_status,
    new_status,
    note
  )
  select
    membership.organization_id,
    membership.id,
    membership.user_id,
    p.email,
    p.display_name,
    membership.role,
    actor,
    case action_name
      when 'ACTIVATE' then 'ACTIVATED'
      when 'SUSPEND' then 'SUSPENDED'
      when 'REACTIVATE' then 'REACTIVATED'
      when 'REVOKE' then 'REVOKED'
      when 'REINSTATE' then 'REINSTATED'
    end,
    membership.status,
    next_status,
    case action_name
      when 'ACTIVATE' then 'Membership activated.'
      when 'SUSPEND' then 'Membership suspended.'
      when 'REACTIVATE' then 'Membership reactivated.'
      when 'REVOKE' then 'Membership revoked.'
      when 'REINSTATE' then 'Membership reinstated by SUPER_ADMIN.'
    end
  from public.profiles p
  where p.id = membership.user_id;

  return next_status;
end
$$;

revoke all
on function public.transition_organization_membership(uuid, text)
from public, anon;

grant execute
on function public.transition_organization_membership(uuid, text)
to authenticated;

create or replace function public.reassign_revoked_member_work(
  target_membership_id uuid,
  target_work_type text,
  replacement_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  membership public.organization_members;
  actor_role public.application_role;
  replacement public.organization_members;
  work_type text := upper(trim(target_work_type));
  affected integer := 0;
  item record;
  existing_assignment_id uuid;
begin
  if actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if work_type not in ('CASES', 'TASKS', 'SERVICE_REQUESTS') then
    raise exception 'invalid work type' using errcode = '22023';
  end if;

  select *
  into membership
  from public.organization_members
  where id = target_membership_id
  for update;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if membership.status <> 'REVOKED' then
    raise exception 'work reassignment requires revoked membership'
      using errcode = '23514';
  end if;

  if public.is_super_admin(actor) then
    null;
  else
    select m.role
    into actor_role
    from public.organization_members m
    join public.profiles p
      on p.id = m.user_id
    join public.organizations o
      on o.id = m.organization_id
    where m.organization_id = membership.organization_id
      and m.user_id = actor
      and m.is_active
      and m.status = 'ACTIVE'
      and p.is_active
      and o.status = 'ACTIVE'
    limit 1;

    if actor_role = 'BUSINESS_OWNER' then
      if membership.role = 'BUSINESS_OWNER' then
        raise exception 'not authorized' using errcode = '42501';
      end if;
    elsif actor_role = 'BUSINESS_ADMIN' then
      if membership.role not in ('STAFF_MANAGER', 'STAFF_USER') then
        raise exception 'not authorized' using errcode = '42501';
      end if;
    else
      raise exception 'not authorized' using errcode = '42501';
    end if;
  end if;

  if replacement_user_id = membership.user_id then
    raise exception 'replacement must be a different active user'
      using errcode = '23514';
  end if;

  select m.*
  into replacement
  from public.organization_members m
  join public.profiles p
    on p.id = m.user_id
  join public.organizations o
    on o.id = m.organization_id
  where m.organization_id = membership.organization_id
    and m.user_id = replacement_user_id
    and m.is_active
    and m.status = 'ACTIVE'
    and p.is_active
    and o.status = 'ACTIVE'
    and m.role in (
      'BUSINESS_OWNER',
      'BUSINESS_ADMIN',
      'STAFF_MANAGER',
      'STAFF_USER'
    )
  limit 1
  for update of m;

  if not found then
    raise exception 'replacement must be an active organization user'
      using errcode = '23514';
  end if;

  if work_type = 'CASES' then
    for item in
      select
        a.id,
        a.case_id,
        a.assignment_role
      from public.case_assignments a
      join public.cases c
        on c.id = a.case_id
       and c.organization_id = a.organization_id
      where a.organization_id = membership.organization_id
        and a.user_id = membership.user_id
        and a.is_active
        and c.status not in ('COMPLETED', 'CLOSED')
      order by a.case_id, a.created_at
      for update of a
    loop
      existing_assignment_id := null;

      select a.id
      into existing_assignment_id
      from public.case_assignments a
      where a.organization_id = membership.organization_id
        and a.case_id = item.case_id
        and a.user_id = replacement.user_id
        and a.assignment_role = item.assignment_role
      order by a.created_at desc
      limit 1;

      if item.assignment_role = 'MANAGER' then
        update public.case_assignments
        set
          is_active = false,
          unassigned_at = now()
        where organization_id = membership.organization_id
          and case_id = item.case_id
          and assignment_role = 'MANAGER'
          and is_active
          and user_id <> replacement.user_id;
      else
        update public.case_assignments
        set
          is_active = false,
          unassigned_at = now()
        where id = item.id
          and is_active;
      end if;

      if existing_assignment_id is null then
        insert into public.case_assignments (
          organization_id,
          case_id,
          user_id,
          assignment_role,
          assigned_by_user_id,
          is_active,
          assigned_at,
          unassigned_at
        )
        values (
          membership.organization_id,
          item.case_id,
          replacement.user_id,
          item.assignment_role,
          actor,
          true,
          now(),
          null
        );
      else
        update public.case_assignments
        set
          is_active = true,
          assigned_at = now(),
          assigned_by_user_id = actor,
          unassigned_at = null
        where id = existing_assignment_id;
      end if;

      if item.assignment_role = 'MANAGER' then
        update public.cases
        set manager_user_id = replacement.user_id
        where id = item.case_id
          and organization_id = membership.organization_id;
      end if;

      insert into public.case_activity (
        organization_id,
        case_id,
        actor_user_id,
        event_type,
        event_data
      )
      values (
        membership.organization_id,
        item.case_id,
        actor,
        'CASE_UNASSIGNED',
        jsonb_build_object(
          'user_id', membership.user_id,
          'assignment_role', item.assignment_role,
          'reason', 'REVOKED_USER_REASSIGNMENT'
        )
      );

      insert into public.case_activity (
        organization_id,
        case_id,
        actor_user_id,
        event_type,
        event_data
      )
      values (
        membership.organization_id,
        item.case_id,
        actor,
        'CASE_ASSIGNED',
        jsonb_build_object(
          'user_id', replacement.user_id,
          'assignment_role', item.assignment_role,
          'reason', 'REVOKED_USER_REASSIGNMENT',
          'previous_user_id', membership.user_id
        )
      );

      affected := affected + 1;
    end loop;

    for item in
      select c.id as case_id
      from public.cases c
      where c.organization_id = membership.organization_id
        and c.manager_user_id = membership.user_id
        and c.status not in ('COMPLETED', 'CLOSED')
        and not exists (
          select 1
          from public.case_assignments a
          where a.organization_id = c.organization_id
            and a.case_id = c.id
            and a.user_id = membership.user_id
            and a.assignment_role = 'MANAGER'
            and a.is_active
        )
      for update of c
    loop
      existing_assignment_id := null;

      update public.case_assignments
      set
        is_active = false,
        unassigned_at = now()
      where organization_id = membership.organization_id
        and case_id = item.case_id
        and assignment_role = 'MANAGER'
        and is_active
        and user_id <> replacement.user_id;

      select a.id
      into existing_assignment_id
      from public.case_assignments a
      where a.organization_id = membership.organization_id
        and a.case_id = item.case_id
        and a.user_id = replacement.user_id
        and a.assignment_role = 'MANAGER'
      order by a.created_at desc
      limit 1;

      if existing_assignment_id is null then
        insert into public.case_assignments (
          organization_id,
          case_id,
          user_id,
          assignment_role,
          assigned_by_user_id,
          is_active,
          assigned_at,
          unassigned_at
        )
        values (
          membership.organization_id,
          item.case_id,
          replacement.user_id,
          'MANAGER',
          actor,
          true,
          now(),
          null
        );
      else
        update public.case_assignments
        set
          is_active = true,
          assigned_at = now(),
          assigned_by_user_id = actor,
          unassigned_at = null
        where id = existing_assignment_id;
      end if;

      update public.cases
      set manager_user_id = replacement.user_id
      where id = item.case_id;

      insert into public.case_activity (
        organization_id,
        case_id,
        actor_user_id,
        event_type,
        event_data
      )
      values (
        membership.organization_id,
        item.case_id,
        actor,
        'CASE_UNASSIGNED',
        jsonb_build_object(
          'user_id', membership.user_id,
          'assignment_role', 'MANAGER',
          'reason', 'REVOKED_USER_REASSIGNMENT'
        )
      );

      insert into public.case_activity (
        organization_id,
        case_id,
        actor_user_id,
        event_type,
        event_data
      )
      values (
        membership.organization_id,
        item.case_id,
        actor,
        'CASE_ASSIGNED',
        jsonb_build_object(
          'user_id', replacement.user_id,
          'assignment_role', 'MANAGER',
          'reason', 'REVOKED_USER_REASSIGNMENT',
          'previous_user_id', membership.user_id
        )
      );

      affected := affected + 1;
    end loop;

  elsif work_type = 'TASKS' then
    for item in
      select
        t.id,
        t.case_id,
        t.status
      from public.case_tasks t
      join public.cases c
        on c.id = t.case_id
       and c.organization_id = t.organization_id
      where t.organization_id = membership.organization_id
        and t.assigned_user_id = membership.user_id
        and t.status not in ('COMPLETED', 'NOT_APPLICABLE')
        and c.status not in ('COMPLETED', 'CLOSED')
      order by t.created_at
      for update of t
    loop
      update public.case_tasks
      set
        assigned_user_id = replacement.user_id,
        updated_at = now()
      where id = item.id;

      insert into public.case_activity (
        organization_id,
        case_id,
        actor_user_id,
        event_type,
        event_data
      )
      values (
        membership.organization_id,
        item.case_id,
        actor,
        'TASK_ASSIGNED',
        jsonb_build_object(
          'task_id', item.id,
          'before_status', item.status,
          'after_status', item.status,
          'before_assigned_user_id', membership.user_id,
          'after_assigned_user_id', replacement.user_id,
          'reason', 'REVOKED_USER_REASSIGNMENT'
        )
      );

      affected := affected + 1;
    end loop;

  elsif work_type = 'SERVICE_REQUESTS' then
    for item in
      select r.id
      from public.service_requests r
      where r.organization_id = membership.organization_id
        and r.assigned_user_id = membership.user_id
        and r.status not in ('RESOLVED', 'CLOSED')
      order by r.created_at
      for update
    loop
      update public.service_requests
      set
        assigned_user_id = replacement.user_id,
        updated_at = now()
      where id = item.id;

      insert into public.service_request_activity (
        organization_id,
        service_request_id,
        event_type,
        actor_user_id,
        previous_value,
        new_value
      )
      values (
        membership.organization_id,
        item.id,
        'ASSIGNMENT_CHANGED',
        actor,
        to_jsonb(membership.user_id),
        to_jsonb(replacement.user_id)
      );

      affected := affected + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'membershipId', membership.id,
    'organizationId', membership.organization_id,
    'workType', work_type,
    'replacementUserId', replacement.user_id,
    'affected', affected
  );
end
$$;

revoke all
on function public.reassign_revoked_member_work(uuid, text, uuid)
from public, anon;

grant execute
on function public.reassign_revoked_member_work(uuid, text, uuid)
to authenticated;

comment on function public.reassign_revoked_member_work(uuid, text, uuid)
is 'Reassigns current operational responsibility from a revoked organization member to an active same-organization member while preserving historical attribution.';
