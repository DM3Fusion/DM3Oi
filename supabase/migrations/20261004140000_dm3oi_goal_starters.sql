begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================
-- DURABLE STARTER IDENTITY
-- ============================================================

alter table public.goals
  add column starter_key text;

alter table public.goals
  alter column created_by_user_id drop not null;

alter table public.goals
  alter column updated_by_user_id drop not null;

alter table public.goals
  add constraint goals_starter_key_check
  check (
    starter_key is null
    or starter_key in (
      'TAX_SEASON_RETURNS',
      'OVERDUE_TASKS',
      'SERVICE_REQUEST_RESOLUTION',
      'ACTIVE_CUSTOMER_GROWTH'
    )
  );

-- Ordinary user-created Goals retain human actor attribution.
-- System-created starter Goals may truthfully have no human actor.
alter table public.goals
  add constraint goals_creation_actor_check
  check (
    starter_key is not null
    or created_by_user_id is not null
  );

create unique index goals_organization_starter_key_uidx
  on public.goals(organization_id,starter_key)
  where starter_key is not null;

-- ============================================================
-- INCLUDE STARTER IDENTITY IN DEFINITION SNAPSHOTS
-- ============================================================

create or replace function public.goal_definition_snapshot(
  item public.goals
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'goalNumber',item.goal_number,
    'starterKey',item.starter_key,
    'title',item.title,
    'description',item.description,
    'metricLabel',item.metric_label,
    'ownershipScope',item.ownership_scope,
    'ownerUserId',item.owner_user_id,
    'ownerDisplayName',item.owner_display_name_snapshot,
    'measurementDirection',item.measurement_direction,
    'unit',item.unit,
    'currencyCode',item.currency_code,
    'targetValue',item.target_value,
    'baselineValue',item.baseline_value,
    'periodKind',item.period_kind,
    'periodStart',item.period_start,
    'periodEnd',item.period_end,
    'lifecycleStatus',item.lifecycle_status,
    'revision',item.revision
  )
$$;

-- ============================================================
-- CENTRAL IDEMPOTENT STARTER SEEDER
-- ============================================================

create or replace function public.seed_organization_goal_starters(
  target_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_row public.organizations;
  organization_timezone text;
  organization_today date;
  current_year integer;
  tax_year integer;
  annual_start date;
  annual_end date;
  tax_start date;
  tax_end date;
  starter record;
  created_goal public.goals;
  seeded_count integer := 0;
begin
  if target_organization_id is null then
    return 0;
  end if;

  -- Serialize all starter reconciliation for one organization.
  select *
  into organization_row
  from public.organizations organization
  where organization.id=target_organization_id
  for update;

  if not found or organization_row.status<>'ACTIVE' then
    return 0;
  end if;

  select coalesce(settings.timezone,'UTC')
  into organization_timezone
  from public.organization_settings settings
  where settings.organization_id=target_organization_id;

  organization_timezone :=
    coalesce(organization_timezone,'UTC');

  begin
    organization_today :=
      (clock_timestamp() at time zone organization_timezone)::date;
  exception
    when invalid_parameter_value then
      organization_timezone := 'UTC';
      organization_today :=
        (clock_timestamp() at time zone 'UTC')::date;
  end;

  current_year :=
    extract(year from organization_today)::integer;

  annual_start := make_date(current_year,1,1);
  annual_end := make_date(current_year,12,31);

  tax_year :=
    case
      when organization_today<=make_date(current_year,4,10)
        then current_year
      else current_year+1
    end;

  tax_start := make_date(tax_year,1,1);
  tax_end := make_date(tax_year,4,10);

  for starter in
    select *
    from (
      values
        (
          'TAX_SEASON_RETURNS'::text,
          'Complete 150 returns by April 10'::text,
          'Starter Goal: review the return target and tax-season period before activation.'::text,
          'Returns completed'::text,
          'AT_LEAST'::text,
          'COUNT'::text,
          150::numeric,
          0::numeric,
          'CUSTOM'::text,
          tax_start,
          tax_end
        ),
        (
          'OVERDUE_TASKS'::text,
          'Keep overdue Tasks below 10'::text,
          'Starter Goal: keep the number of overdue Tasks below 10. Review the target and period before activation.'::text,
          'Overdue Tasks'::text,
          'AT_MOST'::text,
          'COUNT'::text,
          9::numeric,
          null::numeric,
          'ANNUAL'::text,
          annual_start,
          annual_end
        ),
        (
          'SERVICE_REQUEST_RESOLUTION'::text,
          'Resolve 95% of Service Requests within 2 business days'::text,
          'Starter Goal: manually record the percentage of Service Requests resolved within 2 business days. Review the target and period before activation.'::text,
          'Service Requests resolved within 2 business days'::text,
          'AT_LEAST'::text,
          'PERCENT'::text,
          95::numeric,
          null::numeric,
          'ANNUAL'::text,
          annual_start,
          annual_end
        ),
        (
          'ACTIVE_CUSTOMER_GROWTH'::text,
          'Increase active customers from 400 to 450'::text,
          'Starter Goal: review the customer baseline, target, and annual period before activation.'::text,
          'Active customers'::text,
          'AT_LEAST'::text,
          'COUNT'::text,
          450::numeric,
          400::numeric,
          'ANNUAL'::text,
          annual_start,
          annual_end
        )
    ) as starter_definition(
      starter_key,
      title,
      description,
      metric_label,
      measurement_direction,
      unit,
      target_value,
      baseline_value,
      period_kind,
      period_start,
      period_end
    )
  loop
    if not exists (
      select 1
      from public.goals existing
      where existing.organization_id=
        target_organization_id
        and existing.starter_key=
          starter.starter_key
    ) then
      insert into public.goals(
        organization_id,
        goal_number,
        starter_key,
        title,
        description,
        metric_label,
        progress_source,
        ownership_scope,
        owner_user_id,
        owner_display_name_snapshot,
        measurement_direction,
        unit,
        currency_code,
        target_value,
        baseline_value,
        period_kind,
        period_start,
        period_end,
        lifecycle_status,
        created_by_user_id,
        updated_by_user_id
      )
      values (
        target_organization_id,
        public.next_goal_number(
          target_organization_id
        ),
        starter.starter_key,
        starter.title,
        starter.description,
        starter.metric_label,
        'MANUAL',
        'ORGANIZATION',
        null,
        null,
        starter.measurement_direction,
        starter.unit,
        null,
        starter.target_value,
        starter.baseline_value,
        starter.period_kind,
        starter.period_start,
        starter.period_end,
        'DRAFT',
        null,
        null
      )
      returning *
      into created_goal;

      insert into public.goal_history(
        organization_id,
        goal_id,
        event_type,
        before_data,
        after_data,
        prior_owner_display_name,
        new_owner_display_name,
        note,
        actor_user_id,
        actor_display_name,
        actor_kind
      )
      values (
        created_goal.organization_id,
        created_goal.id,
        'CREATED',
        null,
        public.goal_definition_snapshot(
          created_goal
        ),
        null,
        null,
        'Starter Goal created by DM3Oi for organization review.',
        null,
        'DM3Oi Sys Support',
        'PLATFORM_SUPPORT'
      );

      seeded_count := seeded_count+1;
    end if;
  end loop;

  return seeded_count;
end
$$;

revoke all
on function public.seed_organization_goal_starters(uuid)
from public,anon,authenticated,service_role;

-- ============================================================
-- AUTOMATIC SEEDING FOR NEWLY ACTIVE ORGANIZATIONS
-- ============================================================

create or replace function public.seed_goal_starters_on_organization_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='INSERT' then
    if new.status='ACTIVE' then
      perform public.seed_organization_goal_starters(
        new.id
      );
    end if;

    return new;
  end if;

  if tg_op='UPDATE'
     and new.status='ACTIVE'
     and old.status is distinct from new.status
  then
    perform public.seed_organization_goal_starters(
      new.id
    );
  end if;

  return new;
end
$$;

revoke all
on function public.seed_goal_starters_on_organization_activation()
from public,anon,authenticated,service_role;

drop trigger if exists
  organizations_seed_goal_starters
on public.organizations;

create trigger organizations_seed_goal_starters
after insert or update of status
on public.organizations
for each row
execute function
  public.seed_goal_starters_on_organization_activation();

-- ============================================================
-- BACKFILL EXISTING ACTIVE ORGANIZATIONS
-- ============================================================

do $$
declare
  organization_row record;
begin
  for organization_row in
    select organization.id
    from public.organizations organization
    where organization.status='ACTIVE'
    order by organization.id
  loop
    perform public.seed_organization_goal_starters(
      organization_row.id
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';

commit;
