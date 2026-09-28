-- Allow the security-invoker organization_case_tasks projection to read
-- every underlying case_tasks column that it explicitly projects or uses.
--
-- This remains intentionally column-scoped. Direct row visibility continues
-- to be governed by case_tasks RLS and the organization_case_tasks predicate.

grant select(
  blocking,
  completed_by_user_id,
  created_by_user_id,
  intake_follow_up_id,
  intake_question_definition_id,
  intake_requirement_context,
  priority,
  source_rule_action_id
)
on public.case_tasks
to authenticated;
