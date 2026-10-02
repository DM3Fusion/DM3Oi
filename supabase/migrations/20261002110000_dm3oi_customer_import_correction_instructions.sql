-- Organization-visible correction guidance for staged Customer data submissions.
--
-- SUPER_ADMIN internal notes remain private.
-- correction_instructions is specifically intended for the submitting
-- BUSINESS_OWNER / BUSINESS_ADMIN when a source file needs correction.

alter table public.customer_import_submissions
add column correction_instructions text
check (
  correction_instructions is null
  or length(correction_instructions) <= 4000
);

comment on column public.customer_import_submissions.correction_instructions is
  'Organization-visible instructions explaining what must be corrected before Customer data can be imported. Separate from the private SUPER_ADMIN note.';

-- Organization Owners/Admins already have row-scoped SELECT access.
-- Add only this organization-facing column to their existing column grant.
grant select (correction_instructions)
on public.customer_import_submissions
to authenticated;
