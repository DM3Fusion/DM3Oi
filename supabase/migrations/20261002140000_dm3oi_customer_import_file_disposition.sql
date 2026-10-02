begin;

alter table public.customer_import_submissions
  add column file_disposition text not null default 'RETAINED'
  check (
    file_disposition in (
      'RETAINED',
      'DELETED_WITHOUT_PROCESSING',
      'DELETED_AFTER_PROCESSING'
    )
  );

comment on column public.customer_import_submissions.file_disposition is
  'Platform-administrator classification of the Customer source-file lifecycle. RETAINED means the staged source remains available; deleted dispositions describe whether deletion occurred before or after processing.';

grant select(file_disposition)
on public.customer_import_submissions
to authenticated;

commit;
