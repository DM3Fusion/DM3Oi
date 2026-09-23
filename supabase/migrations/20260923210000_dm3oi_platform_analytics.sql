begin;

create table public.analytics_page_views (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null,

  user_id uuid
    references auth.users(id)
    on delete set null,

  organization_id uuid
    references public.organizations(id)
    on delete set null,

  path text not null
    check (
      char_length(path) between 1 and 1000
    ),

  normalized_path text not null
    check (
      char_length(normalized_path) between 1 and 1000
    ),

  referrer_host text
    check (
      referrer_host is null
      or char_length(referrer_host) <= 500
    ),

  device_type text not null
    check (
      device_type in (
        'DESKTOP',
        'TABLET',
        'MOBILE',
        'OTHER'
      )
    ),

  device_model text
    check (
      device_model is null
      or char_length(device_model) between 1 and 150
    ),

  browser text not null
    check (
      char_length(browser) between 1 and 100
    ),

  operating_system text not null
    check (
      char_length(operating_system) between 1 and 100
    ),

  country_code text
    check (
      country_code is null
      or char_length(country_code) <= 8
    ),

  region_code text
    check (
      region_code is null
      or char_length(region_code) <= 100
    ),

  city text
    check (
      city is null
      or char_length(city) <= 200
    ),

  traffic_type text not null
    default 'UNKNOWN'
    check (
      traffic_type in (
        'HUMAN',
        'LIKELY_BOT',
        'UNKNOWN'
      )
    ),

  traffic_signal text not null
    default 'insufficient_evidence'
    check (
      char_length(traffic_signal) between 1 and 100
    ),

  created_at timestamptz not null default now()
);

create index analytics_page_views_created_idx
  on public.analytics_page_views (
    created_at desc
  );

create index analytics_page_views_normalized_path_created_idx
  on public.analytics_page_views (
    normalized_path,
    created_at desc
  );

create index analytics_page_views_session_created_idx
  on public.analytics_page_views (
    session_id,
    created_at desc
  );

create index analytics_page_views_user_created_idx
  on public.analytics_page_views (
    user_id,
    created_at desc
  )
  where user_id is not null;

create index analytics_page_views_org_created_idx
  on public.analytics_page_views (
    organization_id,
    created_at desc
  )
  where organization_id is not null;

create index analytics_page_views_traffic_type_created_idx
  on public.analytics_page_views (
    traffic_type,
    created_at desc
  );

alter table public.analytics_page_views
  enable row level security;

grant select, insert, update, delete
  on public.analytics_page_views
  to service_role;

revoke all
  on public.analytics_page_views
  from anon,
       authenticated;

create table public.analytics_live_sessions (
  session_id uuid primary key,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  organization_id uuid
    references public.organizations(id)
    on delete set null,

  created_at timestamptz not null
    default now(),

  last_seen_at timestamptz not null
    default now(),

  signed_out_at timestamptz
);

create index analytics_live_sessions_user_idx
  on public.analytics_live_sessions (
    user_id,
    last_seen_at desc
  );

create index analytics_live_sessions_active_idx
  on public.analytics_live_sessions (
    last_seen_at desc
  )
  where signed_out_at is null;

create index analytics_live_sessions_organization_idx
  on public.analytics_live_sessions (
    organization_id,
    last_seen_at desc
  )
  where organization_id is not null
    and signed_out_at is null;

alter table public.analytics_live_sessions
  enable row level security;

revoke all
  on public.analytics_live_sessions
  from anon,
       authenticated;

grant select, insert, update, delete
  on public.analytics_live_sessions
  to service_role;

commit;
