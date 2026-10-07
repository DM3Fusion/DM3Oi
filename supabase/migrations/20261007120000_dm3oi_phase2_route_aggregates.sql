begin;

-- Phase 2 route summaries keep tenant operational rows in PostgreSQL instead
-- of transferring them to the application solely to count them. Each RPC is
-- authenticated, tenant scoped, permission checked, and reproduces the Case
-- visibility predicate used by the organization views.

create function public.get_task_route_summary(target_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  organization_timezone text;
  day_start timestamptz;
  result jsonb;
begin
  if actor is null
     or not public.has_effective_organization_permission(
       target_organization_id,
       'VIEW_TASKS'
     ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(settings.timezone, 'UTC')
  into organization_timezone
  from public.organization_settings settings
  where settings.organization_id = target_organization_id;

  organization_timezone := coalesce(organization_timezone, 'UTC');
  day_start := ((now() at time zone organization_timezone)::date::timestamp
    at time zone organization_timezone);

  with visible_tasks as materialized (
    select task.*
    from public.case_tasks task
    where task.organization_id = target_organization_id
      and public.can_access_case(task.case_id, task.organization_id, actor)
  ), eligible_members as materialized (
    select member.user_id, member.role
    from public.organization_members member
    join public.profiles profile on profile.id = member.user_id
    where member.organization_id = target_organization_id
      and member.is_active
      and member.status = 'ACTIVE'
      and profile.is_active
      and member.role in (
        'BUSINESS_OWNER',
        'BUSINESS_ADMIN',
        'STAFF_MANAGER',
        'STAFF_USER'
      )
      and not exists (
        select 1
        from public.platform_user_roles platform_role
        where platform_role.user_id = member.user_id
          and platform_role.role = 'SUPER_ADMIN'
          and platform_role.is_active
      )
  ), workload as (
    select
      member.user_id,
      member.role,
      count(task.id) filter (
        where task.assigned_user_id = member.user_id
          and task.status = 'NOT_STARTED'
      )::integer as not_started,
      count(task.id) filter (
        where task.assigned_user_id = member.user_id
          and task.status = 'IN_PROGRESS'
      )::integer as in_progress,
      count(task.id) filter (
        where task.assigned_user_id = member.user_id
          and task.status not in (
            'COMPLETED',
            'NOT_APPLICABLE',
            'REQUIRED_UNAVAILABLE'
          )
          and task.due_at < day_start
      )::integer as overdue,
      count(task.id) filter (
        where task.status = 'COMPLETED'
          and (
            task.completed_by_user_id = member.user_id
            or (
              task.completed_by_user_id is null
              and task.assigned_user_id = member.user_id
            )
          )
      )::integer as completed,
      count(task.id) filter (
        where task.assigned_user_id = member.user_id
           or task.completed_by_user_id = member.user_id
      )::integer as lifetime
    from eligible_members member
    left join visible_tasks task
      on task.assigned_user_id = member.user_id
      or task.completed_by_user_id = member.user_id
    group by member.user_id, member.role
  )
  select jsonb_build_object(
    'timezone', organization_timezone,
    'counts', jsonb_build_object(
      'total', count(*)::integer,
      'overdue', count(*) filter (
        where status not in (
          'COMPLETED',
          'NOT_APPLICABLE',
          'REQUIRED_UNAVAILABLE'
        ) and due_at < day_start
      )::integer,
      'notStarted', count(*) filter (where status = 'NOT_STARTED')::integer,
      'inProgress', count(*) filter (where status = 'IN_PROGRESS')::integer,
      'completed', count(*) filter (where status = 'COMPLETED')::integer
    ),
    'workloads', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'userId', workload.user_id,
            'role', workload.role,
            'notStarted', workload.not_started,
            'inProgress', workload.in_progress,
            'overdue', workload.overdue,
            'completed', workload.completed,
            'lifetime', workload.lifetime
          ) order by workload.user_id
        ),
        '[]'::jsonb
      )
      from workload
    )
  ) into result
  from visible_tasks;

  return result;
end;
$$;

revoke all on function public.get_task_route_summary(uuid)
  from public, anon;
grant execute on function public.get_task_route_summary(uuid)
  to authenticated;

create function public.get_case_route_summary(target_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  organization_timezone text;
  day_start timestamptz;
  current_tax_year integer;
  result jsonb;
begin
  if actor is null
     or not public.has_effective_organization_permission(
       target_organization_id,
       'VIEW_CASES'
     ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(settings.timezone, 'UTC')
  into organization_timezone
  from public.organization_settings settings
  where settings.organization_id = target_organization_id;

  organization_timezone := coalesce(organization_timezone, 'UTC');
  day_start := ((now() at time zone organization_timezone)::date::timestamp
    at time zone organization_timezone);

  with visible_cases as materialized (
    select item.*
    from public.cases item
    where item.organization_id = target_organization_id
      and public.can_access_case(item.id, item.organization_id, actor)
      and item.status in (
        'NEW',
        'UNASSIGNED',
        'ASSIGNED',
        'IN_PROGRESS',
        'WAITING',
        'REVIEW',
        'COMPLETED'
      )
  )
  select max(tax_year) into current_tax_year
  from visible_cases
  where tax_year > 0;

  with visible_cases as materialized (
    select item.*
    from public.cases item
    where item.organization_id = target_organization_id
      and public.can_access_case(item.id, item.organization_id, actor)
      and item.status in (
        'NEW',
        'UNASSIGNED',
        'ASSIGNED',
        'IN_PROGRESS',
        'WAITING',
        'REVIEW',
        'COMPLETED'
      )
  ), eligible_members as materialized (
    select member.user_id, member.role
    from public.organization_members member
    join public.profiles profile on profile.id = member.user_id
    where member.organization_id = target_organization_id
      and member.is_active
      and member.status = 'ACTIVE'
      and profile.is_active
      and not exists (
        select 1
        from public.platform_user_roles platform_role
        where platform_role.user_id = member.user_id
          and platform_role.role = 'SUPER_ADMIN'
          and platform_role.is_active
      )
  ), current_assignment as materialized (
    select item.id as case_id, item.manager_user_id as user_id
    from visible_cases item
    where item.manager_user_id is not null
    union
    select assignment.case_id, assignment.user_id
    from public.case_assignments assignment
    join visible_cases item on item.id = assignment.case_id
    where assignment.organization_id = target_organization_id
      and assignment.assignment_role = 'STAFF'
      and assignment.is_active
  ), historical_assignment as materialized (
    select case_id, user_id from current_assignment
    union
    select assignment.case_id, assignment.user_id
    from public.case_assignments assignment
    join visible_cases item on item.id = assignment.case_id
    where assignment.organization_id = target_organization_id
      and assignment.assignment_role = 'STAFF'
  ), workload as (
    select
      member.user_id,
      member.role,
      count(distinct item.id) filter (
        where current_assignment.user_id is not null
          and item.status in ('IN_PROGRESS', 'REVIEW')
      )::integer as in_progress,
      count(distinct item.id) filter (
        where current_assignment.user_id is not null
          and item.status in (
            'NEW', 'UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'REVIEW'
          )
          and item.due_at < day_start
      )::integer as overdue,
      count(distinct item.id) filter (
        where current_assignment.user_id is not null
          and item.status = 'COMPLETED'
          and current_tax_year is not null
          and item.tax_year = current_tax_year
      )::integer as completed,
      (
        select count(distinct historical.case_id)::integer
        from historical_assignment historical
        where historical.user_id = member.user_id
      ) as lifetime
    from eligible_members member
    left join current_assignment
      on current_assignment.user_id = member.user_id
    left join visible_cases item
      on item.id = current_assignment.case_id
    group by member.user_id, member.role
  )
  select jsonb_build_object(
    'timezone', organization_timezone,
    'latestTaxYear', current_tax_year,
    'counts', jsonb_build_object(
      'total', count(*)::integer,
      'inProgress', count(*) filter (
        where status in ('IN_PROGRESS', 'REVIEW')
      )::integer,
      'waiting', count(*) filter (where status = 'WAITING')::integer,
      'overdue', count(*) filter (
        where status in (
          'NEW', 'UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'REVIEW'
        ) and due_at < day_start
      )::integer,
      'unassigned', count(*) filter (
        where manager_user_id is null
          and not exists (
            select 1
            from public.case_assignments assignment
            where assignment.organization_id = target_organization_id
              and assignment.case_id = visible_cases.id
              and assignment.assignment_role = 'STAFF'
              and assignment.is_active
          )
      )::integer,
      'completed', count(*) filter (where status = 'COMPLETED')::integer
    ),
    'workloads', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'userId', workload.user_id,
            'role', workload.role,
            'inProgress', workload.in_progress,
            'overdue', workload.overdue,
            'completed', workload.completed,
            'lifetime', workload.lifetime
          ) order by workload.user_id
        ),
        '[]'::jsonb
      )
      from workload
    )
  ) into result
  from visible_cases;

  return result;
end;
$$;

revoke all on function public.get_case_route_summary(uuid)
  from public, anon;
grant execute on function public.get_case_route_summary(uuid)
  to authenticated;

create function public.get_operational_report_aggregate(
  target_organization_id uuid,
  range_start timestamptz,
  range_end timestamptz,
  previous_start timestamptz,
  previous_end timestamptz,
  current_day_start timestamptz,
  target_timezone text,
  target_bucket text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  can_cases boolean;
  can_tasks boolean;
  can_requests boolean;
  can_customers boolean;
  can_rules boolean;
  result jsonb;
begin
  if actor is null
     or not public.has_effective_organization_permission(
       target_organization_id,
       'VIEW_REPORTS'
     ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if range_end <= range_start
     or target_bucket not in ('day', 'week', 'month') then
    raise exception 'invalid report range' using errcode = '22023';
  end if;

  can_cases := public.has_effective_organization_permission(
    target_organization_id, 'VIEW_CASES'
  );
  can_tasks := public.has_effective_organization_permission(
    target_organization_id, 'VIEW_TASKS'
  );
  can_requests := public.has_effective_organization_permission(
    target_organization_id, 'VIEW_SERVICE_DESK'
  );
  can_customers := public.has_effective_organization_permission(
    target_organization_id, 'VIEW_CUSTOMERS'
  );
  can_rules := public.has_effective_organization_permission(
    target_organization_id, 'VIEW_RULES'
  );

  with visible_cases as materialized (
    select item.*
    from public.cases item
    where can_cases
      and item.organization_id = target_organization_id
      and public.can_access_case(item.id, item.organization_id, actor)
      and item.created_at < range_end
      and (
        item.opened_at >= coalesce(previous_start, range_start)
        or item.completed_at >= coalesce(previous_start, range_start)
      )
  ), visible_tasks as materialized (
    select task.*
    from public.case_tasks task
    where can_tasks
      and task.organization_id = target_organization_id
      and public.can_access_case(task.case_id, task.organization_id, actor)
      and (
        (task.created_at >= coalesce(previous_start, range_start)
          and task.created_at < range_end)
        or (task.completed_at >= coalesce(previous_start, range_start)
          and task.completed_at < range_end)
        or (
          task.status not in ('COMPLETED', 'NOT_APPLICABLE', 'REQUIRED_UNAVAILABLE')
          and (
            task.status = 'WAITING_ON_CUSTOMER'
            or task.due_at < current_day_start
          )
        )
      )
  ), visible_requests as materialized (
    select request.*
    from public.service_requests request
    where can_requests
      and request.organization_id = target_organization_id
      and request.created_at < range_end
      and (
        request.opened_at >= coalesce(previous_start, range_start)
        or request.resolved_at >= coalesce(previous_start, range_start)
        or request.closed_at >= coalesce(previous_start, range_start)
      )
  ), report_ranges as (
    select 'current'::text as key, range_start as starts_at, range_end as ends_at
    union all
    select 'previous', previous_start, previous_end
    where previous_start is not null and previous_end is not null
  ), summaries as (
    select
      report_range.key,
      count(distinct item.id) filter (
        where item.opened_at >= report_range.starts_at
          and item.opened_at < report_range.ends_at
      )::integer as opened,
      count(distinct item.id) filter (
        where item.completed_at >= report_range.starts_at
          and item.completed_at < report_range.ends_at
      )::integer as completed,
      count(distinct item.id) filter (
        where item.opened_at >= report_range.starts_at
          and item.opened_at < report_range.ends_at
          and item.completed_at < report_range.ends_at
      )::integer as cohort_completed,
      count(distinct item.customer_id) filter (
        where (item.opened_at >= report_range.starts_at
          and item.opened_at < report_range.ends_at)
          or (item.completed_at >= report_range.starts_at
          and item.completed_at < report_range.ends_at)
      )::integer as customers,
      avg(greatest(0, extract(epoch from (item.completed_at - item.opened_at)) / 86400.0))
        filter (
          where item.completed_at >= report_range.starts_at
            and item.completed_at < report_range.ends_at
        ) as average_duration,
      percentile_cont(0.5) within group (
        order by greatest(0, extract(epoch from (item.completed_at - item.opened_at)) / 86400.0)
      ) filter (
        where item.completed_at >= report_range.starts_at
          and item.completed_at < report_range.ends_at
      ) as median_duration,
      (select count(*)::integer from visible_tasks task
        where task.completed_at >= report_range.starts_at
          and task.completed_at < report_range.ends_at) as tasks_completed,
      (select count(*)::integer from visible_requests request
        where request.opened_at >= report_range.starts_at
          and request.opened_at < report_range.ends_at) as requests_received
    from report_ranges report_range
    left join visible_cases item on true
    group by report_range.key, report_range.starts_at, report_range.ends_at
  ), case_events as (
    select item.opened_at as occurred_at, 'opened'::text as kind
    from visible_cases item
    where item.opened_at >= range_start and item.opened_at < range_end
    union all
    select item.completed_at, 'completed'
    from visible_cases item
    where item.completed_at >= range_start and item.completed_at < range_end
  ), case_volume as (
    select
      case target_bucket
        when 'month' then to_char(
          date_trunc('month', occurred_at at time zone target_timezone),
          'YYYY-MM-DD'
        )
        when 'week' then to_char(
          (range_start at time zone target_timezone)::date
            + (((occurred_at at time zone target_timezone)::date
              - (range_start at time zone target_timezone)::date) / 7) * 7,
          'YYYY-MM-DD'
        )
        else to_char(occurred_at at time zone target_timezone, 'YYYY-MM-DD')
      end as key,
      count(*) filter (where kind = 'opened')::integer as opened,
      count(*) filter (where kind = 'completed')::integer as completed
    from case_events
    group by 1
  ), duration_trend as (
    select
      case target_bucket
        when 'month' then to_char(
          date_trunc('month', item.completed_at at time zone target_timezone),
          'YYYY-MM-DD'
        )
        when 'week' then to_char(
          (range_start at time zone target_timezone)::date
            + (((item.completed_at at time zone target_timezone)::date
              - (range_start at time zone target_timezone)::date) / 7) * 7,
          'YYYY-MM-DD'
        )
        else to_char(item.completed_at at time zone target_timezone, 'YYYY-MM-DD')
      end as key,
      avg(greatest(0, extract(epoch from (item.completed_at - item.opened_at)) / 86400.0)) as average,
      count(*)::integer as completed
    from visible_cases item
    where item.completed_at >= range_start and item.completed_at < range_end
    group by 1
  ), task_period as materialized (
    select task.*
    from visible_tasks task
    where (task.created_at >= range_start and task.created_at < range_end)
       or (task.completed_at >= range_start and task.completed_at < range_end)
  ), task_exceptions as materialized (
    select task.*
    from visible_tasks task
    where task.status in ('NOT_STARTED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER')
      and (task.status = 'WAITING_ON_CUSTOMER' or task.due_at < current_day_start)
  ), bottlenecks as (
    select
      lower(regexp_replace(btrim(title), '[[:space:]]+', ' ', 'g')) as key,
      min(title) as label,
      count(*)::integer as count
    from task_exceptions
    group by 1
    order by count(*) desc, min(title)
    limit 5
  ), request_events as (
    select request.opened_at as occurred_at, 'received'::text as kind
    from visible_requests request
    where request.opened_at >= range_start and request.opened_at < range_end
    union all
    select request.resolved_at, 'resolved'
    from visible_requests request
    where request.resolved_at >= range_start and request.resolved_at < range_end
  ), request_volume as (
    select
      case target_bucket
        when 'month' then to_char(
          date_trunc('month', occurred_at at time zone target_timezone),
          'YYYY-MM-DD'
        )
        when 'week' then to_char(
          (range_start at time zone target_timezone)::date
            + (((occurred_at at time zone target_timezone)::date
              - (range_start at time zone target_timezone)::date) / 7) * 7,
          'YYYY-MM-DD'
        )
        else to_char(occurred_at at time zone target_timezone, 'YYYY-MM-DD')
      end as key,
      count(*) filter (where kind = 'received')::integer as received,
      count(*) filter (where kind = 'resolved')::integer as resolved
    from request_events
    group by 1
  ), top_customers as (
    select
      customer.id,
      customer.name as label,
      count(*)::integer as count
    from visible_cases item
    join public.customers customer
      on customer.organization_id = item.organization_id
     and customer.id = item.customer_id
    where can_customers
      and (
        (item.opened_at >= range_start and item.opened_at < range_end)
        or (item.completed_at >= range_start and item.completed_at < range_end)
      )
    group by customer.id, customer.name
    order by count(*) desc, customer.name
    limit 5
  )
  select jsonb_build_object(
    'capabilities', jsonb_build_object(
      'cases', can_cases,
      'tasks', can_tasks,
      'serviceRequests', can_requests,
      'customers', can_customers,
      'questions', public.has_effective_organization_permission(
        target_organization_id, 'VIEW_QUESTIONS'
      ),
      'rules', can_rules
    ),
    'current', coalesce((select to_jsonb(summary) - 'key' from summaries summary where key = 'current'), '{}'::jsonb),
    'previous', (select to_jsonb(summary) - 'key' from summaries summary where key = 'previous'),
    'caseVolume', coalesce((select jsonb_agg(to_jsonb(row) order by key) from case_volume row), '[]'::jsonb),
    'durationTrend', coalesce((select jsonb_agg(to_jsonb(row) order by key) from duration_trend row), '[]'::jsonb),
    'taskPerformance', jsonb_build_object(
      'waitingOnCustomer', (select count(*)::integer from task_exceptions where status = 'WAITING_ON_CUSTOMER'),
      'overdue', (select count(*)::integer from task_exceptions where due_at < current_day_start),
      'manual', case when can_rules then (select count(*)::integer from task_period where source_rule_action_id is null) else null end,
      'generated', case when can_rules then (select count(*)::integer from task_period where source_rule_action_id is not null) else null end
    ),
    'requestPerformance', jsonb_build_object(
      'resolved', (select count(*)::integer from visible_requests where resolved_at >= range_start and resolved_at < range_end),
      'linked', (select count(*)::integer from visible_requests where case_id is not null and ((opened_at >= range_start and opened_at < range_end) or (resolved_at >= range_start and resolved_at < range_end)))
    ),
    'requestVolume', coalesce((select jsonb_agg(to_jsonb(row) order by key) from request_volume row), '[]'::jsonb),
    'topCustomers', coalesce((select jsonb_agg(to_jsonb(row) order by count desc, label) from top_customers row), '[]'::jsonb),
    'bottlenecks', coalesce((select jsonb_agg(to_jsonb(row) order by count desc, label) from bottlenecks row), '[]'::jsonb),
    'workDistribution', jsonb_build_object(
      'assigned', (select count(*)::integer from task_period where assigned_user_id is not null),
      'unassigned', (select count(*)::integer from task_period where assigned_user_id is null)
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_operational_report_aggregate(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, text, text
) from public, anon;
grant execute on function public.get_operational_report_aggregate(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, text, text
) to authenticated;

-- These indexes correspond directly to the tenant/date/status predicates used
-- by the new aggregates and the existing Dashboard and Reports queries.
create index case_tasks_organization_status_due_idx
  on public.case_tasks(organization_id, status, due_at);
create index case_tasks_organization_assignee_status_idx
  on public.case_tasks(organization_id, assigned_user_id, status);
create index case_tasks_organization_completed_by_idx
  on public.case_tasks(organization_id, completed_by_user_id)
  where completed_by_user_id is not null;
create index case_assignments_organization_user_case_idx
  on public.case_assignments(organization_id, user_id, case_id);
create index cases_organization_opened_idx
  on public.cases(organization_id, opened_at);
create index cases_organization_completed_idx
  on public.cases(organization_id, completed_at)
  where completed_at is not null;
create index service_requests_organization_opened_idx
  on public.service_requests(organization_id, opened_at);
create index service_requests_organization_resolved_idx
  on public.service_requests(organization_id, resolved_at)
  where resolved_at is not null;
create index case_activity_organization_created_idx
  on public.case_activity(organization_id, created_at desc);

commit;
