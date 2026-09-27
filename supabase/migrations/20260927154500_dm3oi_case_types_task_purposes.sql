-- DM3Oi Case Type semantics and configurable Task Purposes.
-- Legacy Case Titles remain stored for historical compatibility but are no longer
-- part of the active organization Case Configuration model.

alter table public.organization_case_types
  add column if not exists customer_mode text not null default 'ANY',
  add column if not exists tax_year_rule text not null default 'ANY_YEAR';

alter table public.organization_case_types
  drop constraint if exists organization_case_types_customer_mode_check;

alter table public.organization_case_types
  add constraint organization_case_types_customer_mode_check
  check (customer_mode in ('ANY','NEW','EXISTING'));

alter table public.organization_case_types
  drop constraint if exists organization_case_types_tax_year_rule_check;

alter table public.organization_case_types
  add constraint organization_case_types_tax_year_rule_check
  check (tax_year_rule in ('ANY_YEAR','CURRENT_YEAR','PRIOR_YEAR_REQUIRED'));

create table if not exists public.organization_task_purposes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);

create unique index if not exists organization_task_purposes_active_label_uidx
  on public.organization_task_purposes(organization_id,lower(label))
  where is_active;

create index if not exists organization_task_purposes_order_idx
  on public.organization_task_purposes(organization_id,is_active,sort_order,label);

alter table public.organization_task_purposes enable row level security;

drop policy if exists organization_task_purposes_select on public.organization_task_purposes;
create policy organization_task_purposes_select
on public.organization_task_purposes
for select to authenticated
using (
  public.has_effective_organization_permission(organization_id,'VIEW_TASKS')
  or public.has_effective_organization_permission(organization_id,'MANAGE_TASKS')
  or public.has_effective_organization_permission(organization_id,'MANAGE_ORGANIZATION_SETTINGS')
);

drop policy if exists organization_task_purposes_insert on public.organization_task_purposes;
create policy organization_task_purposes_insert
on public.organization_task_purposes
for insert to authenticated
with check (
  public.has_effective_organization_permission(organization_id,'MANAGE_ORGANIZATION_SETTINGS')
);

drop policy if exists organization_task_purposes_update on public.organization_task_purposes;
create policy organization_task_purposes_update
on public.organization_task_purposes
for update to authenticated
using (
  public.has_effective_organization_permission(organization_id,'MANAGE_ORGANIZATION_SETTINGS')
)
with check (
  public.has_effective_organization_permission(organization_id,'MANAGE_ORGANIZATION_SETTINGS')
);

grant select,insert,update on public.organization_task_purposes to authenticated;

alter table public.case_tasks
  add column if not exists task_purpose_id uuid;

alter table public.case_tasks
  drop constraint if exists case_tasks_task_purpose_fkey;

alter table public.case_tasks
  add constraint case_tasks_task_purpose_fkey
  foreign key (organization_id,task_purpose_id)
  references public.organization_task_purposes(organization_id,id)
  on delete restrict;

create index if not exists case_tasks_task_purpose_idx
  on public.case_tasks(organization_id,task_purpose_id);

insert into public.organization_task_purposes(
  organization_id,label,description,is_active,sort_order
)
select
  o.id,
  seed.label,
  seed.description,
  true,
  seed.sort_order
from public.organizations o
cross join (
  values
    ('Tax Notice / Follow-Up','Tax authority notice or related follow-up work.',10),
    ('Refund Issue / Exception','Refund delay, reduction, offset, intercept, or other exception.',20),
    ('Repayment / Settlement','Repayment, reconciliation, settlement, or related follow-up.',30),
    ('Missing W-2 / 1099','Customer must provide a missing W-2, 1099, or similar income document.',40),
    ('Identity Verification','Identity verification work is required.',50),
    ('Missing Documents','Additional customer documentation is required.',60),
    ('Amendment','Work related to amending the existing tax-year return.',70),
    ('Client Callback','Customer callback or direct follow-up is required.',80),
    ('IRS Follow-Up','Follow-up with the Internal Revenue Service is required.',90)
) as seed(label,description,sort_order)
where o.slug='mtservice'
  and not exists (
    select 1
    from public.organization_task_purposes existing
    where existing.organization_id=o.id
      and lower(existing.label)=lower(seed.label)
  );

update public.organization_case_types
set is_active=false,
    updated_at=now()
where organization_id=(
  select id from public.organizations where slug='mtservice'
)
and name in (
  'New Refund Advance Return',
  'Returning Refund Advance Return',
  'Standard Tax Preparation',
  'Prior-Year Refund Return',
  'Amended Refund Return',
  'Refund Issue / Exception',
  'Repayment / Settlement',
  'Tax Notice / Follow-Up'
);

insert into public.organization_case_types(
  organization_id,name,description,is_active,sort_order,customer_mode,tax_year_rule
)
select
  o.id,
  seed.name,
  seed.description,
  true,
  seed.sort_order,
  seed.customer_mode,
  seed.tax_year_rule
from public.organizations o
cross join (
  values
    (
      'Cash Advance - New Customer',
      'Current-year return with a cash advance for a new Customer.',
      10,'NEW','CURRENT_YEAR'
    ),
    (
      'Cash Advance - Existing Customer',
      'Current-year return with a cash advance for an existing Customer.',
      20,'EXISTING','CURRENT_YEAR'
    ),
    (
      'No Advance - New Customer',
      'Current-year return without a cash advance for a new Customer.',
      30,'NEW','CURRENT_YEAR'
    ),
    (
      'No Advance - Existing Customer',
      'Current-year return without a cash advance for an existing Customer.',
      40,'EXISTING','CURRENT_YEAR'
    ),
    (
      'Prior-Year - New Customer',
      'Prior-year return for a new Customer.',
      50,'NEW','PRIOR_YEAR_REQUIRED'
    ),
    (
      'Prior-Year - Existing Customer',
      'Prior-year return for an existing Customer.',
      60,'EXISTING','PRIOR_YEAR_REQUIRED'
    )
) as seed(name,description,sort_order,customer_mode,tax_year_rule)
where o.slug='mtservice'
and not exists (
  select 1
  from public.organization_case_types existing
  where existing.organization_id=o.id
    and lower(existing.name)=lower(seed.name)
);

create or replace view public.organization_case_tasks
with (security_invoker=true)
as
select
  t.id,
  t.organization_id,
  t.case_id,
  t.title,
  t.description,
  t.assigned_user_id,
  t.status,
  t.required,
  t.due_at,
  t.completed_at,
  public.organization_actor_id(t.completed_by_user_id) as completed_by_user_id,
  public.organization_actor_label(t.completed_by_user_id) as completed_by_display_name,
  t.sequence,
  public.organization_actor_id(t.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(t.created_by_user_id) as created_by_display_name,
  t.created_at,
  t.updated_at,
  t.priority,
  t.blocking,
  t.source_rule_action_id is not null as generated_by_rule,
  t.intake_follow_up_id is not null as generated_by_intake,
  t.intake_question_definition_id,
  t.intake_requirement_context,
  t.task_purpose_id,
  purpose.label as task_purpose_label
from public.case_tasks t
left join public.organization_task_purposes purpose
  on purpose.organization_id=t.organization_id
 and purpose.id=t.task_purpose_id
where public.can_access_case(t.case_id,t.organization_id,auth.uid());

-- Preserve the currently deployed create_case_task overload during
-- migration-first deployment. The Task Purpose-aware overload is additive.

create function public.create_case_task(
  target_case_id uuid,
  target_task_purpose_id uuid,
  target_title text,
  target_description text default '',
  target_assigned_user_id uuid default null,
  target_required boolean default true,
  target_due_date date default null,
  target_priority public.priority_level default 'NORMAL',
  target_blocking boolean default false
)
returns public.case_tasks
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  item public.cases;
  created public.case_tasks;
  next_sequence integer;
begin
  select * into item
  from public.cases
  where id=target_case_id;

  if not found then
    raise exception 'case not found' using errcode='P0002';
  end if;

  if not public.has_effective_organization_permission(item.organization_id,'MANAGE_TASKS')
     or not public.can_access_case(item.id,item.organization_id,actor) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if length(trim(coalesce(target_title,'')))=0 then
    raise exception 'Task title is required' using errcode='23514';
  end if;

  if target_due_date is null then
    raise exception 'Task Due Date is required' using errcode='23514';
  end if;

  if target_task_purpose_id is null or not exists(
    select 1
    from public.organization_task_purposes purpose
    where purpose.id=target_task_purpose_id
      and purpose.organization_id=item.organization_id
      and purpose.is_active
  ) then
    raise exception 'Task Purpose is required' using errcode='23514';
  end if;

  if target_assigned_user_id is not null
     and not public.is_internal_member(item.organization_id,target_assigned_user_id) then
    raise exception 'invalid task assignee' using errcode='23514';
  end if;

  select coalesce(max(sequence),0)+1
  into next_sequence
  from public.case_tasks
  where case_id=item.id;

  insert into public.case_tasks(
    organization_id,
    case_id,
    task_purpose_id,
    title,
    description,
    assigned_user_id,
    status,
    required,
    due_at,
    sequence,
    created_by_user_id,
    priority,
    blocking
  )
  values(
    item.organization_id,
    item.id,
    target_task_purpose_id,
    trim(target_title),
    coalesce(target_description,''),
    target_assigned_user_id,
    'NOT_STARTED',
    target_required,
    public.organization_end_of_date(item.organization_id,target_due_date),
    next_sequence,
    actor,
    target_priority,
    target_blocking
  )
  returning * into created;

  insert into public.case_activity(
    organization_id,case_id,actor_user_id,event_type,event_data
  )
  values(
    item.organization_id,
    item.id,
    actor,
    'TASK_CREATED',
    jsonb_build_object(
      'task_id',created.id,
      'title',created.title,
      'task_purpose_id',created.task_purpose_id
    )
  );

  return created;
end
$$;

-- Preserve the currently deployed update_case_task overload during
-- migration-first deployment. The Task Purpose-aware overload is additive.

create function public.update_case_task(
  target_task_id uuid,
  target_task_purpose_id uuid,
  target_title text,
  target_description text,
  target_assigned_user_id uuid,
  target_status public.case_task_status,
  target_required boolean,
  target_due_date date
)
returns public.case_tasks
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  existing public.case_tasks;
  changed public.case_tasks;
  event_name text:='TASK_UPDATED';
  can_manage boolean;
begin
  select * into existing
  from public.case_tasks
  where id=target_task_id
  for update;

  if not found then
    raise exception 'task not found' using errcode='P0002';
  end if;

  if not public.has_effective_organization_permission(existing.organization_id,'WORK_TASKS')
     or not public.can_access_case(existing.case_id,existing.organization_id,actor) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  can_manage:=
    public.has_effective_organization_permission(existing.organization_id,'MANAGE_TASKS');

  if not public.can_manage_case(existing.organization_id,actor)
     and existing.assigned_user_id<>actor
     and not can_manage then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if (
    target_title<>existing.title
    or target_description<>existing.description
    or target_required<>existing.required
    or target_due_date is not null
    or target_task_purpose_id is distinct from existing.task_purpose_id
  ) and not can_manage then
    raise exception 'task management permission required' using errcode='42501';
  end if;

  if can_manage and target_due_date is null then
    raise exception 'Task Due Date is required when updating a Task' using errcode='23514';
  end if;

  if can_manage
     and existing.source_rule_action_id is null
     and existing.intake_follow_up_id is null
     and target_task_purpose_id is null then
    raise exception 'Task Purpose is required' using errcode='23514';
  end if;

  if target_task_purpose_id is not null
     and not exists(
       select 1
       from public.organization_task_purposes purpose
       where purpose.id=target_task_purpose_id
         and purpose.organization_id=existing.organization_id
         and purpose.is_active
     ) then
    raise exception 'invalid Task Purpose' using errcode='23514';
  end if;

  if target_assigned_user_id is distinct from existing.assigned_user_id
     and not public.has_effective_organization_permission(
       existing.organization_id,'ASSIGN_TASKS'
     ) then
    raise exception 'task assignment permission required' using errcode='42501';
  end if;

  if target_assigned_user_id is not null
     and not public.is_internal_member(
       existing.organization_id,target_assigned_user_id
     ) then
    raise exception 'invalid task assignee' using errcode='23514';
  end if;

  update public.case_tasks
  set
    task_purpose_id=case
      when can_manage then target_task_purpose_id
      else existing.task_purpose_id
    end,
    title=case when can_manage then trim(target_title) else existing.title end,
    description=case
      when can_manage then coalesce(target_description,'')
      else existing.description
    end,
    assigned_user_id=target_assigned_user_id,
    status=target_status,
    required=case when can_manage then target_required else existing.required end,
    due_at=case
      when target_due_date is null then existing.due_at
      else public.organization_end_of_date(
        existing.organization_id,target_due_date
      )
    end,
    prior_actionable_status=case
      when target_status='NOT_APPLICABLE' then prior_actionable_status
      else null
    end
  where id=existing.id
  returning * into changed;

  if target_status='COMPLETED' and existing.status<>'COMPLETED' then
    event_name:='TASK_COMPLETED';
  elsif target_status='IN_PROGRESS' and existing.status<>'IN_PROGRESS' then
    event_name:='TASK_STARTED';
  elsif target_assigned_user_id is distinct from existing.assigned_user_id then
    event_name:='TASK_ASSIGNED';
  end if;

  insert into public.case_activity(
    organization_id,case_id,actor_user_id,event_type,event_data
  )
  values(
    changed.organization_id,
    changed.case_id,
    actor,
    event_name,
    jsonb_build_object(
      'task_id',changed.id,
      'before_status',existing.status,
      'after_status',changed.status,
      'before_assigned_user_id',existing.assigned_user_id,
      'after_assigned_user_id',changed.assigned_user_id,
      'before_task_purpose_id',existing.task_purpose_id,
      'after_task_purpose_id',changed.task_purpose_id
    )
  );

  return changed;
end
$$;

revoke all on function public.create_case_task(
  uuid,uuid,text,text,uuid,boolean,date,public.priority_level,boolean
) from public,anon;

revoke all on function public.update_case_task(
  uuid,uuid,text,text,uuid,public.case_task_status,boolean,date
) from public,anon;

grant execute on function public.create_case_task(
  uuid,uuid,text,text,uuid,boolean,date,public.priority_level,boolean
) to authenticated;

grant execute on function public.update_case_task(
  uuid,uuid,text,text,uuid,public.case_task_status,boolean,date
) to authenticated;

comment on table public.organization_task_purposes is
  'Organization-configurable purposes for manually tracked Case Tasks.';

comment on column public.case_tasks.task_purpose_id is
  'Purpose classification for a Case Task. Historical and system-generated Tasks may remain null.';
