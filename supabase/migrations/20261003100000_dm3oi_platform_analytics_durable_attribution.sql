begin;

-- Platform Analytics is durable, platform-owned telemetry. These opaque UUIDs
-- preserve historical attribution after the corresponding live FK is detached.
-- They intentionally carry no FK and snapshot no identity or tenant content.
alter table public.analytics_page_views
  add column analytics_user_key uuid,
  add column analytics_organization_key uuid;

-- Only attribution that still exists can be backfilled. Previously deleted rows
-- and already-null live references cannot be reconstructed by this migration.
update public.analytics_page_views
set
  analytics_user_key = user_id,
  analytics_organization_key = organization_id
where user_id is not null
   or organization_id is not null;

create index analytics_page_views_user_key_created_idx
  on public.analytics_page_views (analytics_user_key, created_at desc)
  where analytics_user_key is not null;

create index analytics_page_views_organization_key_created_idx
  on public.analytics_page_views (analytics_organization_key, created_at desc)
  where analytics_organization_key is not null;

create function public.guard_analytics_page_view_attribution_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.analytics_user_key is distinct from old.analytics_user_key
     or new.analytics_organization_key is distinct from old.analytics_organization_key then
    raise exception 'analytics attribution keys are immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger analytics_page_views_attribution_keys_immutable
before update of analytics_user_key, analytics_organization_key
on public.analytics_page_views
for each row
execute function public.guard_analytics_page_view_attribution_keys();

revoke all on function public.guard_analytics_page_view_attribution_keys()
  from public, anon, authenticated;

create function public.get_platform_analytics(
  target_start timestamptz,
  target_end_exclusive timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_start is not null
     and target_end_exclusive is not null
     and target_end_exclusive <= target_start then
    raise exception 'analytics range end must be after start'
      using errcode = '22023';
  end if;

  with filtered as materialized (
    select
      session_id,
      analytics_user_key,
      analytics_organization_key,
      normalized_path,
      device_type,
      device_model,
      browser,
      operating_system,
      country_code,
      region_code,
      city,
      traffic_type,
      created_at
    from public.analytics_page_views
    where (target_start is null or created_at >= target_start)
      and (target_end_exclusive is null or created_at < target_end_exclusive)
  )
  select jsonb_build_object(
    'pageViews', (select count(*) from filtered),
    'sessions', (select count(distinct session_id) from filtered),
    'users', (
      select count(distinct analytics_user_key)
      from filtered
      where analytics_user_key is not null
    ),
    'organizations', (
      select count(distinct analytics_organization_key)
      from filtered
      where analytics_organization_key is not null
    ),
    'trafficDays', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('key', day_key, 'value', page_views)
          order by day_key
        ),
        '[]'::jsonb
      )
      from (
        select
          to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day_key,
          count(*) as page_views
        from filtered
        group by 1
      ) daily
    ),
    'deviceBreakdown', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('label', label, 'value', page_views)
          order by page_views desc, label
        ),
        '[]'::jsonb
      )
      from (
        select
          coalesce(device_model, initcap(replace(device_type, '_', ' '))) as label,
          count(*) as page_views
        from filtered
        group by 1
        order by page_views desc, label
        limit 5
      ) devices
    ),
    'browserBreakdown', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('label', label, 'value', page_views)
          order by page_views desc, label
        ),
        '[]'::jsonb
      )
      from (
        select browser as label, count(*) as page_views
        from filtered
        group by browser
        order by page_views desc, label
        limit 5
      ) browsers
    ),
    'operatingSystemBreakdown', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('label', label, 'value', page_views)
          order by page_views desc, label
        ),
        '[]'::jsonb
      )
      from (
        select operating_system as label, count(*) as page_views
        from filtered
        group by operating_system
        order by page_views desc, label
        limit 5
      ) systems
    ),
    'trafficTypeBreakdown', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('label', label, 'value', page_views)
          order by page_views desc, label
        ),
        '[]'::jsonb
      )
      from (
        select
          case traffic_type
            when 'HUMAN' then 'Human'
            when 'LIKELY_BOT' then 'Likely Bot'
            else 'Unclassified'
          end as label,
          count(*) as page_views
        from filtered
        group by traffic_type
      ) traffic
    ),
    'topPages', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('path', normalized_path, 'pageViews', page_views)
          order by page_views desc, normalized_path
        ),
        '[]'::jsonb
      )
      from (
        select normalized_path, count(*) as page_views
        from filtered
        group by normalized_path
      ) pages
    ),
    'geography', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('label', label, 'pageViews', page_views)
          order by page_views desc, label
        ),
        '[]'::jsonb
      )
      from (
        select
          coalesce(
            nullif(
              concat_ws(
                ', ',
                nullif(trim(city), ''),
                nullif(trim(region_code), ''),
                nullif(trim(country_code), '')
              ),
              ''
            ),
            'Unknown'
          ) as label,
          count(*) as page_views
        from filtered
        group by 1
      ) locations
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_platform_analytics(timestamptz, timestamptz)
  from public, anon;

grant execute on function public.get_platform_analytics(timestamptz, timestamptz)
  to authenticated;

-- Page views are append-only telemetry. The interaction endpoint still requires
-- UPDATE to refine traffic classification, but no service path may delete rows.
revoke delete on table public.analytics_page_views from service_role;

comment on function public.get_platform_analytics(timestamptz, timestamptz) is
  'SUPER_ADMIN-only exact Platform Analytics aggregation. A null start selects all retained history and durable snapshot keys preserve deleted live attribution.';

commit;
