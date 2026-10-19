begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.get_platform_geographic_location_group_history(
  target_start timestamptz,
  target_end_exclusive timestamptz,
  target_city text,
  target_region text,
  target_country text,
  target_limit integer default 50,
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
  normalized_city text;
  normalized_region text;
  normalized_country text;
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

  if target_city is null
     or target_region is null
     or target_country is null
     or trim(target_city) = ''
     or trim(target_region) = ''
     or trim(target_country) = ''
     or char_length(trim(target_city)) > 120
     or char_length(trim(target_region)) > 100
     or char_length(trim(target_country)) > 8
     or target_city ~ '[[:cntrl:]]'
     or target_region ~ '[[:cntrl:]]'
     or target_country ~ '[[:cntrl:]]' then
    raise exception 'invalid geographic location label'
      using errcode = '22023';
  end if;

  if target_limit is null
     or target_limit < 1
     or target_limit > 100
     or target_offset is null
     or target_offset < 0
     or target_offset > 100000 then
    raise exception 'invalid pagination parameters'
      using errcode = '22023';
  end if;

  normalized_city := lower(
    regexp_replace(trim(target_city), '[[:space:]]+', ' ', 'g')
  );
  normalized_region := lower(
    regexp_replace(trim(target_region), '[[:space:]]+', ' ', 'g')
  );
  normalized_country := lower(
    regexp_replace(trim(target_country), '[[:space:]]+', ' ', 'g')
  );

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

  with filtered as materialized (
    select
      id,
      created_at,
      normalized_path,
      device_type,
      nullif(
        regexp_replace(trim(city), '[[:space:]]+', ' ', 'g'),
        ''
      ) as city,
      nullif(
        regexp_replace(trim(region_code), '[[:space:]]+', ' ', 'g'),
        ''
      ) as region,
      nullif(
        regexp_replace(trim(country_code), '[[:space:]]+', ' ', 'g'),
        ''
      ) as country,
      network_latitude as latitude,
      network_longitude as longitude
    from public.analytics_page_views
    where created_at >= effective_start
      and (
        target_end_exclusive is null
        or created_at < target_end_exclusive
      )
  ),
  valid_coordinates as materialized (
    select *
    from filtered
    where latitude is not null
      and longitude is not null
      and not (
        latitude = 0
        and longitude = 0
      )
  ),
  label_counts as (
    select
      latitude,
      longitude,
      'city'::text as label_type,
      city as label,
      count(*)::integer as occurrences
    from valid_coordinates
    where city is not null
    group by latitude, longitude, city

    union all

    select
      latitude,
      longitude,
      'region'::text,
      region,
      count(*)::integer
    from valid_coordinates
    where region is not null
    group by latitude, longitude, region

    union all

    select
      latitude,
      longitude,
      'country'::text,
      country,
      count(*)::integer
    from valid_coordinates
    where country is not null
    group by latitude, longitude, country
  ),
  ranked_labels as (
    select
      label_counts.*,
      row_number() over (
        partition by latitude, longitude, label_type
        order by occurrences desc, label
      ) as label_rank
    from label_counts
  ),
  preferred_labels as (
    select
      coordinates.latitude,
      coordinates.longitude,
      max(ranked_labels.label) filter (
        where ranked_labels.label_type = 'city'
          and ranked_labels.label_rank = 1
      ) as city,
      max(ranked_labels.label) filter (
        where ranked_labels.label_type = 'region'
          and ranked_labels.label_rank = 1
      ) as region,
      max(ranked_labels.label) filter (
        where ranked_labels.label_type = 'country'
          and ranked_labels.label_rank = 1
      ) as country
    from (
      select distinct latitude, longitude
      from valid_coordinates
    ) coordinates
    left join ranked_labels
      on ranked_labels.latitude = coordinates.latitude
     and ranked_labels.longitude = coordinates.longitude
    group by coordinates.latitude, coordinates.longitude
  ),
  target_coordinates as materialized (
    select latitude, longitude
    from preferred_labels
    where lower(coalesce(city, 'Unknown')) = normalized_city
      and lower(coalesce(region, 'Unknown')) = normalized_region
      and lower(coalesce(country, 'Unknown')) = normalized_country
  ),
  matching as materialized (
    select
      valid_coordinates.id,
      valid_coordinates.created_at,
      valid_coordinates.normalized_path,
      valid_coordinates.device_type,
      valid_coordinates.city,
      valid_coordinates.region,
      valid_coordinates.country
    from valid_coordinates
    inner join target_coordinates
      on target_coordinates.latitude = valid_coordinates.latitude
     and target_coordinates.longitude = valid_coordinates.longitude
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

revoke all on function public.get_platform_geographic_location_group_history(
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.get_platform_geographic_location_group_history(
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  integer,
  integer
) to authenticated;

comment on function public.get_platform_geographic_location_group_history(
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  integer,
  integer
) is
  'SUPER_ADMIN-only paginated history across every approximate network coordinate represented by one captured city, region, and country group. No identities returned.';

commit;
