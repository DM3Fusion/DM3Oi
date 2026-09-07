-- Development/test workload for Fobbs Quality Signs.
-- Run with ON_ERROR_STOP enabled. The transaction is all-or-nothing and idempotent.

begin;

create temporary table seed_context (
  organization_id uuid primary key,
  actor_user_id uuid not null,
  timezone text not null,
  question_order_base integer not null
) on commit drop;

insert into seed_context(organization_id, actor_user_id, timezone, question_order_base)
select
  o.id,
  m.user_id,
  coalesce(s.timezone, 'UTC'),
  coalesce((select max(q.display_order) from public.question_definitions q where q.organization_id = o.id), 0)
from public.organizations o
join lateral (
  select member.user_id
  from public.organization_members member
  join public.profiles profile on profile.id = member.user_id and profile.is_active
  where member.organization_id = o.id
    and member.is_active
    and member.role in ('BUSINESS_OWNER', 'BUSINESS_ADMIN')
    and not public.is_super_admin(member.user_id)
  order by case member.role when 'BUSINESS_OWNER' then 0 else 1 end, member.joined_at, member.user_id
  limit 1
) m on true
left join public.organization_settings s on s.organization_id = o.id
where o.id = 'cea3a860-8770-4a89-bf97-1390d29be8a8'
  and o.name = 'Fobbs Quality Signs'
  and o.status = 'ACTIVE';

do $$
begin
  if (select count(*) from seed_context) <> 1 then
    raise exception 'Fobbs Quality Signs is missing, inactive, renamed, or has no eligible active internal creator';
  end if;
  if exists (
    select 1 from public.platform_user_roles p
    join seed_context c on c.actor_user_id = p.user_id
    where p.role = 'SUPER_ADMIN' and p.is_active
  ) then
    raise exception 'seed actor must not be a SUPER_ADMIN';
  end if;
end
$$;

-- Case Types have an established organization-admin CRUD path. This organization
-- had no Case Types when the seed was prepared, so add one narrowly scoped type.
insert into public.organization_case_types(id, organization_id, name, description, is_active, sort_order)
select
  'f0bb5000-0000-4000-8000-000000000001',
  c.organization_id,
  'Sign Installation',
  'Road, street, traffic-control, and wayfinding sign installation work.',
  true,
  10
from seed_context c
on conflict (organization_id, name) do update
set description = excluded.description,
    is_active = true,
    sort_order = excluded.sort_order;

create temporary table seed_customers (
  ordinal integer primary key,
  id uuid unique not null,
  name text not null,
  email text unique not null,
  phone text not null
) on commit drop;

insert into seed_customers values
  (1,  'f0bb5100-0000-4000-8000-000000000001', 'MetroLine Construction',       'fobbs.customer01@example.com', '2025550101'),
  (2,  'f0bb5100-0000-4000-8000-000000000002', 'Blue Ridge Paving',            'fobbs.customer02@example.com', '2025550102'),
  (3,  'f0bb5100-0000-4000-8000-000000000003', 'Capital Roadworks',            'fobbs.customer03@example.com', '2025550103'),
  (4,  'f0bb5100-0000-4000-8000-000000000004', 'Eastern Traffic Systems',      'fobbs.customer04@example.com', '2025550104'),
  (5,  'f0bb5100-0000-4000-8000-000000000005', 'Heritage Site Development',    'fobbs.customer05@example.com', '2025550105'),
  (6,  'f0bb5100-0000-4000-8000-000000000006', 'Interstate Safety Group',      'fobbs.customer06@example.com', '2025550106'),
  (7,  'f0bb5100-0000-4000-8000-000000000007', 'Landmark Civil Contractors',   'fobbs.customer07@example.com', '2025550107'),
  (8,  'f0bb5100-0000-4000-8000-000000000008', 'Northstar Infrastructure',     'fobbs.customer08@example.com', '2025550108'),
  (9,  'f0bb5100-0000-4000-8000-000000000009', 'Precision Highway Services',   'fobbs.customer09@example.com', '2025550109'),
  (10, 'f0bb5100-0000-4000-8000-000000000010', 'Summit Municipal Works',       'fobbs.customer10@example.com', '2025550110');

do $$
begin
  if exists (
    select 1 from public.customers existing
    join seed_customers seed on existing.id = seed.id
    join seed_context context on true
    where existing.organization_id <> context.organization_id
  ) then
    raise exception 'a deterministic customer seed UUID belongs to another organization';
  end if;
  if exists (
    select 1 from public.customers existing
    join seed_customers seed on lower(existing.email) = lower(seed.email)
    where existing.id <> seed.id
  ) then
    raise exception 'a Fobbs seed email already belongs to a different customer row';
  end if;
end
$$;

insert into public.customers(
  id, organization_id, customer_number, type, name, email, phone, status, notes, created_by_user_id, created_at, updated_at
)
select
  seed.id,
  context.organization_id,
  public.next_customer_number(context.organization_id, 'BUSINESS'),
  'BUSINESS',
  seed.name,
  seed.email,
  seed.phone,
  'ACTIVE',
  'Fictional development data [seed:fobbs-quality-signs-stress:v1]',
  context.actor_user_id,
  now() - make_interval(days => 65 - seed.ordinal),
  now() - make_interval(days => 65 - seed.ordinal)
from seed_customers seed
cross join seed_context context
where not exists (select 1 from public.customers existing where existing.id = seed.id)
order by seed.ordinal;

update public.customers customer
set name = seed.name,
    email = seed.email,
    phone = seed.phone,
    type = 'BUSINESS',
    status = 'ACTIVE',
    notes = 'Fictional development data [seed:fobbs-quality-signs-stress:v1]'
from seed_customers seed, seed_context context
where customer.id = seed.id
  and customer.organization_id = context.organization_id;

create temporary table seed_questions (
  ordinal integer primary key,
  id uuid unique not null,
  question_text text unique not null,
  response_type public.question_response_type not null,
  required boolean not null
) on commit drop;

insert into seed_questions values
  (1,  'f0bb5200-0000-4000-8000-000000000001', 'What type of sign installation is required?',                              'SINGLE_SELECT', true),
  (2,  'f0bb5200-0000-4000-8000-000000000002', 'Has the installation location been field verified?',                     'YES_NO',        true),
  (3,  'f0bb5200-0000-4000-8000-000000000003', 'Has the sign layout or placement plan been approved?',                    'YES_NO',        true),
  (4,  'f0bb5200-0000-4000-8000-000000000004', 'Are traffic-control measures required during installation?',              'YES_NO',        true),
  (5,  'f0bb5200-0000-4000-8000-000000000005', 'Does the installation require a lane or shoulder closure?',               'YES_NO',        false),
  (6,  'f0bb5200-0000-4000-8000-000000000006', 'Have underground utilities been marked or cleared?',                      'YES_NO',        true),
  (7,  'f0bb5200-0000-4000-8000-000000000007', 'What mounting method is required?',                                       'SINGLE_SELECT', true),
  (8,  'f0bb5200-0000-4000-8000-000000000008', 'Are all signs, posts, hardware, and mounting materials available?',        'YES_NO',        true),
  (9,  'f0bb5200-0000-4000-8000-000000000009', 'Has the required permit or agency authorization been received?',           'YES_NO',        true),
  (10, 'f0bb5200-0000-4000-8000-000000000010', 'What is the planned installation date?',                                  'DATE',          false);

do $$
begin
  if exists (
    select 1 from public.question_definitions existing
    join seed_questions seed on existing.id = seed.id
    join seed_context context on true
    where existing.organization_id <> context.organization_id
  ) then
    raise exception 'a deterministic question seed UUID belongs to another organization';
  end if;
  if exists (
    select 1 from public.question_definitions existing
    join seed_questions seed on existing.question_text = seed.question_text
    join seed_context context on existing.organization_id = context.organization_id
    where existing.id <> seed.id
  ) then
    raise exception 'an intended seed question already exists under a different UUID';
  end if;
end
$$;

insert into public.question_definitions(
  id, organization_id, question_text, description, response_type, required, active, display_order, created_by_user_id
)
select
  seed.id,
  context.organization_id,
  seed.question_text,
  'Fobbs Quality Signs installation readiness question.',
  seed.response_type,
  seed.required,
  true,
  context.question_order_base + seed.ordinal * 10,
  context.actor_user_id
from seed_questions seed
cross join seed_context context
where not exists (select 1 from public.question_definitions existing where existing.id = seed.id);

update public.question_definitions question
set question_text = seed.question_text,
    description = 'Fobbs Quality Signs installation readiness question.',
    response_type = seed.response_type,
    required = seed.required,
    active = true
from seed_questions seed, seed_context context
where question.id = seed.id
  and question.organization_id = context.organization_id;

create temporary table seed_options (
  id uuid primary key,
  question_id uuid not null,
  option_label text not null,
  option_value text not null,
  display_order integer not null
) on commit drop;

insert into seed_options values
  ('f0bb5301-0000-4000-8000-000000000001', 'f0bb5200-0000-4000-8000-000000000001', 'Regulatory',                'REGULATORY',       10),
  ('f0bb5301-0000-4000-8000-000000000002', 'f0bb5200-0000-4000-8000-000000000001', 'Warning',                   'WARNING',          20),
  ('f0bb5301-0000-4000-8000-000000000003', 'f0bb5200-0000-4000-8000-000000000001', 'Guide / Wayfinding',        'GUIDE_WAYFINDING', 30),
  ('f0bb5301-0000-4000-8000-000000000004', 'f0bb5200-0000-4000-8000-000000000001', 'Street Name',               'STREET_NAME',      40),
  ('f0bb5301-0000-4000-8000-000000000005', 'f0bb5200-0000-4000-8000-000000000001', 'Construction / Work Zone',  'WORK_ZONE',        50),
  ('f0bb5301-0000-4000-8000-000000000006', 'f0bb5200-0000-4000-8000-000000000001', 'School Zone',               'SCHOOL_ZONE',      60),
  ('f0bb5301-0000-4000-8000-000000000007', 'f0bb5200-0000-4000-8000-000000000001', 'Pedestrian / Bicycle',      'PEDESTRIAN',       70),
  ('f0bb5301-0000-4000-8000-000000000008', 'f0bb5200-0000-4000-8000-000000000001', 'Other',                     'OTHER',            80),
  ('f0bb5307-0000-4000-8000-000000000001', 'f0bb5200-0000-4000-8000-000000000007', 'Ground Post',               'GROUND_POST',      10),
  ('f0bb5307-0000-4000-8000-000000000002', 'f0bb5200-0000-4000-8000-000000000007', 'Existing Pole',             'EXISTING_POLE',    20),
  ('f0bb5307-0000-4000-8000-000000000003', 'f0bb5200-0000-4000-8000-000000000007', 'New Pole',                  'NEW_POLE',         30),
  ('f0bb5307-0000-4000-8000-000000000004', 'f0bb5200-0000-4000-8000-000000000007', 'Overhead Structure',        'OVERHEAD',         40),
  ('f0bb5307-0000-4000-8000-000000000005', 'f0bb5200-0000-4000-8000-000000000007', 'Building / Wall',           'BUILDING_WALL',    50),
  ('f0bb5307-0000-4000-8000-000000000006', 'f0bb5200-0000-4000-8000-000000000007', 'Temporary Stand',           'TEMPORARY_STAND',  60),
  ('f0bb5307-0000-4000-8000-000000000007', 'f0bb5200-0000-4000-8000-000000000007', 'Other',                     'OTHER',            70);

insert into public.question_options(id, organization_id, question_id, option_label, option_value, display_order)
select option.id, context.organization_id, option.question_id, option.option_label, option.option_value, option.display_order
from seed_options option
cross join seed_context context
on conflict (id) do update
set option_label = excluded.option_label,
    option_value = excluded.option_value,
    display_order = excluded.display_order
where public.question_options.organization_id = excluded.organization_id
  and public.question_options.question_id = excluded.question_id;

create temporary table seed_cases (
  ordinal integer primary key,
  id uuid unique not null,
  customer_id uuid unique not null,
  title text unique not null,
  status public.case_status not null,
  priority public.priority_level not null,
  opened_days_ago integer not null,
  due_days integer,
  assigned boolean not null
) on commit drop;

insert into seed_cases values
  (1,  'f0bb5400-0000-4000-8000-000000000001', 'f0bb5100-0000-4000-8000-000000000001', 'Downtown Wayfinding Sign Installation',       'UNASSIGNED',  'NORMAL', 58,  14, false),
  (2,  'f0bb5400-0000-4000-8000-000000000002', 'f0bb5100-0000-4000-8000-000000000002', 'Route 17 Regulatory Sign Replacement',       'IN_PROGRESS', 'HIGH',   55,  -8, true),
  (3,  'f0bb5400-0000-4000-8000-000000000003', 'f0bb5100-0000-4000-8000-000000000003', 'School Zone Sign Upgrade',                    'IN_PROGRESS', 'NORMAL', 52,  10, true),
  (4,  'f0bb5400-0000-4000-8000-000000000004', 'f0bb5100-0000-4000-8000-000000000004', 'Municipal Street Name Sign Program',          'IN_PROGRESS', 'NORMAL', 49,  21, true),
  (5,  'f0bb5400-0000-4000-8000-000000000005', 'f0bb5100-0000-4000-8000-000000000005', 'Construction Detour Sign Deployment',         'WAITING',     'NORMAL', 46,  -3, true),
  (6,  'f0bb5400-0000-4000-8000-000000000006', 'f0bb5100-0000-4000-8000-000000000006', 'Highway Exit Sign Replacement',               'WAITING',     'HIGH',   43,   7, false),
  (7,  'f0bb5400-0000-4000-8000-000000000007', 'f0bb5100-0000-4000-8000-000000000007', 'Pedestrian Crossing Sign Installation',       'REVIEW',      'NORMAL', 40,   3, true),
  (8,  'f0bb5400-0000-4000-8000-000000000008', 'f0bb5100-0000-4000-8000-000000000008', 'County Road Warning Sign Upgrade',            'COMPLETED',   'NORMAL', 37, -10, true),
  (9,  'f0bb5400-0000-4000-8000-000000000009', 'f0bb5100-0000-4000-8000-000000000009', 'Work Zone Signage Installation',              'CLOSED',      'LOW',    34,  -6, true),
  (10, 'f0bb5400-0000-4000-8000-000000000010', 'f0bb5100-0000-4000-8000-000000000010', 'Traffic Control Sign Rehabilitation',         'ASSIGNED',    'LOW',    31,  28, true);

do $$
begin
  if exists (
    select 1 from public.cases existing
    join seed_cases seed on existing.id = seed.id
    join seed_context context on true
    where existing.organization_id <> context.organization_id
  ) then
    raise exception 'a deterministic Case seed UUID belongs to another organization';
  end if;
  if exists (
    select 1 from public.cases existing
    join seed_cases seed on existing.customer_id = seed.customer_id and existing.title = seed.title
    join seed_context context on existing.organization_id = context.organization_id
    where existing.id <> seed.id
  ) then
    raise exception 'an intended seeded Case already exists under a different UUID';
  end if;
end
$$;

insert into public.cases(
  id, organization_id, case_number, customer_id, title, description, case_type, priority, status,
  opened_at, due_at, completed_at, closed_at, manager_user_id, created_by_user_id, created_at, updated_at
)
select
  seed.id,
  context.organization_id,
  public.next_case_number(context.organization_id),
  seed.customer_id,
  seed.title,
  'Fictional road and street-sign installation workload [seed:fobbs-quality-signs-stress:v1]',
  'Sign Installation',
  seed.priority,
  seed.status,
  now() - make_interval(days => seed.opened_days_ago),
  case when seed.due_days is null then null else ((current_date + seed.due_days) + time '17:00') at time zone context.timezone end,
  case when seed.status in ('COMPLETED', 'CLOSED') then now() - interval '2 days' else null end,
  case when seed.status = 'CLOSED' then now() - interval '1 day' else null end,
  case when seed.assigned then context.actor_user_id else null end,
  context.actor_user_id,
  now() - make_interval(days => seed.opened_days_ago),
  now() - make_interval(days => seed.opened_days_ago)
from seed_cases seed
cross join seed_context context
where not exists (select 1 from public.cases existing where existing.id = seed.id)
order by seed.ordinal;

insert into public.case_assignments(id, organization_id, case_id, user_id, assignment_role, assigned_by_user_id, assigned_at)
select
  (substr(md5('fobbs-assignment:' || seed.id::text), 1, 8) || '-' || substr(md5('fobbs-assignment:' || seed.id::text), 9, 4) || '-4' || substr(md5('fobbs-assignment:' || seed.id::text), 14, 3) || '-8' || substr(md5('fobbs-assignment:' || seed.id::text), 18, 3) || '-' || substr(md5('fobbs-assignment:' || seed.id::text), 21, 12))::uuid,
  context.organization_id,
  seed.id,
  context.actor_user_id,
  'MANAGER',
  context.actor_user_id,
  now() - make_interval(days => seed.opened_days_ago)
from seed_cases seed
cross join seed_context context
where seed.assigned
on conflict (id) do update
set is_active = true,
    unassigned_at = null,
    user_id = excluded.user_id,
    assigned_by_user_id = excluded.assigned_by_user_id
where public.case_assignments.organization_id = excluded.organization_id
  and public.case_assignments.case_id = excluded.case_id;

-- Four stable tasks per Case provide varied progress without sensitive content.
insert into public.case_tasks(
  id, organization_id, case_id, title, description, assigned_user_id, status, required, due_at,
  completed_at, completed_by_user_id, sequence, created_by_user_id, created_at, updated_at
)
select
  (substr(md5('fobbs-task:' || seed.id::text || ':' || task.ordinal), 1, 8) || '-' || substr(md5('fobbs-task:' || seed.id::text || ':' || task.ordinal), 9, 4) || '-4' || substr(md5('fobbs-task:' || seed.id::text || ':' || task.ordinal), 14, 3) || '-8' || substr(md5('fobbs-task:' || seed.id::text || ':' || task.ordinal), 18, 3) || '-' || substr(md5('fobbs-task:' || seed.id::text || ':' || task.ordinal), 21, 12))::uuid,
  context.organization_id,
  seed.id,
  task.title,
  'Fictional operational task.',
  case when seed.assigned then context.actor_user_id else null end,
  case
    when seed.ordinal in (8, 9) then 'COMPLETED'::public.case_task_status
    when task.ordinal = 1 and seed.ordinal in (2, 3, 4, 5, 7, 10) then 'COMPLETED'::public.case_task_status
    when task.ordinal = 2 and seed.ordinal in (3, 7) then 'COMPLETED'::public.case_task_status
    when task.ordinal = 2 and seed.ordinal = 5 then 'BLOCKED'::public.case_task_status
    when task.ordinal = 2 and seed.ordinal in (2, 4, 10) then 'IN_PROGRESS'::public.case_task_status
    when task.ordinal = 3 and seed.ordinal in (2, 6) then 'BLOCKED'::public.case_task_status
    when task.ordinal = 3 and seed.ordinal in (3, 5, 7) then 'IN_PROGRESS'::public.case_task_status
    else 'NOT_STARTED'::public.case_task_status
  end,
  true,
  (((current_date + coalesce(seed.due_days, 14) - (4 - task.ordinal)) + time '17:00') at time zone context.timezone),
  case
    when seed.ordinal in (8, 9) or (task.ordinal = 1 and seed.ordinal in (2, 3, 4, 5, 7, 10)) or (task.ordinal = 2 and seed.ordinal in (3, 7))
      then now() - interval '2 days'
    else null
  end,
  case
    when seed.ordinal in (8, 9) or (task.ordinal = 1 and seed.ordinal in (2, 3, 4, 5, 7, 10)) or (task.ordinal = 2 and seed.ordinal in (3, 7))
      then context.actor_user_id
    else null
  end,
  task.ordinal * 10,
  context.actor_user_id,
  now() - make_interval(days => seed.opened_days_ago),
  now() - make_interval(days => greatest(seed.opened_days_ago - task.ordinal, 0))
from seed_cases seed
cross join seed_context context
cross join (values
  (1, 'Verify installation site'),
  (2, 'Confirm materials and hardware'),
  (3, 'Complete sign installation'),
  (4, 'Perform final inspection')
) task(ordinal, title)
on conflict (id) do update
set title = excluded.title,
    description = excluded.description,
    assigned_user_id = excluded.assigned_user_id,
    status = excluded.status,
    required = excluded.required,
    due_at = excluded.due_at,
    completed_at = excluded.completed_at,
    completed_by_user_id = excluded.completed_by_user_id,
    sequence = excluded.sequence
where public.case_tasks.organization_id = excluded.organization_id
  and public.case_tasks.case_id = excluded.case_id;

-- Use the production response RPC so type/option validation, authorization, and
-- activity auditing remain authoritative. Existing seed responses are untouched,
-- avoiding duplicate response audit events on a second run.
select set_config('request.jwt.claim.sub', (select actor_user_id::text from seed_context), true);
set local role authenticated;

with response_plan(case_id, answered_count) as (
  values
    ('f0bb5400-0000-4000-8000-000000000001'::uuid, 0),
    ('f0bb5400-0000-4000-8000-000000000002'::uuid, 3),
    ('f0bb5400-0000-4000-8000-000000000003'::uuid, 5),
    ('f0bb5400-0000-4000-8000-000000000004'::uuid, 7),
    ('f0bb5400-0000-4000-8000-000000000005'::uuid, 2),
    ('f0bb5400-0000-4000-8000-000000000006'::uuid, 4),
    ('f0bb5400-0000-4000-8000-000000000007'::uuid, 9),
    ('f0bb5400-0000-4000-8000-000000000008'::uuid, 10),
    ('f0bb5400-0000-4000-8000-000000000009'::uuid, 10),
    ('f0bb5400-0000-4000-8000-000000000010'::uuid, 6)
), ranked as (
  select
    question.id,
    row_number() over (partition by question.case_id order by question.display_order, question.id) as ordinal,
    plan.answered_count,
    case question.response_type
      when 'SINGLE_SELECT' then case when question.question_text = 'What mounting method is required?' then to_jsonb('GROUND_POST'::text) else to_jsonb('REGULATORY'::text) end
      when 'YES_NO' then 'true'::jsonb
      when 'DATE' then to_jsonb(to_char(current_date + 14, 'YYYY-MM-DD'))
      when 'TEXT' then to_jsonb('Seed response'::text)
      when 'LONG_TEXT' then to_jsonb('Seed response'::text)
      when 'NUMBER' then '1'::jsonb
      when 'MULTI_SELECT' then '[]'::jsonb
    end as response_value
  from public.case_questions question
  join response_plan plan on plan.case_id = question.case_id
  where question.question_definition_id in (
    'f0bb5200-0000-4000-8000-000000000001',
    'f0bb5200-0000-4000-8000-000000000002',
    'f0bb5200-0000-4000-8000-000000000003',
    'f0bb5200-0000-4000-8000-000000000004',
    'f0bb5200-0000-4000-8000-000000000005',
    'f0bb5200-0000-4000-8000-000000000006',
    'f0bb5200-0000-4000-8000-000000000007',
    'f0bb5200-0000-4000-8000-000000000008',
    'f0bb5200-0000-4000-8000-000000000009',
    'f0bb5200-0000-4000-8000-000000000010'
  )
), pending as (
  select ranked.*
  from ranked
  where not exists (select 1 from public.case_question_responses response where response.case_question_id = ranked.id)
)
select public.save_case_question_response(pending.id, pending.response_value)
from pending
where pending.ordinal <= pending.answered_count
order by pending.id;

reset role;

-- Restore the intended repeatable workload state after tasks/responses exist.
update public.cases target
set title = seed.title,
    description = 'Fictional road and street-sign installation workload [seed:fobbs-quality-signs-stress:v1]',
    case_type = 'Sign Installation',
    priority = seed.priority,
    status = seed.status,
    opened_at = now() - make_interval(days => seed.opened_days_ago),
    due_at = case when seed.due_days is null then null else ((current_date + seed.due_days) + time '17:00') at time zone context.timezone end,
    completed_at = case when seed.status in ('COMPLETED', 'CLOSED') then now() - interval '2 days' else null end,
    closed_at = case when seed.status = 'CLOSED' then now() - interval '1 day' else null end,
    manager_user_id = case when seed.assigned then context.actor_user_id else null end
from seed_cases seed, seed_context context
where target.id = seed.id
  and target.organization_id = context.organization_id;

do $$
declare
  target_org uuid := (select organization_id from seed_context);
begin
  if (select count(*) from public.customers c join seed_customers s on s.id = c.id where c.organization_id = target_org) <> 10 then
    raise exception 'seed validation failed: expected exactly 10 intended customers';
  end if;
  if (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org) <> 10 then
    raise exception 'seed validation failed: expected exactly 10 intended Cases';
  end if;
  if (select count(*) from public.question_definitions q join seed_questions s on s.id = q.id where q.organization_id = target_org) <> 10 then
    raise exception 'seed validation failed: expected exactly 10 intended Question Definitions';
  end if;
  if (select count(*) from public.question_options o join seed_options s on s.id = o.id where o.organization_id = target_org) <> 15 then
    raise exception 'seed validation failed: expected exactly 15 intended Question Options';
  end if;
  if (
    select count(*)
    from public.case_questions q
    join seed_cases c on c.id = q.case_id
    join seed_questions definition on definition.id = q.question_definition_id
    where q.organization_id = target_org
  ) <> 100 then
    raise exception 'seed validation failed: expected 100 materialized Case Questions';
  end if;
  if (
    select count(*)
    from public.case_question_responses r
    join public.case_questions q on q.id = r.case_question_id and q.organization_id = r.organization_id
    join seed_cases c on c.id = r.case_id
    join seed_questions definition on definition.id = q.question_definition_id
    where r.organization_id = target_org
  ) < 56 then
    raise exception 'seed validation failed: expected at least 56 intended Case responses';
  end if;
  if (select count(*) from public.case_tasks t join seed_cases s on s.id = t.case_id where t.organization_id = target_org and t.description = 'Fictional operational task.') <> 40 then
    raise exception 'seed validation failed: expected exactly 40 intended Case tasks';
  end if;
  if (
    select count(*)
    from public.case_tasks t
    join seed_cases s on s.id = t.case_id
    where t.organization_id = target_org
      and t.description = 'Fictional operational task.'
      and t.status not in ('COMPLETED', 'NOT_APPLICABLE')
      and t.due_at < now()
  ) < 6 then
    raise exception 'seed validation failed: expected at least six overdue incomplete Case tasks';
  end if;
  if (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org and c.manager_user_id is null) <> 2 then
    raise exception 'seed validation failed: expected exactly two unassigned Cases';
  end if;
  if (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org and c.priority = 'HIGH') <> 2
    or (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org and c.priority = 'NORMAL') <> 6
    or (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org and c.priority = 'LOW') <> 2 then
    raise exception 'seed validation failed: priority distribution changed';
  end if;
  if (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org and c.status = 'UNASSIGNED') <> 1
    or (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org and c.status = 'IN_PROGRESS') <> 3
    or (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org and c.status = 'WAITING') <> 2
    or (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org and c.status = 'REVIEW') <> 1
    or (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org and c.status = 'COMPLETED') <> 1
    or (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org and c.status = 'CLOSED') <> 1
    or (select count(*) from public.cases c join seed_cases s on s.id = c.id where c.organization_id = target_org and c.status = 'ASSIGNED') <> 1 then
    raise exception 'seed validation failed: Case status distribution changed';
  end if;
  if (
    select count(*)
    from public.cases c
    join seed_cases s on s.id = c.id
    where c.organization_id = target_org
      and c.due_at < now()
      and c.status not in ('COMPLETED', 'CLOSED', 'CANCELLED')
  ) <> 2 then
    raise exception 'seed validation failed: expected exactly two active overdue Cases';
  end if;
  if exists (
    select 1 from public.case_assignments assignment
    join seed_cases seed on seed.id = assignment.case_id
    join public.platform_user_roles platform on platform.user_id = assignment.user_id and platform.role = 'SUPER_ADMIN' and platform.is_active
    where assignment.organization_id = target_org and assignment.is_active
  ) then
    raise exception 'seed validation failed: SUPER_ADMIN Case assignment found';
  end if;
  if exists (
    select 1 from public.customer_portal_users portal
    join seed_customers seed on seed.id = portal.customer_id
    where portal.organization_id = target_org
  ) then
    raise exception 'seed validation failed: Customer Portal access was attached to a seed customer';
  end if;
  if exists (
    select 1 from public.service_requests request
    join seed_customers seed on seed.id = request.customer_id
    where request.organization_id = target_org
  ) then
    raise exception 'seed validation failed: Service Requests exist for seed customers';
  end if;
end
$$;

select
  (select organization_id from seed_context) as organization_id,
  (select count(*) from public.customers c join seed_customers s on s.id = c.id) as seeded_customers,
  (select count(*) from public.cases c join seed_cases s on s.id = c.id) as seeded_cases,
  (select count(*) from public.question_definitions q join seed_questions s on s.id = q.id) as seeded_questions,
  (select count(*) from public.case_questions q join seed_cases c on c.id = q.case_id join seed_questions definition on definition.id = q.question_definition_id) as materialized_case_questions,
  (select count(*) from public.case_question_responses r join public.case_questions q on q.id = r.case_question_id join seed_cases c on c.id = r.case_id join seed_questions definition on definition.id = q.question_definition_id) as seeded_responses,
  (select count(*) from public.case_tasks t join seed_cases s on s.id = t.case_id where t.description = 'Fictional operational task.') as seeded_tasks;

commit;
