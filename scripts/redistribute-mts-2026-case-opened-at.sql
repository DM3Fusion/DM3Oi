-- Manual, one-tenant demo-data correction. This is intentionally not a migration.
-- Review the preview result, then run the entire transaction once in the linked
-- remote Supabase SQL editor. It fails closed unless the expected MTS population
-- is still present and every proposed opened_at remains on/before due_at.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create temporary table mts_2026_opening_plan on commit drop as
with target_organization as (
  select organization.id, coalesce(settings.timezone, 'UTC') as timezone
  from public.organizations organization
  left join public.organization_settings settings
    on settings.organization_id = organization.id
  where organization.name = 'Mimms'' Tax Service'
    and organization.status = 'ACTIVE'
), ranked as (
  select
    cases.id,
    cases.case_number,
    cases.due_at,
    cases.completed_at,
    organization.timezone,
    row_number() over (order by cases.due_at, cases.case_number, cases.id) as ordinal,
    count(*) over () as population
  from public.cases cases
  cross join target_organization organization
  where cases.organization_id = organization.id
    and cases.tax_year = 2026
)
select
  id,
  case_number,
  timezone,
  (
    date '2026-10-01'
    + floor(((ordinal - 1) * 91.0) / greatest(population - 1, 1))::integer
    + time '09:00'
  ) at time zone timezone as proposed_opened_at,
  due_at,
  completed_at
from ranked;

do $$
declare
  organization_count integer;
  planned_count integer;
  invalid_count integer;
begin
  select count(*) into organization_count
  from public.organizations
  where name = 'Mimms'' Tax Service' and status = 'ACTIVE';

  if organization_count <> 1 then
    raise exception 'Expected exactly one active Mimms'' Tax Service organization; found %', organization_count;
  end if;

  select count(*) into planned_count from mts_2026_opening_plan;
  if planned_count <> 95 then
    raise exception 'Expected exactly 95 MTS 2026 Cases; found %', planned_count;
  end if;

  select count(*) into invalid_count
  from mts_2026_opening_plan
  where (proposed_opened_at at time zone timezone)::date
          not between date '2026-10-01' and date '2026-12-31'
     or due_at is null
     or proposed_opened_at > due_at
     or (completed_at is not null and proposed_opened_at > completed_at);

  if invalid_count <> 0 then
    raise exception 'Opening-date plan violates range/due/completion ordering for % Cases', invalid_count;
  end if;
end $$;

-- Return the exact deterministic plan. All fail-closed validation above completes
-- before the UPDATE is reached.
select case_number, proposed_opened_at, due_at, completed_at
from mts_2026_opening_plan
order by proposed_opened_at, case_number;

update public.cases cases
set opened_at = plan.proposed_opened_at
from mts_2026_opening_plan plan
where cases.id = plan.id;

do $$
begin
  if (select count(*) from mts_2026_opening_plan) <> 95
     or (select count(*) from public.cases cases join mts_2026_opening_plan plan on plan.id = cases.id where cases.opened_at = plan.proposed_opened_at) <> 95 then
    raise exception 'MTS opening-date update verification failed';
  end if;
end $$;

select
  date_trunc('month', opened_at at time zone 'America/New_York')::date as opening_month,
  count(*) as cases_opened
from public.cases
where id in (select id from mts_2026_opening_plan)
group by 1
order by 1;

commit;
