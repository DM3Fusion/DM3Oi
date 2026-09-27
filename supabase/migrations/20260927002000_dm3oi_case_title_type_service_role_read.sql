-- Guided Case Intake loads Case Title / Case Type compatibility through the
-- server-side service-role client. The compatibility foundation granted the
-- table to authenticated users but omitted the minimum service-role read grant.

grant select
  on table public.organization_case_title_type_mappings
  to service_role;
