begin;

create type public.trial_request_status as enum (
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'DECLINED',
  'CONVERTED'
);

create type public.trial_request_use_case as enum (
  'SERVICE_DESK',
  'CASE_MANAGEMENT',
  'TASK_WORK_MANAGEMENT',
  'COMMUNICATIONS',
  'WORKFLOW_AUTOMATION',
  'OPERATIONAL_REPORTING',
  'OTHER_OPERATIONAL_WORKFLOW'
);

create table public.trial_requests (
  id uuid primary key default gen_random_uuid(),

  request_number bigint generated always as identity
    unique,

  status public.trial_request_status not null
    default 'NEW',

  business_name text not null
    check (
      char_length(trim(business_name))
      between 2 and 120
    ),

  contact_name text not null
    check (
      char_length(trim(contact_name))
      between 2 and 100
    ),

  business_email text not null
    check (
      char_length(trim(business_email))
      between 3 and 254
    ),

  phone text
    check (
      phone is null
      or char_length(trim(phone))
        between 7 and 30
    ),

  primary_use_case public.trial_request_use_case
    not null,

  other_use_case text
    check (
      other_use_case is null
      or char_length(trim(other_use_case))
        between 2 and 300
    ),

  estimated_users integer not null
    check (
      estimated_users between 1 and 10000
    ),

  workflow_notes text
    check (
      workflow_notes is null
      or char_length(trim(workflow_notes))
        between 1 and 2000
    ),

  privacy_acknowledged_at timestamptz not null,

  contacted_at timestamptz,
  qualified_at timestamptz,
  declined_at timestamptz,
  converted_at timestamptz,

  converted_organization_id uuid
    references public.organizations(id)
    on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    (
      primary_use_case =
        'OTHER_OPERATIONAL_WORKFLOW'
      and other_use_case is not null
      and char_length(trim(other_use_case)) >= 2
    )
    or
    (
      primary_use_case <>
        'OTHER_OPERATIONAL_WORKFLOW'
      and other_use_case is null
    )
  ),

  check (
    status <> 'CONVERTED'
    or (
      converted_at is not null
      and converted_organization_id is not null
    )
  )
);

create index trial_requests_status_created_idx
  on public.trial_requests(
    status,
    created_at desc
  );

create index trial_requests_email_idx
  on public.trial_requests(
    lower(business_email)
  );

create unique index trial_requests_converted_organization_idx
  on public.trial_requests(
    converted_organization_id
  )
  where converted_organization_id is not null;

create or replace function public.set_trial_request_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trial_requests_set_updated_at
before update on public.trial_requests
for each row
execute function public.set_trial_request_updated_at();

create or replace function public.submit_trial_request(
  p_business_name text,
  p_contact_name text,
  p_business_email text,
  p_phone text,
  p_primary_use_case public.trial_request_use_case,
  p_other_use_case text,
  p_estimated_users integer,
  p_workflow_notes text,
  p_privacy_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_other_use_case text;
begin
  if p_privacy_acknowledged is distinct from true then
    raise exception 'privacy acknowledgement required';
  end if;

  if char_length(trim(coalesce(p_business_name, '')))
       not between 2 and 120 then
    raise exception 'invalid business name';
  end if;

  if char_length(trim(coalesce(p_contact_name, '')))
       not between 2 and 100 then
    raise exception 'invalid contact name';
  end if;

  if char_length(trim(coalesce(p_business_email, '')))
       not between 3 and 254
     or position('@' in trim(p_business_email)) <= 1 then
    raise exception 'invalid business email';
  end if;

  if p_phone is not null
     and char_length(trim(p_phone)) > 0
     and char_length(trim(p_phone)) not between 7 and 30 then
    raise exception 'invalid phone';
  end if;

  if p_estimated_users is null
     or p_estimated_users not between 1 and 10000 then
    raise exception 'invalid estimated users';
  end if;

  if p_workflow_notes is not null
     and char_length(trim(p_workflow_notes)) > 2000 then
    raise exception 'workflow notes too long';
  end if;

  if p_primary_use_case = 'OTHER_OPERATIONAL_WORKFLOW' then
    v_other_use_case :=
      nullif(trim(coalesce(p_other_use_case, '')), '');

    if v_other_use_case is null
       or char_length(v_other_use_case) > 300 then
      raise exception 'other use case required';
    end if;
  else
    v_other_use_case := null;
  end if;

  if exists (
    select 1
    from public.trial_requests
    where lower(business_email) =
      lower(trim(coalesce(p_business_email, '')))
      and lower(business_name) =
        lower(trim(coalesce(p_business_name, '')))
      and created_at >= now() - interval '15 minutes'
  ) then
    select id
    into v_id
    from public.trial_requests
    where lower(business_email) =
      lower(trim(coalesce(p_business_email, '')))
      and lower(business_name) =
        lower(trim(coalesce(p_business_name, '')))
      and created_at >= now() - interval '15 minutes'
    order by created_at desc
    limit 1;

    return v_id;
  end if;

  insert into public.trial_requests (
    business_name,
    contact_name,
    business_email,
    phone,
    primary_use_case,
    other_use_case,
    estimated_users,
    workflow_notes,
    privacy_acknowledged_at
  )
  values (
    trim(p_business_name),
    trim(p_contact_name),
    lower(trim(p_business_email)),
    nullif(trim(coalesce(p_phone, '')), ''),
    p_primary_use_case,
    v_other_use_case,
    p_estimated_users,
    nullif(trim(coalesce(p_workflow_notes, '')), ''),
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

alter table public.trial_requests
  enable row level security;

create policy trial_requests_super_admin_select
on public.trial_requests
for select
to authenticated
using (public.is_super_admin());

create policy trial_requests_super_admin_update
on public.trial_requests
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

revoke all
on table public.trial_requests
from anon, authenticated;

grant select, update
on table public.trial_requests
to authenticated;

revoke all
on function public.submit_trial_request(
  text,
  text,
  text,
  text,
  public.trial_request_use_case,
  text,
  integer,
  text,
  boolean
)
from public;

grant execute
on function public.submit_trial_request(
  text,
  text,
  text,
  text,
  public.trial_request_use_case,
  text,
  integer,
  text,
  boolean
)
to anon, authenticated;

commit;
