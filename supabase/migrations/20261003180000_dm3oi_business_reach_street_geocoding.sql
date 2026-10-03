begin;

-- The prior cache contains ZIP centroids, which are not valid street-address
-- results. Clear only this derived cache so authorized users can explicitly
-- remap current ACTIVE Customers with the address-level provider.
delete from public.customer_geocodes;

alter table public.customer_geocodes
  drop constraint customer_geocodes_geocode_source_check;
alter table public.customer_geocodes
  add constraint customer_geocodes_geocode_source_check
  check (geocode_source = 'US_CENSUS_BATCH');

comment on column public.customer_geocodes.location_key is
  'Opaque normalized-address fingerprint used to associate deduplicated provider results; never returned to the map client.';

create or replace function public.customer_address_fingerprint(
  target_street_address text,
  target_city text,
  target_state text,
  target_postal_code text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws(
    chr(31),
    lower(btrim(regexp_replace(coalesce(target_street_address, ''), '[[:space:]]+', ' ', 'g'))),
    lower(btrim(regexp_replace(coalesce(target_city, ''), '[[:space:]]+', ' ', 'g'))),
    lower(btrim(regexp_replace(coalesce(target_state, ''), '[[:space:]]+', ' ', 'g'))),
    lower(btrim(regexp_replace(coalesce(target_postal_code, ''), '[[:space:]]+', ' ', 'g')))
  ));
$$;

create or replace function public.get_business_reach(target_organization_id uuid)
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
  if actor is null
     or not public.has_effective_organization_permission(target_organization_id, 'VIEW_REPORTS')
     or not public.has_effective_organization_permission(target_organization_id, 'VIEW_CUSTOMERS') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with population as materialized (
    select
      c.id,
      g.geocode_status,
      g.latitude,
      g.longitude
    from public.customers c
    left join public.customer_geocodes g
      on g.organization_id = c.organization_id
     and g.customer_id = c.id
    where c.organization_id = target_organization_id
      and c.status = 'ACTIVE'
  ), points as (
    select
      latitude,
      longitude,
      count(*)::integer as weight
    from population
    where geocode_status = 'MAPPED'
      and latitude is not null
      and longitude is not null
    group by latitude, longitude
  )
  select jsonb_build_object(
    'activeCustomers', (select count(*) from population),
    'mappedCustomers', (
      select count(*) from population where geocode_status = 'MAPPED'
    ),
    'unmappedCustomers', (
      select count(*) from population where geocode_status is distinct from 'MAPPED'
    ),
    'pendingCustomers', (
      select count(*) from population where geocode_status is null
    ),
    'unmappableCustomers', (
      select count(*) from population where geocode_status = 'UNMAPPABLE'
    ),
    'uniqueLocations', (select count(*) from points),
    'points', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'latitude', latitude,
            'longitude', longitude,
            'weight', weight
          )
          order by weight desc, latitude, longitude
        ),
        '[]'::jsonb
      )
      from points
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.save_business_reach_geocodes(
  target_organization_id uuid,
  target_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  item jsonb;
  target_customer_id uuid;
  submitted_fingerprint text;
  current_fingerprint text;
  target_status text;
  target_location_key text;
  target_latitude double precision;
  target_longitude double precision;
  saved_count integer := 0;
begin
  if actor is null
     or not public.has_effective_organization_permission(target_organization_id, 'VIEW_REPORTS')
     or not public.has_effective_organization_permission(target_organization_id, 'VIEW_CUSTOMERS')
     or not public.has_effective_organization_permission(target_organization_id, 'EDIT_CUSTOMER') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if target_rows is null
     or jsonb_typeof(target_rows) is distinct from 'array'
     or jsonb_array_length(target_rows) > 500 then
    raise exception 'invalid geocode batch' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(target_rows)
  loop
    target_customer_id := nullif(item ->> 'customerId', '')::uuid;
    submitted_fingerprint := item ->> 'addressFingerprint';
    target_status := item ->> 'status';
    target_location_key := nullif(item ->> 'locationKey', '');
    target_latitude := nullif(item ->> 'latitude', '')::double precision;
    target_longitude := nullif(item ->> 'longitude', '')::double precision;

    current_fingerprint := null;
    select public.customer_address_fingerprint(
      c.street_address,
      c.city,
      c.state,
      c.postal_code
    ) into current_fingerprint
    from public.customers c
    where c.id = target_customer_id
      and c.organization_id = target_organization_id
      and c.status = 'ACTIVE';

    if current_fingerprint is null
       or submitted_fingerprint is distinct from current_fingerprint then
      continue;
    end if;

    if target_status = 'MAPPED' then
      if target_location_key is distinct from current_fingerprint
         or target_latitude is null or target_latitude not between -90 and 90
         or target_longitude is null or target_longitude not between -180 and 180 then
        raise exception 'invalid mapped geocode' using errcode = '22023';
      end if;
    elsif target_status = 'UNMAPPABLE' then
      target_location_key := null;
      target_latitude := null;
      target_longitude := null;
    else
      raise exception 'invalid geocode status' using errcode = '22023';
    end if;

    insert into public.customer_geocodes (
      customer_id,
      organization_id,
      address_fingerprint,
      geocode_status,
      location_key,
      latitude,
      longitude,
      geocode_source,
      geocoded_at
    ) values (
      target_customer_id,
      target_organization_id,
      submitted_fingerprint,
      target_status,
      target_location_key,
      target_latitude,
      target_longitude,
      'US_CENSUS_BATCH',
      now()
    )
    on conflict (customer_id) do update set
      organization_id = excluded.organization_id,
      address_fingerprint = excluded.address_fingerprint,
      geocode_status = excluded.geocode_status,
      location_key = excluded.location_key,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      geocode_source = excluded.geocode_source,
      geocoded_at = excluded.geocoded_at;

    saved_count := saved_count + 1;
  end loop;

  return saved_count;
end;
$$;

comment on table public.customer_geocodes is
  'Tenant-owned current Customer street-address geocode cache for Business Reach. Address changes invalidate rows.';
comment on function public.get_business_reach(uuid) is
  'Returns one tenant current ACTIVE Customer footprint with address-level coordinates aggregated by identical coordinate and no customer identity/address fields.';
comment on function public.save_business_reach_geocodes(uuid, jsonb) is
  'Persists one bounded U.S. Census address-geocoding batch after rechecking tenant permission, ACTIVE Customer scope, and address fingerprint.';

commit;
