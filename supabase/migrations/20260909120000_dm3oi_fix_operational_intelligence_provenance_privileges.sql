-- Allow the trusted Operational Intelligence repository to read only the
-- Rule provenance needed to group already-authorized Case Tasks.
revoke select on table public.case_tasks from service_role;
revoke select (id, organization_id, case_id, source_rule_id, source_rule_action_id)
  on table public.case_tasks from service_role;

grant select (id, organization_id, case_id, source_rule_id, source_rule_action_id)
  on table public.case_tasks to service_role;
