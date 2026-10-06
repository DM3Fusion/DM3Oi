-- DM3Oi SUPER_ADMIN Customer Import maintenance tools.
--
-- Adds durable origin attribution for Customer import submissions, allows
-- SUPER_ADMIN to create an administrative canonical-CSV import while retaining
-- the existing atomic import transaction, hides administrative imports from
-- organization-facing submission history, and provides a guarded cleanup RPC
-- for obsolete import audit records whose created Customers no longer exist.

alter table public.customer_import_submissions
  add column submission_origin text not null
  default 'ORGANIZATION_SUBMISSION'
  check (
    submission_origin in (
      'ORGANIZATION_SUBMISSION',
      'ADMINISTRATIVE'
    )
  );

comment on column public.customer_import_submissions.submission_origin is
  'Durable provenance: ORGANIZATION_SUBMISSION for Owner/Admin staged files or ADMINISTRATIVE for SUPER_ADMIN-created canonical CSV imports.';


-- ---------------------------------------------------------------------------
-- Keep source identity immutable, now including submission_origin.
-- ---------------------------------------------------------------------------

create or replace function public.protect_customer_import_submission_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.uploaded_by_user_id is distinct from old.uploaded_by_user_id
    or new.original_filename is distinct from old.original_filename
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.file_size_bytes is distinct from old.file_size_bytes
    or new.mime_type is distinct from old.mime_type
    or new.created_at is distinct from old.created_at
    or new.submission_origin is distinct from old.submission_origin
  then
    raise exception 'customer import submission source identity is immutable'
      using errcode = '23514';
  end if;

  return new;
end
$$;

alter function public.protect_customer_import_submission_identity()
  owner to postgres;

revoke all
on function public.protect_customer_import_submission_identity()
from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- Organization users must never see SUPER_ADMIN administrative imports.
-- SUPER_ADMIN retains complete visibility.
-- ---------------------------------------------------------------------------

drop policy if exists customer_import_submissions_organization_select
on public.customer_import_submissions;

create policy customer_import_submissions_organization_select
on public.customer_import_submissions
for select
to authenticated
using (
  public.is_super_admin(auth.uid())
  or (
    submission_origin = 'ORGANIZATION_SUBMISSION'
    and public.has_organization_role(
      organization_id,
      array[
        'BUSINESS_OWNER',
        'BUSINESS_ADMIN'
      ]::public.application_role[]
    )
  )
);


-- ---------------------------------------------------------------------------
-- Create one ADMINISTRATIVE READY_TO_IMPORT submission.
--
-- The canonical CSV itself is uploaded to private Storage by trusted server
-- code before this function is called. The existing atomic import RPC then
-- owns Customer creation + IMPORTED completion exactly as before.
-- ---------------------------------------------------------------------------

create or replace function public.super_admin_create_administrative_import(
  target_organization_id uuid,
  target_original_filename text,
  target_storage_path text,
  target_file_size_bytes bigint
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  created_id uuid;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations
    where id = target_organization_id
      and status = 'ACTIVE'
  ) then
    raise exception 'target organization is not active'
      using errcode = '23514';
  end if;

  if length(trim(coalesce(target_original_filename, '')))
       not between 1 and 255 then
    raise exception 'invalid filename'
      using errcode = '22023';
  end if;

  if length(trim(coalesce(target_storage_path, '')))
       not between 1 and 700 then
    raise exception 'invalid storage path'
      using errcode = '22023';
  end if;

  if target_file_size_bytes is null
    or target_file_size_bytes <= 0
    or target_file_size_bytes > 1048576
  then
    raise exception 'administrative import CSV exceeds the 1 MB import limit'
      using errcode = '22023';
  end if;

  insert into public.customer_import_submissions (
    organization_id,
    uploaded_by_user_id,
    original_filename,
    storage_bucket,
    storage_path,
    file_size_bytes,
    mime_type,
    status,
    file_disposition,
    submission_origin,
    super_admin_note,
    reviewed_at,
    reviewed_by_user_id
  )
  values (
    target_organization_id,
    actor,
    trim(target_original_filename),
    'customer-import-files',
    trim(target_storage_path),
    target_file_size_bytes,
    'text/csv',
    'READY_TO_IMPORT',
    'RETAINED',
    'ADMINISTRATIVE',
    'Administrative / Seed Import',
    now(),
    actor
  )
  returning id into created_id;

  return created_id;
end
$$;

alter function public.super_admin_create_administrative_import(
  uuid,
  text,
  text,
  bigint
) owner to postgres;

revoke all
on function public.super_admin_create_administrative_import(
  uuid,
  text,
  text,
  bigint
)
from public, anon;

grant execute
on function public.super_admin_create_administrative_import(
  uuid,
  text,
  text,
  bigint
)
to authenticated;

comment on function public.super_admin_create_administrative_import(
  uuid,
  text,
  text,
  bigint
) is
  'SUPER_ADMIN-only creation of an ADMINISTRATIVE READY_TO_IMPORT submission backed by a canonical CSV already stored in the private Customer import bucket.';


-- ---------------------------------------------------------------------------
-- Remove an obsolete completed import record.
--
-- This intentionally does NOT delete Customers.
-- It refuses removal while any Customer recorded as CREATED by this import
-- still exists.
-- ---------------------------------------------------------------------------

create or replace function public.super_admin_remove_customer_import_record(
  target_submission_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  submission public.customer_import_submissions;
  created_customer_id uuid;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  select *
  into submission
  from public.customer_import_submissions
  where id = target_submission_id
  for update;

  if submission.id is null then
    raise exception 'customer import submission not found'
      using errcode = 'P0002';
  end if;

  if submission.status <> 'IMPORTED' then
    raise exception 'only completed imports can be removed'
      using errcode = '23514';
  end if;

  if submission.source_file_deleted_at is null then
    raise exception 'delete the source file before removing the import record'
      using errcode = '23514';
  end if;

  if submission.import_result is null
    or jsonb_typeof(submission.import_result) <> 'object'
    or jsonb_typeof(submission.import_result -> 'outcomes') <> 'array'
  then
    raise exception 'import result is unavailable or malformed'
      using errcode = '23514';
  end if;

  for created_customer_id in
    select (outcome ->> 'customer_id')::uuid
    from jsonb_array_elements(
      submission.import_result -> 'outcomes'
    ) outcome
    where outcome ->> 'classification' = 'CREATED'
  loop
    if exists (
      select 1
      from public.customers
      where id = created_customer_id
        and organization_id = submission.organization_id
    ) then
      raise exception
        'rollback imported Customers before removing this import record'
        using errcode = '23514';
    end if;
  end loop;

  delete from public.customer_import_submissions
  where id = target_submission_id;
end
$$;

alter function public.super_admin_remove_customer_import_record(uuid)
  owner to postgres;

revoke all
on function public.super_admin_remove_customer_import_record(uuid)
from public, anon;

grant execute
on function public.super_admin_remove_customer_import_record(uuid)
to authenticated;

comment on function public.super_admin_remove_customer_import_record(uuid) is
  'SUPER_ADMIN-only removal of a completed source-deleted Customer import audit record after every Customer originally CREATED by that import is already absent.';
