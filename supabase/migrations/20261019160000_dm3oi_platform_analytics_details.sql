begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.get_platform_analytics_details(
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
  trusted_start timestamptz;
  effective_start timestamptz;
  result jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_start is not null
     and target_end_exclusive is not null
     and target_end_exclusive <= target_start then
    raise exception 'analytics range end must be after start'
      using errcode = '22023';
  end if;

  select baseline.trusted_data_started_at
  into trusted_start
  from public.platform_analytics_trusted_baseline baseline
  where baseline.singleton = true;

  if trusted_start is null then
    raise exception 'platform analytics trusted baseline is unavailable'
      using errcode = '55000';
  end if;

  effective_start := greatest(
    coalesce(target_start, trusted_start),
    trusted_start
  );

  if target_end_exclusive is not null
     and target_end_exclusive <= effective_start then
    return jsonb_build_object(
      'trustedDataStartedAt', trusted_start,
      'deviceTypeBreakdown', '[]'::jsonb
    );
  end if;

  with filtered as materialized (
    select device_type
    from public.analytics_page_views
    where created_at >= effective_start
      and (
        target_end_exclusive is null
        or created_at < target_end_exclusive
      )
  ),
  grouped as (
    select
      case
        when device_type in (
          'DESKTOP', 'MOBILE', 'TABLET', 'OTHER'
        ) then device_type
        else 'UNKNOWN'
      end as device_type,
      count(*)::integer as page_views
    from filtered
    group by 1
  )
  select jsonb_build_object(
    'trustedDataStartedAt', trusted_start,
    'deviceTypeBreakdown', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'label', initcap(lower(grouped.device_type)),
            'value', grouped.page_views
          )
          order by
            grouped.page_views desc,
            grouped.device_type
        )
        from grouped
      ),
      '[]'::jsonb
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_platform_analytics_details(
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.get_platform_analytics_details(
  timestamptz,
  timestamptz
) to authenticated;

comment on function public.get_platform_analytics_details(
  timestamptz,
  timestamptz
) is
  'SUPER_ADMIN-only device-type detail derived from trusted page views. Does not infer uncaptured platform, duration, or timezone values.';

create function public.get_platform_page_view_history(
  target_start timestamptz,
  target_end_exclusive timestamptz,
  target_search text default null,
  target_limit integer default 25,
  target_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  trusted_start timestamptz;
  effective_start timestamptz;
  effective_search text;
  result jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_start is not null
     and target_end_exclusive is not null
     and target_end_exclusive <= target_start then
    raise exception 'analytics range end must be after start'
      using errcode = '22023';
  end if;

  effective_search := nullif(trim(target_search), '');

  if effective_search is not null
     and (
       char_length(effective_search) > 100
       or effective_search ~ '[[:cntrl:]]'
     ) then
    raise exception 'invalid analytics history search'
      using errcode = '22023';
  end if;

  if target_limit is null
     or target_limit not in (10, 25, 50, 100)
     or target_offset is null
     or target_offset < 0
     or target_offset > 100000 then
    raise exception 'invalid pagination parameters'
      using errcode = '22023';
  end if;

  select baseline.trusted_data_started_at
  into trusted_start
  from public.platform_analytics_trusted_baseline baseline
  where baseline.singleton = true;

  if trusted_start is null then
    raise exception 'platform analytics trusted baseline is unavailable'
      using errcode = '55000';
  end if;

  effective_start := greatest(
    coalesce(target_start, trusted_start),
    trusted_start
  );

  if target_end_exclusive is not null
     and target_end_exclusive <= effective_start then
    return jsonb_build_object(
      'total', 0,
      'limit', target_limit,
      'offset', target_offset,
      'rows', '[]'::jsonb
    );
  end if;

  with matching as materialized (
    select
      id,
      created_at,
      normalized_path,
      device_type,
      browser,
      operating_system,
      nullif(trim(city), '') as city,
      nullif(trim(region_code), '') as region,
      nullif(trim(country_code), '') as country
    from public.analytics_page_views
    where created_at >= effective_start
      and (
        target_end_exclusive is null
        or created_at < target_end_exclusive
      )
      and (
        effective_search is null
        or position(lower(effective_search) in lower(normalized_path)) > 0
        or position(lower(effective_search) in lower(coalesce(device_type, ''))) > 0
        or position(lower(effective_search) in lower(coalesce(browser, ''))) > 0
        or position(lower(effective_search) in lower(coalesce(operating_system, ''))) > 0
        or position(lower(effective_search) in lower(coalesce(city, ''))) > 0
        or position(lower(effective_search) in lower(coalesce(region_code, ''))) > 0
        or position(lower(effective_search) in lower(coalesce(country_code, ''))) > 0
      )
  ),
  totals as (
    select count(*)::integer as total
    from matching
  ),
  paginated as (
    select *
    from matching
    order by created_at desc, id desc
    limit target_limit
    offset target_offset
  )
  select jsonb_build_object(
    'total', totals.total,
    'limit', target_limit,
    'offset', target_offset,
    'rows', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'timestamp', paginated.created_at,
            'path', paginated.normalized_path,
            'deviceType', paginated.device_type,
            'browser', paginated.browser,
            'operatingSystem', paginated.operating_system,
            'city', paginated.city,
            'region', paginated.region,
            'country', paginated.country
          )
          order by paginated.created_at desc, paginated.id desc
        )
        from paginated
      ),
      '[]'::jsonb
    )
  )
  into result
  from totals;

  return result;
end;
$$;

revoke all on function public.get_platform_page_view_history(
  timestamptz,
  timestamptz,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.get_platform_page_view_history(
  timestamptz,
  timestamptz,
  text,
  integer,
  integer
) to authenticated;

comment on function public.get_platform_page_view_history(
  timestamptz,
  timestamptz,
  text,
  integer,
  integer
) is
  'SUPER_ADMIN-only bounded page-view activity history from the trusted analytics period. Returns no user, organization, session, IP, or precise identity data.';

notify pgrst, 'reload schema';

commit;
