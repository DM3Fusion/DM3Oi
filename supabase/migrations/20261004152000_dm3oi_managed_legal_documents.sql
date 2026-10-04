-- Managed DM3Oi legal documents.
-- SUPER_ADMIN drafts legal content and publishes immutable versions.
-- Public/server rendering reads only the explicitly published version.
-- Application code remains the safe fallback until the first publication.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.is_valid_legal_document_text(
  target_value text,
  target_max_length integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select target_value is not null
    and char_length(btrim(target_value)) between 1 and target_max_length
    and target_value !~ '<[^>]*>'
$$;

create or replace function public.validate_legal_document_content(
  target_document_key text,
  target_content jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  paragraph jsonb;
begin
  if target_document_key not in ('TERMS_OF_SERVICE', 'PRIVACY_POLICY')
     or target_content is null
     or jsonb_typeof(target_content) <> 'object'
     or target_content ->> 'type' <> target_document_key
     or not public.is_valid_legal_document_text(target_content ->> 'title', 160)
     or jsonb_typeof(target_content -> 'introduction') <> 'array'
     or jsonb_array_length(target_content -> 'introduction') not between 1 and 12
     or jsonb_typeof(target_content -> 'sections') <> 'array'
     or jsonb_array_length(target_content -> 'sections') not between 1 and 30
     or exists (
       select 1
       from jsonb_object_keys(target_content) key
       where key not in ('type', 'title', 'introduction', 'sections')
     )
  then
    return false;
  end if;

  for paragraph in
    select value
    from jsonb_array_elements(target_content -> 'introduction')
  loop
    if jsonb_typeof(paragraph) <> 'string'
       or not public.is_valid_legal_document_text(paragraph #>> '{}', 4000)
    then
      return false;
    end if;
  end loop;

  for item in
    select value
    from jsonb_array_elements(target_content -> 'sections')
  loop
    if jsonb_typeof(item) <> 'object'
       or not public.is_valid_legal_document_text(item ->> 'heading', 200)
       or jsonb_typeof(item -> 'paragraphs') <> 'array'
       or jsonb_array_length(item -> 'paragraphs') not between 1 and 20
       or exists (
         select 1
         from jsonb_object_keys(item) key
         where key not in ('heading', 'paragraphs')
       )
    then
      return false;
    end if;

    for paragraph in
      select value
      from jsonb_array_elements(item -> 'paragraphs')
    loop
      if jsonb_typeof(paragraph) <> 'string'
         or not public.is_valid_legal_document_text(paragraph #>> '{}', 4000)
      then
        return false;
      end if;
    end loop;
  end loop;

  return true;
exception
  when others then
    return false;
end
$$;

create table public.legal_document_drafts (
  document_key text primary key
    check (document_key in ('TERMS_OF_SERVICE', 'PRIVACY_POLICY')),
  content jsonb not null
    check (public.validate_legal_document_content(document_key, content)),
  draft_revision integer not null default 1
    check (draft_revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid null
    references public.profiles(id) on delete set null
);

create table public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_key text not null
    check (document_key in ('TERMS_OF_SERVICE', 'PRIVACY_POLICY')),
  version text not null
    check (
      version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'
    ),
  effective_date date not null,
  content jsonb not null
    check (public.validate_legal_document_content(document_key, content)),
  published_at timestamptz not null default now(),
  -- Deliberately not an FK: immutable publisher attribution must survive
  -- profile lifecycle changes without mutating a historical version row.
  published_by uuid null,
  unique (document_key, version),
  unique (document_key, id)
);

create table public.legal_document_publications (
  document_key text primary key
    check (document_key in ('TERMS_OF_SERVICE', 'PRIVACY_POLICY')),
  version_id uuid not null,
  published_at timestamptz not null default now(),
  published_by uuid null
    references public.profiles(id) on delete set null,
  constraint legal_document_publications_version_fkey
    foreign key (document_key, version_id)
    references public.legal_document_versions(document_key, id)
    on delete restrict
);

create index legal_document_versions_history_idx
  on public.legal_document_versions(document_key, published_at desc);

alter table public.legal_document_drafts enable row level security;
alter table public.legal_document_versions enable row level security;
alter table public.legal_document_publications enable row level security;

alter table public.legal_document_drafts force row level security;
alter table public.legal_document_versions force row level security;
alter table public.legal_document_publications force row level security;

revoke all on public.legal_document_drafts
  from public, anon, authenticated, service_role;

revoke all on public.legal_document_versions
  from public, anon, authenticated, service_role;

revoke all on public.legal_document_publications
  from public, anon, authenticated, service_role;

create or replace function public.prevent_legal_document_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'published legal document versions are immutable'
    using errcode = '55000';
end
$$;

create trigger legal_document_versions_immutable
before update or delete on public.legal_document_versions
for each row execute function public.prevent_legal_document_version_mutation();


-- ------------------------------------------------------------
-- SUPER_ADMIN management read
-- ------------------------------------------------------------

create or replace function public.get_legal_document_for_admin(
  target_document_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  draft_row public.legal_document_drafts;
  published_row public.legal_document_versions;
begin
  if target_document_key not in (
    'TERMS_OF_SERVICE',
    'PRIVACY_POLICY'
  ) then
    raise exception 'invalid legal document'
      using errcode = '22023';
  end if;

  if not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  select *
  into draft_row
  from public.legal_document_drafts
  where document_key = target_document_key;

  select version.*
  into published_row
  from public.legal_document_publications publication
  join public.legal_document_versions version
    on version.document_key = publication.document_key
   and version.id = publication.version_id
  where publication.document_key = target_document_key;

  return jsonb_build_object(
    'document_key', target_document_key,

    'draft_content',
      case when draft_row.document_key is null
        then null
        else draft_row.content
      end,
    'draft_revision',
      case when draft_row.document_key is null
        then null
        else draft_row.draft_revision
      end,
    'draft_updated_at',
      case when draft_row.document_key is null
        then null
        else draft_row.updated_at
      end,
    'draft_updated_by',
      case when draft_row.document_key is null
        then null
        else draft_row.updated_by
      end,

    'published_content',
      case when published_row.id is null
        then null
        else published_row.content
      end,
    'published_version',
      case when published_row.id is null
        then null
        else published_row.version
      end,
    'published_effective_date',
      case when published_row.id is null
        then null
        else published_row.effective_date
      end,
    'published_at',
      case when published_row.id is null
        then null
        else published_row.published_at
      end,
    'published_by',
      case when published_row.id is null
        then null
        else published_row.published_by
      end
  );
end
$$;


-- ------------------------------------------------------------
-- Save mutable SUPER_ADMIN draft
-- ------------------------------------------------------------

create or replace function public.save_legal_document_draft(
  target_document_key text,
  target_content jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved public.legal_document_drafts;
begin
  if target_document_key not in (
    'TERMS_OF_SERVICE',
    'PRIVACY_POLICY'
  ) then
    raise exception 'invalid legal document'
      using errcode = '22023';
  end if;

  if not public.validate_legal_document_content(
    target_document_key,
    target_content
  ) then
    raise exception 'invalid legal document content'
      using errcode = '22023';
  end if;

  if not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  insert into public.legal_document_drafts (
    document_key,
    content,
    draft_revision,
    updated_at,
    updated_by
  )
  values (
    target_document_key,
    target_content,
    1,
    now(),
    actor
  )
  on conflict (document_key)
  do update set
    content = excluded.content,
    draft_revision =
      public.legal_document_drafts.draft_revision + 1,
    updated_at = now(),
    updated_by = actor
  returning *
  into saved;

  return jsonb_build_object(
    'document_key', saved.document_key,
    'draft_revision', saved.draft_revision,
    'updated_at', saved.updated_at
  );
end
$$;


-- ------------------------------------------------------------
-- Publish immutable snapshot
-- ------------------------------------------------------------

create or replace function public.publish_legal_document(
  target_document_key text,
  target_version text,
  target_effective_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  normalized_version text := trim(target_version);
  draft_row public.legal_document_drafts;
  version_row public.legal_document_versions;
begin
  if target_document_key not in (
    'TERMS_OF_SERVICE',
    'PRIVACY_POLICY'
  ) then
    raise exception 'invalid legal document'
      using errcode = '22023';
  end if;

  if normalized_version is null
     or normalized_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$' then
    raise exception 'invalid legal document version'
      using errcode = '22023';
  end if;

  if target_effective_date is null then
    raise exception 'effective date is required'
      using errcode = '22023';
  end if;

  if not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  select *
  into draft_row
  from public.legal_document_drafts
  where document_key = target_document_key
  for update;

  if draft_row.document_key is null then
    raise exception 'legal document draft required'
      using errcode = 'P0001';
  end if;

  insert into public.legal_document_versions (
    document_key,
    version,
    effective_date,
    content,
    published_at,
    published_by
  )
  values (
    target_document_key,
    normalized_version,
    target_effective_date,
    draft_row.content,
    now(),
    actor
  )
  returning *
  into version_row;

  insert into public.legal_document_publications (
    document_key,
    version_id,
    published_at,
    published_by
  )
  values (
    target_document_key,
    version_row.id,
    version_row.published_at,
    actor
  )
  on conflict (document_key)
  do update set
    version_id = excluded.version_id,
    published_at = excluded.published_at,
    published_by = excluded.published_by;

  return jsonb_build_object(
    'document_key', version_row.document_key,
    'version', version_row.version,
    'effective_date', version_row.effective_date,
    'published_at', version_row.published_at
  );
end
$$;


-- ------------------------------------------------------------
-- Immutable published version history for SUPER_ADMIN
-- ------------------------------------------------------------

create or replace function public.get_legal_document_history_for_admin(
  target_document_key text
)
returns table (
  id uuid,
  version text,
  effective_date date,
  published_at timestamptz,
  published_by uuid,
  is_current boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if target_document_key not in (
    'TERMS_OF_SERVICE',
    'PRIVACY_POLICY'
  ) then
    raise exception 'invalid legal document'
      using errcode = '22023';
  end if;

  if not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  return query
  select
    version.id,
    version.version,
    version.effective_date,
    version.published_at,
    version.published_by,
    publication.version_id = version.id
  from public.legal_document_versions version
  left join public.legal_document_publications publication
    on publication.document_key = version.document_key
  where version.document_key = target_document_key
  order by version.published_at desc, version.id desc;
end
$$;


-- ------------------------------------------------------------
-- Server-only public-document read.
-- Public browser callers receive no direct database access.
-- ------------------------------------------------------------

create or replace function public.get_published_legal_document_server(
  target_document_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  published_row public.legal_document_versions;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if target_document_key not in (
    'TERMS_OF_SERVICE',
    'PRIVACY_POLICY'
  ) then
    return null;
  end if;

  select version.*
  into published_row
  from public.legal_document_publications publication
  join public.legal_document_versions version
    on version.document_key = publication.document_key
   and version.id = publication.version_id
  where publication.document_key = target_document_key;

  if published_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'document_key', published_row.document_key,
    'content', published_row.content,
    'version', published_row.version,
    'effective_date', published_row.effective_date,
    'published_at', published_row.published_at
  );
end
$$;


revoke all on function
  public.get_legal_document_for_admin(text)
  from public, anon, authenticated, service_role;

revoke all on function
  public.save_legal_document_draft(text, jsonb)
  from public, anon, authenticated, service_role;

revoke all on function
  public.publish_legal_document(text, text, date)
  from public, anon, authenticated, service_role;

revoke all on function
  public.get_legal_document_history_for_admin(text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_legal_document_for_admin(text)
  to authenticated;

grant execute on function
  public.save_legal_document_draft(text, jsonb)
  to authenticated;

grant execute on function
  public.publish_legal_document(text, text, date)
  to authenticated;

grant execute on function
  public.get_legal_document_history_for_admin(text)
  to authenticated;


revoke all on function
  public.get_published_legal_document_server(text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_published_legal_document_server(text)
  to service_role;

alter function public.is_valid_legal_document_text(text, integer)
  owner to postgres;
alter function public.validate_legal_document_content(text, jsonb)
  owner to postgres;
alter function public.prevent_legal_document_version_mutation()
  owner to postgres;
alter function public.get_legal_document_for_admin(text)
  owner to postgres;
alter function public.save_legal_document_draft(text, jsonb)
  owner to postgres;
alter function public.publish_legal_document(text, text, date)
  owner to postgres;
alter function public.get_legal_document_history_for_admin(text)
  owner to postgres;
alter function public.get_published_legal_document_server(text)
  owner to postgres;

revoke all on function
  public.is_valid_legal_document_text(text, integer)
  from public, anon, authenticated, service_role;
revoke all on function
  public.validate_legal_document_content(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function
  public.prevent_legal_document_version_mutation()
  from public, anon, authenticated, service_role;


comment on table public.legal_document_drafts is
  'SUPER_ADMIN-managed mutable drafts for DM3Oi Terms of Service and Privacy Policy.';

comment on table public.legal_document_versions is
  'Immutable published snapshots of DM3Oi legal documents.';

comment on table public.legal_document_publications is
  'Pointer to the currently published immutable version of each DM3Oi legal document.';

comment on function public.publish_legal_document(text, text, date) is
  'SUPER_ADMIN-only publication boundary. Creates an immutable version snapshot and makes it current.';

notify pgrst, 'reload schema';

commit;
