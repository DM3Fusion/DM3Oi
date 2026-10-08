-- One-time MTS demo-data repair.
--
-- Purpose:
-- Replace synthetic/unmappable service addresses with already Census-mapped
-- MTS service addresses from the SAME ZIP code.
--
-- This script is fail-closed and PREVIEW-ONLY by default.
-- It ends with ROLLBACK.
--
-- Expected starting state:
--   370 ACTIVE Customers
--   172 MAPPED
--   198 PENDING/UNMAPPABLE
--
-- Expected repaired state inside this transaction:
--   370 ACTIVE Customers
--   370 MAPPED
--   0 PENDING/UNMAPPABLE
--
-- Customer IDs and all non-address Customer data remain unchanged.

begin;

-- ------------------------------------------------------------
-- 1. Resolve exactly one active MTS organization.
-- ------------------------------------------------------------

create temporary table _mts_org on commit drop as
select id
from public.organizations
where name = 'Mimms'' Tax Service'
  and status = 'ACTIVE';

do $$
declare
  organization_count integer;
begin
  select count(*) into organization_count
  from _mts_org;

  if organization_count <> 1 then
    raise exception
      'FAIL CLOSED: expected exactly 1 ACTIVE Mimms'' Tax Service organization, found %',
      organization_count;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 2. Capture the current ACTIVE population and geocode state.
-- ------------------------------------------------------------

create temporary table _mts_population_before on commit drop as
select
  c.id as customer_id,
  c.customer_number,
  c.name,
  c.street_address,
  c.city,
  c.state,
  c.postal_code,
  public.customer_address_fingerprint(
    c.street_address,
    c.city,
    c.state,
    c.postal_code
  ) as address_fingerprint,
  g.geocode_status,
  g.address_fingerprint as geocode_fingerprint,
  g.location_key,
  g.latitude,
  g.longitude,
  g.geocode_source
from public.customers c
join _mts_org o
  on o.id = c.organization_id
left join public.customer_geocodes g
  on g.organization_id = c.organization_id
 and g.customer_id = c.id
where c.status = 'ACTIVE';

do $$
declare
  active_count integer;
  mapped_count integer;
  unmapped_count integer;
begin
  select count(*)
    into active_count
  from _mts_population_before;

  select count(*)
    into mapped_count
  from _mts_population_before
  where geocode_status = 'MAPPED';

  select count(*)
    into unmapped_count
  from _mts_population_before
  where geocode_status is distinct from 'MAPPED';

  if active_count <> 370 then
    raise exception
      'FAIL CLOSED: expected 370 ACTIVE MTS Customers, found %',
      active_count;
  end if;

  if mapped_count <> 172 then
    raise exception
      'FAIL CLOSED: expected 172 currently MAPPED MTS Customers, found %',
      mapped_count;
  end if;

  if unmapped_count <> 198 then
    raise exception
      'FAIL CLOSED: expected 198 currently unmapped MTS Customers, found %',
      unmapped_count;
  end if;

  raise notice
    'STARTING STATE: % ACTIVE / % MAPPED / % UNMAPPED',
    active_count,
    mapped_count,
    unmapped_count;
end
$$;

-- ------------------------------------------------------------
-- 3. Build trusted donor pool.
--
-- A donor must:
--   - already be MAPPED by US_CENSUS_BATCH
--   - have valid coordinates
--   - have a complete 5-digit ZIP
--   - have a cache fingerprint matching its CURRENT address
--   - have location_key matching the current address fingerprint
-- ------------------------------------------------------------

create temporary table _mts_donors on commit drop as
select
  p.customer_id as donor_customer_id,
  p.customer_number as donor_customer_number,
  p.street_address,
  p.city,
  p.state,
  p.postal_code,
  p.address_fingerprint,
  p.latitude,
  p.longitude,
  p.geocode_source
from _mts_population_before p
where p.geocode_status = 'MAPPED'
  and p.geocode_source = 'US_CENSUS_BATCH'
  and p.latitude between -90 and 90
  and p.longitude between -180 and 180
  and nullif(btrim(p.street_address), '') is not null
  and nullif(btrim(p.city), '') is not null
  and upper(btrim(p.state)) ~ '^[A-Z]{2}$'
  and btrim(p.postal_code) ~ '^[0-9]{5}$'
  and p.geocode_fingerprint = p.address_fingerprint
  and p.location_key = p.address_fingerprint;

do $$
declare
  donor_count integer;
begin
  select count(*) into donor_count
  from _mts_donors;

  if donor_count <> 172 then
    raise exception
      'FAIL CLOSED: expected all 172 mapped Customers to be valid Census donors, found %',
      donor_count;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 4. Identify the exact 198 repair targets.
-- ------------------------------------------------------------

create temporary table _mts_targets on commit drop as
select
  p.customer_id,
  p.customer_number,
  p.name,
  p.street_address as old_street_address,
  p.city as old_city,
  p.state as old_state,
  p.postal_code as old_postal_code
from _mts_population_before p
where p.geocode_status is distinct from 'MAPPED';

do $$
declare
  target_count integer;
  invalid_zip_count integer;
begin
  select count(*) into target_count
  from _mts_targets;

  if target_count <> 198 then
    raise exception
      'FAIL CLOSED: expected exactly 198 repair targets, found %',
      target_count;
  end if;

  select count(*) into invalid_zip_count
  from _mts_targets
  where old_postal_code is null
     or btrim(old_postal_code) !~ '^[0-9]{5}$';

  if invalid_zip_count <> 0 then
    raise exception
      'FAIL CLOSED: % repair targets do not have a valid 5-digit ZIP',
      invalid_zip_count;
  end if;
end
$$;

-- Every target ZIP must already have at least one trusted mapped donor.
do $$
declare
  uncovered_zips text;
begin
  select string_agg(t.postal_code, ', ' order by t.postal_code)
    into uncovered_zips
  from (
    select distinct btrim(old_postal_code) as postal_code
    from _mts_targets
  ) t
  left join (
    select distinct btrim(postal_code) as postal_code
    from _mts_donors
  ) d
    on d.postal_code = t.postal_code
  where d.postal_code is null;

  if uncovered_zips is not null then
    raise exception
      'FAIL CLOSED: no mapped donor exists for target ZIP(s): %',
      uncovered_zips;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 5. Deterministically pair each target with a mapped donor
--    from exactly the same ZIP.
--
-- Targets cycle through donors so we do not collapse every ZIP
-- to one address when multiple mapped addresses are available.
-- ------------------------------------------------------------

create temporary table _mts_assignments on commit drop as
with target_ranked as (
  select
    t.*,
    btrim(t.old_postal_code) as normalized_zip,
    row_number() over (
      partition by btrim(t.old_postal_code)
      order by t.customer_number, t.customer_id
    ) as target_rank
  from _mts_targets t
),
donor_ranked as (
  select
    d.*,
    btrim(d.postal_code) as normalized_zip,
    row_number() over (
      partition by btrim(d.postal_code)
      order by d.donor_customer_number, d.donor_customer_id
    ) as donor_rank,
    count(*) over (
      partition by btrim(d.postal_code)
    ) as donor_count
  from _mts_donors d
)
select
  t.customer_id,
  t.customer_number,
  t.name,
  t.old_street_address,
  t.old_city,
  t.old_state,
  t.old_postal_code,

  d.donor_customer_id,
  d.donor_customer_number,

  d.street_address as new_street_address,
  d.city as new_city,
  upper(btrim(d.state)) as new_state,
  btrim(d.postal_code) as new_postal_code,
  d.address_fingerprint as new_address_fingerprint,
  d.latitude,
  d.longitude,
  d.geocode_source
from target_ranked t
join donor_ranked d
  on d.normalized_zip = t.normalized_zip
 and d.donor_rank =
   (((t.target_rank - 1) % d.donor_count) + 1);

do $$
declare
  assignment_count integer;
  wrong_zip_count integer;
begin
  select count(*) into assignment_count
  from _mts_assignments;

  if assignment_count <> 198 then
    raise exception
      'FAIL CLOSED: expected 198 donor assignments, found %',
      assignment_count;
  end if;

  select count(*) into wrong_zip_count
  from _mts_assignments
  where old_postal_code <> new_postal_code;

  if wrong_zip_count <> 0 then
    raise exception
      'FAIL CLOSED: % assignments would change Customer ZIP',
      wrong_zip_count;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 6. Update ONLY the four service-address fields.
--
-- Existing address-update trigger invalidates stale geocode cache.
-- ------------------------------------------------------------

do $$
declare
  changed_count integer;
begin
  update public.customers c
  set
    street_address = a.new_street_address,
    city = a.new_city,
    state = a.new_state,
    postal_code = a.new_postal_code
  from _mts_assignments a
  where c.id = a.customer_id
    and c.organization_id = (select id from _mts_org)
    and c.status = 'ACTIVE';

  get diagnostics changed_count = row_count;

  if changed_count <> 198 then
    raise exception
      'FAIL CLOSED: expected 198 Customer address updates, updated %',
      changed_count;
  end if;
end
$$;

-- Explicitly ensure every target cache row is gone, including the
-- unlikely case where a target already had the same address as a donor.
delete from public.customer_geocodes g
using _mts_assignments a
where g.organization_id = (select id from _mts_org)
  and g.customer_id = a.customer_id;

-- ------------------------------------------------------------
-- 7. Reuse the EXISTING Census result for the identical address.
--
-- No coordinates are invented. Every copied coordinate came from an
-- already-MAPPED US_CENSUS_BATCH result for the exact same address.
-- ------------------------------------------------------------

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
)
select
  a.customer_id,
  (select id from _mts_org),
  public.customer_address_fingerprint(
    a.new_street_address,
    a.new_city,
    a.new_state,
    a.new_postal_code
  ),
  'MAPPED',
  public.customer_address_fingerprint(
    a.new_street_address,
    a.new_city,
    a.new_state,
    a.new_postal_code
  ),
  a.latitude,
  a.longitude,
  'US_CENSUS_BATCH',
  now()
from _mts_assignments a;

-- ------------------------------------------------------------
-- 8. Fail-closed final verification.
-- ------------------------------------------------------------

do $$
declare
  active_count integer;
  mapped_count integer;
  unmapped_count integer;
  stale_fingerprint_count integer;
  bad_coordinate_count integer;
  zip_change_count integer;
begin
  select count(*)
    into active_count
  from public.customers c
  where c.organization_id = (select id from _mts_org)
    and c.status = 'ACTIVE';

  select count(*)
    into mapped_count
  from public.customers c
  join public.customer_geocodes g
    on g.organization_id = c.organization_id
   and g.customer_id = c.id
  where c.organization_id = (select id from _mts_org)
    and c.status = 'ACTIVE'
    and g.geocode_status = 'MAPPED';

  select count(*)
    into unmapped_count
  from public.customers c
  left join public.customer_geocodes g
    on g.organization_id = c.organization_id
   and g.customer_id = c.id
  where c.organization_id = (select id from _mts_org)
    and c.status = 'ACTIVE'
    and g.geocode_status is distinct from 'MAPPED';

  select count(*)
    into stale_fingerprint_count
  from public.customers c
  join public.customer_geocodes g
    on g.organization_id = c.organization_id
   and g.customer_id = c.id
  where c.organization_id = (select id from _mts_org)
    and c.status = 'ACTIVE'
    and (
      g.address_fingerprint is distinct from
        public.customer_address_fingerprint(
          c.street_address,
          c.city,
          c.state,
          c.postal_code
        )
      or g.location_key is distinct from
        public.customer_address_fingerprint(
          c.street_address,
          c.city,
          c.state,
          c.postal_code
        )
    );

  select count(*)
    into bad_coordinate_count
  from public.customer_geocodes g
  where g.organization_id = (select id from _mts_org)
    and (
      g.latitude is null
      or g.longitude is null
      or g.latitude not between -90 and 90
      or g.longitude not between -180 and 180
    );

  select count(*)
    into zip_change_count
  from _mts_assignments
  where old_postal_code <> new_postal_code;

  if active_count <> 370
     or mapped_count <> 370
     or unmapped_count <> 0
     or stale_fingerprint_count <> 0
     or bad_coordinate_count <> 0
     or zip_change_count <> 0 then
    raise exception
      'FAIL CLOSED final validation: active %, mapped %, unmapped %, stale %, bad coords %, ZIP changes %',
      active_count,
      mapped_count,
      unmapped_count,
      stale_fingerprint_count,
      bad_coordinate_count,
      zip_change_count;
  end if;

  raise notice
    'PREVIEW SUCCESS: % ACTIVE / % MAPPED / % UNMAPPED / % ZIP changes',
    active_count,
    mapped_count,
    unmapped_count,
    zip_change_count;
end
$$;

-- ------------------------------------------------------------
-- 9. Preview output.
-- ------------------------------------------------------------

select
  old_postal_code as zip,
  count(*) as repaired_customers,
  count(distinct donor_customer_id) as mapped_donors_used
from _mts_assignments
group by old_postal_code
order by old_postal_code;

select
  customer_number,
  name,
  old_street_address,
  old_city,
  old_state,
  old_postal_code,
  new_street_address,
  new_city,
  new_state,
  new_postal_code,
  donor_customer_number
from _mts_assignments
order by customer_number
limit 25;

-- PREVIEW ONLY.
rollback;
