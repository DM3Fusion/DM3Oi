from pathlib import Path
import csv

SOURCE = Path(
    "scripts/generated/mts-business-reach-census-validated.csv"
)
OUTPUT = Path(
    "scripts/generated/repair-mts-business-reach-final-preview.sql"
)

needed = {
    "46205": 4, "46208": 4, "46214": 7, "46216": 7, "46217": 7,
    "46218": 14, "46219": 7, "46220": 7, "46221": 7, "46222": 6,
    "46224": 7, "46225": 3, "46226": 7, "46227": 7, "46228": 7,
    "46229": 7, "46231": 5, "46234": 5, "46235": 5, "46236": 5,
    "46237": 5, "46239": 5, "46240": 6, "46241": 6, "46250": 5,
    "46254": 5, "46256": 5, "46259": 5, "46260": 6, "46268": 6,
    "46278": 5, "46280": 5, "46290": 5, "47711": 1,
}

def q(value):
    return "'" + str(value).replace("'", "''") + "'"

with SOURCE.open(newline="") as f:
    rows = list(csv.DictReader(f))

if len(rows) != 1374:
    raise SystemExit(
        f"FAIL CLOSED: expected 1374 validated rows, found {len(rows)}"
    )

values = []
for row in rows:
    if row["postal_code"] not in needed:
        continue

    values.append(
        "(" + ", ".join([
            q(row["object_id"]),
            q(row["street_address"]),
            q(row["city"]),
            q(row["state"]),
            q(row["postal_code"]),
            q(row["property_class"]),
            str(float(row["latitude"])),
            str(float(row["longitude"])),
        ]) + ")"
    )

needed_values = ",\n".join(
    f"({q(zip_code)}, {count})"
    for zip_code, count in sorted(needed.items())
)

candidate_values = ",\n".join(values)

sql = f"""-- ============================================================
-- MTS Business Reach repair -- FINAL PREVIEW ONLY
--
-- Source addresses:
--   Indiana statewide address points
--   Commercial property classifications
--   U.S. Census batch geocoder EXACT matches only
--
-- This script is fail-closed and ends with ROLLBACK.
-- ============================================================

begin;

create temporary table _mts_org on commit drop as
select id
from public.organizations
where name = 'Mimms'' Tax Service'
  and status = 'ACTIVE';

do $$
declare
  n integer;
begin
  select count(*) into n from _mts_org;
  if n <> 1 then
    raise exception
      'FAIL CLOSED: expected exactly one ACTIVE MTS organization, found %',
      n;
  end if;
end
$$;

create temporary table _needed (
  postal_code text primary key,
  needed integer not null
) on commit drop;

insert into _needed (postal_code, needed) values
{needed_values};

do $$
declare
  n integer;
begin
  select sum(needed) into n from _needed;
  if n <> 198 then
    raise exception
      'FAIL CLOSED: replacement requirement must total 198, found %',
      n;
  end if;
end
$$;

-- ------------------------------------------------------------
-- Current MTS ACTIVE population
-- ------------------------------------------------------------

create temporary table _population_before on commit drop as
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
  g.latitude,
  g.longitude
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
  select count(*) into active_count
  from _population_before;

  select count(*) into mapped_count
  from _population_before
  where geocode_status = 'MAPPED';

  select count(*) into unmapped_count
  from _population_before
  where geocode_status is distinct from 'MAPPED';

  if active_count <> 370
     or mapped_count <> 172
     or unmapped_count <> 198 then
    raise exception
      'FAIL CLOSED starting state: active %, mapped %, unmapped %',
      active_count,
      mapped_count,
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
-- Exact current repair targets
-- ------------------------------------------------------------

create temporary table _targets on commit drop as
select
  p.customer_id,
  p.customer_number,
  p.name,
  p.street_address as old_street_address,
  p.city as old_city,
  p.state as old_state,
  btrim(p.postal_code) as old_postal_code,
  row_number() over (
    partition by btrim(p.postal_code)
    order by p.customer_number, p.customer_id
  ) as target_rank
from _population_before p
where p.geocode_status is distinct from 'MAPPED';

do $$
declare
  n integer;
  bad_zips text;
begin
  select count(*) into n from _targets;

  if n <> 198 then
    raise exception
      'FAIL CLOSED: expected 198 targets, found %',
      n;
  end if;

  select string_agg(x.postal_code, ', ' order by x.postal_code)
    into bad_zips
  from (
    select
      n.postal_code,
      n.needed,
      count(t.customer_id)::integer as actual
    from _needed n
    left join _targets t
      on t.old_postal_code = n.postal_code
    group by n.postal_code, n.needed
    having count(t.customer_id) <> n.needed
  ) x;

  if bad_zips is not null then
    raise exception
      'FAIL CLOSED: target ZIP counts changed for: %',
      bad_zips;
  end if;
end
$$;

-- ------------------------------------------------------------
-- Locally Census-validated commercial candidates
-- ------------------------------------------------------------

create temporary table _candidate_source (
  object_id text not null,
  street_address text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  property_class text not null,
  latitude double precision not null,
  longitude double precision not null
) on commit drop;

insert into _candidate_source (
  object_id,
  street_address,
  city,
  state,
  postal_code,
  property_class,
  latitude,
  longitude
) values
{candidate_values};

do $$
declare
  n integer;
begin
  select count(*) into n from _candidate_source;

  if n <> 1374 then
    raise exception
      'FAIL CLOSED: expected 1374 Census EXACT candidates, found %',
      n;
  end if;
end
$$;

-- ------------------------------------------------------------
-- Normalize candidates and exclude addresses already used by MTS.
-- Also keep only one candidate per exact coordinate.
-- ------------------------------------------------------------

create temporary table _eligible_candidates on commit drop as
with normalized as (
  select
    s.*,
    public.customer_address_fingerprint(
      s.street_address,
      s.city,
      s.state,
      s.postal_code
    ) as address_fingerprint
  from _candidate_source s
),
unused as (
  select n.*
  from normalized n
  where not exists (
    select 1
    from _population_before p
    where p.address_fingerprint = n.address_fingerprint
  )
),
deduped as (
  select
    u.*,
    row_number() over (
      partition by
        u.postal_code,
        round(u.latitude::numeric, 6),
        round(u.longitude::numeric, 6)
      order by u.object_id
    ) as geo_rank
  from unused u
)
select *
from deduped
where geo_rank = 1;

-- Every ZIP still needs sufficient unused, distinct Census locations.
do $$
declare
  bad_zips text;
begin
  select string_agg(x.postal_code, ', ' order by x.postal_code)
    into bad_zips
  from (
    select
      n.postal_code,
      n.needed,
      count(e.object_id)::integer as available
    from _needed n
    left join _eligible_candidates e
      on e.postal_code = n.postal_code
    group by n.postal_code, n.needed
    having count(e.object_id) < n.needed
  ) x;

  if bad_zips is not null then
    raise exception
      'FAIL CLOSED: insufficient unused validated addresses for ZIP(s): %',
      bad_zips;
  end if;
end
$$;

-- ------------------------------------------------------------
-- Deterministically select exactly the required number per ZIP.
-- ------------------------------------------------------------

create temporary table _selected_candidates on commit drop as
with ranked as (
  select
    e.*,
    row_number() over (
      partition by e.postal_code
      order by e.object_id
    ) as candidate_rank
  from _eligible_candidates e
)
select r.*
from ranked r
join _needed n
  on n.postal_code = r.postal_code
where r.candidate_rank <= n.needed;

do $$
declare
  n integer;
  distinct_addresses integer;
  distinct_geos integer;
begin
  select count(*) into n
  from _selected_candidates;

  select count(distinct address_fingerprint)
    into distinct_addresses
  from _selected_candidates;

  select count(distinct
    postal_code || ':' ||
    round(latitude::numeric, 6)::text || ':' ||
    round(longitude::numeric, 6)::text
  )
    into distinct_geos
  from _selected_candidates;

  if n <> 198
     or distinct_addresses <> 198
     or distinct_geos <> 198 then
    raise exception
      'FAIL CLOSED candidate selection: rows %, addresses %, locations %',
      n,
      distinct_addresses,
      distinct_geos;
  end if;
end
$$;

-- Pair each target to one same-ZIP Census-confirmed address.
create temporary table _assignments on commit drop as
select
  t.customer_id,
  t.customer_number,
  t.name,
  t.old_street_address,
  t.old_city,
  t.old_state,
  t.old_postal_code,

  s.object_id,
  s.street_address as new_street_address,
  s.city as new_city,
  s.state as new_state,
  s.postal_code as new_postal_code,
  s.address_fingerprint as new_address_fingerprint,
  s.latitude,
  s.longitude
from _targets t
join _selected_candidates s
  on s.postal_code = t.old_postal_code
 and s.candidate_rank = t.target_rank;

do $$
declare
  n integer;
  zip_changes integer;
begin
  select count(*) into n from _assignments;

  select count(*) into zip_changes
  from _assignments
  where old_postal_code <> new_postal_code;

  if n <> 198 or zip_changes <> 0 then
    raise exception
      'FAIL CLOSED assignments: rows %, ZIP changes %',
      n,
      zip_changes;
  end if;
end
$$;

-- ------------------------------------------------------------
-- PREVIEW the actual Customer address update.
-- Address trigger invalidates old geocode cache automatically.
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
  from _assignments a
  where c.id = a.customer_id
    and c.organization_id = (select id from _mts_org)
    and c.status = 'ACTIVE';

  get diagnostics changed_count = row_count;

  if changed_count <> 198 then
    raise exception
      'FAIL CLOSED: expected 198 address updates, updated %',
      changed_count;
  end if;
end
$$;

-- Ensure stale target cache is absent.
delete from public.customer_geocodes g
using _assignments a
where g.organization_id = (select id from _mts_org)
  and g.customer_id = a.customer_id;

-- Install only the exact Census coordinates already validated locally.
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
from _assignments a;

-- ------------------------------------------------------------
-- Final fail-closed validation
-- ------------------------------------------------------------

do $$
declare
  active_count integer;
  mapped_count integer;
  unmapped_count integer;
  fingerprint_errors integer;
  bad_coordinates integer;
  repaired_unique_locations integer;
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
    into fingerprint_errors
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
    into bad_coordinates
  from public.customer_geocodes g
  where g.organization_id = (select id from _mts_org)
    and (
      g.geocode_status <> 'MAPPED'
      or g.latitude is null
      or g.longitude is null
      or g.latitude not between -90 and 90
      or g.longitude not between -180 and 180
    );

  select count(distinct
    round(g.latitude::numeric, 6)::text || ':' ||
    round(g.longitude::numeric, 6)::text
  )
    into repaired_unique_locations
  from public.customer_geocodes g
  join _assignments a
    on a.customer_id = g.customer_id
  where g.organization_id = (select id from _mts_org);

  if active_count <> 370
     or mapped_count <> 370
     or unmapped_count <> 0
     or fingerprint_errors <> 0
     or bad_coordinates <> 0
     or repaired_unique_locations <> 198 then
    raise exception
      'FAIL CLOSED final validation: active %, mapped %, unmapped %, fingerprints %, bad coordinates %, repaired locations %',
      active_count,
      mapped_count,
      unmapped_count,
      fingerprint_errors,
      bad_coordinates,
      repaired_unique_locations;
  end if;

  raise notice
    'PREVIEW SUCCESS: % ACTIVE / % MAPPED / % UNMAPPED / % DISTINCT REPAIRED LOCATIONS',
    active_count,
    mapped_count,
    unmapped_count,
    repaired_unique_locations;
end
$$;

-- ------------------------------------------------------------
-- Final preview table
-- ------------------------------------------------------------

select
  old_postal_code as zip,
  count(*) as repaired_customers,
  count(distinct new_address_fingerprint) as unique_addresses,
  count(distinct
    round(latitude::numeric, 6)::text || ':' ||
    round(longitude::numeric, 6)::text
  ) as unique_locations
from _assignments
group by old_postal_code
order by old_postal_code;

-- PREVIEW ONLY. DO NOT CHANGE UNTIL REVIEWED.
rollback;
"""

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(sql)

print(f"Validated candidates embedded: {len(values)}")
print(f"Required replacements: {sum(needed.values())}")
print(f"Created: {OUTPUT}")
