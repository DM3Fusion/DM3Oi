-- Organization-configurable Case Title / Case Type compatibility.
--
-- Existing organizations retain their prior unrestricted behavior through
-- an initial cross-product backfill. Mimms' Tax Service receives a curated
-- compatibility map so Guided Intake cannot create contradictory pairs.

create table public.organization_case_title_type_mappings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_title_id uuid not null,
  case_type_id uuid not null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, case_title_id, case_type_id),
  foreign key (organization_id, case_title_id)
    references public.organization_case_titles(organization_id, id)
    on delete cascade,
  foreign key (organization_id, case_type_id)
    references public.organization_case_types(organization_id, id)
    on delete cascade
);

create index organization_case_title_type_mappings_type_idx
  on public.organization_case_title_type_mappings(
    organization_id,
    case_type_id,
    case_title_id
  );

alter table public.organization_case_title_type_mappings enable row level security;

create policy organization_case_title_type_mappings_read
  on public.organization_case_title_type_mappings
  for select
  to authenticated
  using (
    public.has_effective_organization_permission(
      organization_id,
      'CREATE_CASE'
    )
    or public.has_effective_organization_permission(
      organization_id,
      'VIEW_ADMINISTRATION'
    )
  );

create policy organization_case_title_type_mappings_admin_insert
  on public.organization_case_title_type_mappings
  for insert
  to authenticated
  with check (
    public.has_effective_organization_permission(
      organization_id,
      'MANAGE_ORGANIZATION_SETTINGS'
    )
  );

create policy organization_case_title_type_mappings_admin_delete
  on public.organization_case_title_type_mappings
  for delete
  to authenticated
  using (
    public.has_effective_organization_permission(
      organization_id,
      'MANAGE_ORGANIZATION_SETTINGS'
    )
  );

grant select, insert, delete
  on public.organization_case_title_type_mappings
  to authenticated;

insert into public.organization_case_title_type_mappings(
  organization_id,
  case_title_id,
  case_type_id
)
select
  title.organization_id,
  title.id,
  case_type.id
from public.organization_case_titles title
join public.organization_case_types case_type
  on case_type.organization_id = title.organization_id
on conflict do nothing;

delete from public.organization_case_title_type_mappings
where organization_id = 'e5a00c5a-f028-47f8-bb34-5527219eb995';

with desired(title_label, type_name) as (
  values
    ('New Client — Refund Advance', 'New Refund Advance Return'),
    ('Returning Client — Refund Advance', 'Returning Refund Advance Return'),

    ('W-2 Annual Return', 'Standard Tax Preparation'),
    ('Self-Employed / 1099 Return', 'Standard Tax Preparation'),
    ('W-2 + Self-Employment Return', 'Standard Tax Preparation'),
    ('Dependents / Child Tax Credit', 'Standard Tax Preparation'),
    ('Earned Income Credit', 'Standard Tax Preparation'),
    ('Education Credit', 'Standard Tax Preparation'),
    ('Retirement / Social Security Income', 'Standard Tax Preparation'),
    ('Multi-State Return', 'Standard Tax Preparation'),

    ('Missing Tax Documents', 'New Refund Advance Return'),
    ('Missing Tax Documents', 'Returning Refund Advance Return'),
    ('Missing Tax Documents', 'Standard Tax Preparation'),
    ('Missing Tax Documents', 'Prior-Year Refund Return'),
    ('Missing Tax Documents', 'Amended Refund Return'),

    ('Awaiting W-2 / 1099', 'New Refund Advance Return'),
    ('Awaiting W-2 / 1099', 'Returning Refund Advance Return'),
    ('Awaiting W-2 / 1099', 'Standard Tax Preparation'),
    ('Awaiting W-2 / 1099', 'Prior-Year Refund Return'),
    ('Awaiting W-2 / 1099', 'Amended Refund Return'),

    ('Identity Verification Required', 'New Refund Advance Return'),
    ('Identity Verification Required', 'Returning Refund Advance Return'),
    ('Identity Verification Required', 'Standard Tax Preparation'),
    ('Identity Verification Required', 'Prior-Year Refund Return'),
    ('Identity Verification Required', 'Amended Refund Return'),

    ('Prior-Year Return', 'Prior-Year Refund Return'),
    ('Amended Return', 'Amended Refund Return'),

    ('Federal Refund Delayed', 'Refund Issue / Exception'),
    ('State Refund Delayed', 'Refund Issue / Exception'),
    ('Refund Offset / Intercept', 'Refund Issue / Exception'),
    ('Refund Amount Reduced', 'Refund Issue / Exception'),
    ('Refund Amount Greater Than Expected', 'Refund Issue / Exception'),
    ('Refund Check Not Received', 'Refund Issue / Exception'),

    ('Refund Check Received', 'Repayment / Settlement'),
    ('Refund Payment Reconciliation', 'Repayment / Settlement'),
    ('Advance Balance Remaining', 'Repayment / Settlement'),

    ('IRS Notice Received', 'Tax Notice / Follow-Up'),
    ('State Tax Notice Received', 'Tax Notice / Follow-Up')
)
insert into public.organization_case_title_type_mappings(
  organization_id,
  case_title_id,
  case_type_id
)
select
  title.organization_id,
  title.id,
  case_type.id
from desired
join public.organization_case_titles title
  on title.organization_id =
    'e5a00c5a-f028-47f8-bb34-5527219eb995'
 and lower(trim(title.label)) = lower(trim(desired.title_label))
join public.organization_case_types case_type
  on case_type.organization_id = title.organization_id
 and lower(trim(case_type.name)) = lower(trim(desired.type_name));

create or replace function public.save_case_type_title_mappings(
  target_case_type_id uuid,
  target_case_title_ids uuid[]
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  target_organization_id uuid;
  normalized_title_ids uuid[] := coalesce(target_case_title_ids, '{}'::uuid[]);
begin
  select case_type.organization_id
    into target_organization_id
  from public.organization_case_types case_type
  where case_type.id = target_case_type_id;

  if target_organization_id is null then
    raise exception 'Case Type not found' using errcode='P0002';
  end if;

  if actor is null
    or not public.has_effective_organization_permission(
      target_organization_id,
      'MANAGE_ORGANIZATION_SETTINGS'
    )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if cardinality(normalized_title_ids) <> (
    select count(distinct title_id)
    from unnest(normalized_title_ids) title_id
  ) then
    raise exception 'duplicate Case Title mapping' using errcode='23514';
  end if;

  if exists (
    select 1
    from unnest(normalized_title_ids) title_id
    where not exists (
      select 1
      from public.organization_case_titles title
      where title.id = title_id
        and title.organization_id = target_organization_id
    )
  ) then
    raise exception 'invalid Case Title mapping' using errcode='23514';
  end if;

  delete from public.organization_case_title_type_mappings mapping
  where mapping.organization_id = target_organization_id
    and mapping.case_type_id = target_case_type_id;

  insert into public.organization_case_title_type_mappings(
    organization_id,
    case_title_id,
    case_type_id,
    created_by_user_id
  )
  select
    target_organization_id,
    title_id,
    target_case_type_id,
    actor
  from unnest(normalized_title_ids) title_id;
end
$$;

revoke all on function public.save_case_type_title_mappings(uuid, uuid[])
  from public, anon;
grant execute on function public.save_case_type_title_mappings(uuid, uuid[])
  to authenticated;

create or replace function public.enforce_case_title_type_compatibility()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.case_title_id is null or new.case_type_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.organization_case_title_type_mappings mapping
    where mapping.organization_id = new.organization_id
      and mapping.case_title_id = new.case_title_id
      and mapping.case_type_id = new.case_type_id
  ) then
    raise exception 'Case Title is not compatible with selected Case Type'
      using errcode='23514';
  end if;

  return new;
end
$$;

revoke all on function public.enforce_case_title_type_compatibility()
  from public, anon, authenticated;

create trigger cases_title_type_compatibility
before insert or update of case_title_id, case_type_id
on public.cases
for each row
execute function public.enforce_case_title_type_compatibility();
