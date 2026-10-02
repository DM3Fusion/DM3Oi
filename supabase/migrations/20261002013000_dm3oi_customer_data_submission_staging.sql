-- DM3Oi Customer Data Submission staging
--
-- BUSINESS_OWNER / BUSINESS_ADMIN may submit raw Excel or CSV source files
-- through the application. Submission does not import Customer records.
--
-- SUPER_ADMIN reviews/downloads/prepares the source file, exports a canonical
-- CSV, and uses the existing SUPER_ADMIN Customer Import workflow.
--
-- Source files are private and may be deleted by SUPER_ADMIN after use while
-- preserving the submission audit row.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'customer-import-files',
  'customer-import-files',
  false,
  10485760,
  array[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.customer_import_submissions (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  uploaded_by_user_id uuid not null,

  original_filename text not null
    check (
      length(trim(original_filename)) between 1 and 255
    ),

  storage_bucket text not null
    default 'customer-import-files'
    check (storage_bucket = 'customer-import-files'),

  storage_path text not null unique
    check (
      length(trim(storage_path)) between 1 and 700
    ),

  file_size_bytes bigint not null
    check (
      file_size_bytes > 0
      and file_size_bytes <= 10485760
    ),

  mime_type text not null
    check (
      mime_type in (
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    ),

  status text not null
    default 'UPLOADED'
    check (
      status in (
        'UPLOADED',
        'UNDER_REVIEW',
        'NEEDS_CORRECTION',
        'READY_TO_IMPORT',
        'IMPORTED',
        'REJECTED'
      )
    ),

  organization_note text
    check (
      organization_note is null
      or length(organization_note) <= 2000
    ),

  super_admin_note text
    check (
      super_admin_note is null
      or length(super_admin_note) <= 4000
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  reviewed_at timestamptz,
  reviewed_by_user_id uuid,

  imported_at timestamptz,
  imported_by_user_id uuid,
  import_result jsonb
    check (
      import_result is null
      or jsonb_typeof(import_result) = 'object'
    ),

  source_file_deleted_at timestamptz,
  source_file_deleted_by_user_id uuid,

  check (
    (reviewed_at is null and reviewed_by_user_id is null)
    or
    (reviewed_at is not null and reviewed_by_user_id is not null)
  ),

  check (
    (imported_at is null and imported_by_user_id is null)
    or
    (imported_at is not null and imported_by_user_id is not null)
  ),

  check (
    (source_file_deleted_at is null and source_file_deleted_by_user_id is null)
    or
    (
      source_file_deleted_at is not null
      and source_file_deleted_by_user_id is not null
    )
  ),

  check (
    status <> 'IMPORTED'
    or imported_at is not null
  )
);

create index customer_import_submissions_organization_created_idx
  on public.customer_import_submissions(
    organization_id,
    created_at desc
  );

create index customer_import_submissions_status_created_idx
  on public.customer_import_submissions(
    status,
    created_at desc
  );

create index customer_import_submissions_active_file_idx
  on public.customer_import_submissions(
    organization_id,
    source_file_deleted_at,
    created_at desc
  );

create or replace function public.touch_customer_import_submission_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

alter function public.touch_customer_import_submission_updated_at()
  owner to postgres;

revoke all
on function public.touch_customer_import_submission_updated_at()
from public, anon, authenticated;

create trigger customer_import_submissions_touch_updated_at
before update on public.customer_import_submissions
for each row
execute function public.touch_customer_import_submission_updated_at();

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

create trigger customer_import_submissions_protect_identity
before update on public.customer_import_submissions
for each row
execute function public.protect_customer_import_submission_identity();

alter table public.customer_import_submissions
  enable row level security;

create policy customer_import_submissions_organization_select
on public.customer_import_submissions
for select
to authenticated
using (
  public.is_super_admin(auth.uid())
  or public.has_organization_role(
    organization_id,
    array[
      'BUSINESS_OWNER',
      'BUSINESS_ADMIN'
    ]::public.application_role[]
  )
);

revoke all
on public.customer_import_submissions
from public, anon, authenticated;

-- Organization Owners/Admins may read only organization-facing submission
-- fields. SUPER_ADMIN review details remain private and are accessed through
-- trusted server-side service-role code.
grant select (
  id,
  organization_id,
  uploaded_by_user_id,
  original_filename,
  file_size_bytes,
  mime_type,
  status,
  organization_note,
  created_at,
  updated_at,
  reviewed_at,
  imported_at,
  source_file_deleted_at
)
on public.customer_import_submissions
to authenticated;

comment on table public.customer_import_submissions is
  'Private Customer source-file staging records. BUSINESS_OWNER and BUSINESS_ADMIN may view their organization submissions; SUPER_ADMIN performs all review, preparation, import, and source-file cleanup mutations through trusted server actions.';

comment on column public.customer_import_submissions.original_filename is
  'Original client filename retained for display/audit only. Never used as the Storage object path.';

comment on column public.customer_import_submissions.organization_note is
  'Optional organization-provided context accompanying a Customer data submission.';

comment on column public.customer_import_submissions.super_admin_note is
  'Internal SUPER_ADMIN review/preparation note.';

comment on column public.customer_import_submissions.source_file_deleted_at is
  'When populated, the private staged source object has been removed from Storage while this audit row remains intact.';

-- No authenticated Storage policies are intentionally created.
--
-- Source uploads/downloads/deletes will occur only through trusted server
-- actions using the service-role client after application-level authorization.
-- Organization users never receive direct access to Storage objects.
