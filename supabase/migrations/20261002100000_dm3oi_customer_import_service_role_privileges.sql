-- Customer import staging is mutated only by trusted server-side service-role
-- actions after application authorization.
--
-- Organization users retain their existing column-limited SELECT access.
-- No direct authenticated INSERT, UPDATE, or DELETE privileges are added.
--
-- Submission audit rows are intentionally retained, so service_role does not
-- receive DELETE on this table.

grant select, insert, update
on table public.customer_import_submissions
to service_role;
