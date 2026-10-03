begin;

-- Current-state, tenant-owned location cache for the Reports Business Reach map.
-- Coordinates are ZIP centroids rather than customer/street locations, and no
-- customer identity or address is exposed by the reporting RPC.
create table public.customer_geocodes (
  customer_id uuid primary key,
  organization_id uuid not null,
  address_fingerprint text not null check (length(address_fingerprint) = 32),
  geocode_status text not null check (geocode_status in ('MAPPED', 'UNMAPPABLE')),
  location_key text,
  latitude double precision,
  longitude double precision,
  geocode_source text not null check (geocode_source = 'ZIPCODES_US_ZIP_CENTROID'),
  geocoded_at timestamptz not null default now(),
  foreign key (organization_id, customer_id)
    references public.customers(organization_id, id)
    on delete cascade,
  check (
    (geocode_status = 'MAPPED'
      and location_key is not null
      and latitude between -90 and 90
      and longitude between -180 and 180)
    or
    (geocode_status = 'UNMAPPABLE'
      and location_key is null
      and latitude is null
      and longitude is null)
  )
);

create index customer_geocodes_organization_status_idx
  on public.customer_geocodes(organization_id, geocode_status, location_key);

alter table public.customer_geocodes enable row level security;

-- Deliberately grant no direct table access. Tenant-safe SECURITY DEFINER RPCs
-- are the only interface, and each one enforces the effective permissions of
-- the signed-in actor before touching customer address or location data.
revoke all on table public.customer_geocodes from public, anon, authenticated;

create function public.customer_address_fingerprint(
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
    lower(trim(coalesce(target_street_address, ''))),
    lower(trim(coalesce(target_city, ''))),
    lower(trim(coalesce(target_state, ''))),
    lower(trim(coalesce(target_postal_code, '')))
  ));
$$;

revoke all on function public.customer_address_fingerprint(text, text, text, text)
  from public, anon, authenticated;

create function public.invalidate_customer_geocode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.street_address is distinct from old.street_address
     or new.city is distinct from old.city
     or new.state is distinct from old.state
     or new.postal_code is distinct from old.postal_code then
    delete from public.customer_geocodes
    where customer_id = old.id
      and organization_id = old.organization_id;
  end if;

  return new;
end;
$$;

create trigger customers_invalidate_geocode_on_address_change
after update of street_address, city, state, postal_code
on public.customers
for each row
execute function public.invalidate_customer_geocode();

revoke all on function public.invalidate_customer_geocode()
  from public, anon, authenticated;

create function public.get_business_reach(target_organization_id uuid)
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
      g.location_key,
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
    'geographicCoverage', (
      select count(distinct location_key)
      from population
      where geocode_status = 'MAPPED'
    ),
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

revoke all on function public.get_business_reach(uuid) from public, anon;
grant execute on function public.get_business_reach(uuid) to authenticated;

create function public.get_business_reach_geocode_candidates(
  target_organization_id uuid,
  target_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(target_limit, 500), 1), 500);
  result jsonb;
begin
  if actor is null
     or not public.has_effective_organization_permission(target_organization_id, 'VIEW_REPORTS')
     or not public.has_effective_organization_permission(target_organization_id, 'VIEW_CUSTOMERS')
     or not public.has_effective_organization_permission(target_organization_id, 'EDIT_CUSTOMER') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'customerId', candidate.id,
        'streetAddress', candidate.street_address,
        'city', candidate.city,
        'state', candidate.state,
        'postalCode', candidate.postal_code,
        'addressFingerprint', public.customer_address_fingerprint(
          candidate.street_address,
          candidate.city,
          candidate.state,
          candidate.postal_code
        )
      )
      order by candidate.id
    ),
    '[]'::jsonb
  ) into result
  from (
    select c.id, c.street_address, c.city, c.state, c.postal_code
    from public.customers c
    left join public.customer_geocodes g
      on g.organization_id = c.organization_id
     and g.customer_id = c.id
    where c.organization_id = target_organization_id
      and c.status = 'ACTIVE'
      and g.customer_id is null
    order by c.id
    limit safe_limit
  ) candidate;

  return result;
end;
$$;

revoke all on function public.get_business_reach_geocode_candidates(uuid, integer)
  from public, anon;
grant execute on function public.get_business_reach_geocode_candidates(uuid, integer)
  to authenticated;

create function public.save_business_reach_geocodes(
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

    -- An address may change between candidate read and save. Skip that row;
    -- the next explicit batch can safely map its new value.
    if current_fingerprint is null
       or submitted_fingerprint is distinct from current_fingerprint then
      continue;
    end if;

    if target_status = 'MAPPED' then
      if target_location_key is null
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
      'ZIPCODES_US_ZIP_CENTROID',
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

revoke all on function public.save_business_reach_geocodes(uuid, jsonb)
  from public, anon;
grant execute on function public.save_business_reach_geocodes(uuid, jsonb)
  to authenticated;

comment on table public.customer_geocodes is
  'Tenant-owned current Customer location cache for Business Reach. ZIP centroids only; address changes invalidate rows.';
comment on function public.get_business_reach(uuid) is
  'Returns one tenant current ACTIVE Customer footprint with aggregate points and no customer identity/address fields.';
comment on function public.get_business_reach_geocode_candidates(uuid, integer) is
  'Returns one bounded address batch to an authorized server operation; never called during ordinary Reports rendering.';
comment on function public.save_business_reach_geocodes(uuid, jsonb) is
  'Persists one bounded ZIP-centroid mapping batch after rechecking tenant permission and address fingerprint.';

commit;
