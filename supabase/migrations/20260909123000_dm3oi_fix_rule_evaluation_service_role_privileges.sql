-- Give the trusted server-only Rule evaluator only the columns used by its
-- organization- and Case-scoped reads. Browser roles retain their existing
-- grants and organization-safe projection contracts.
revoke select on table
  public.case_questions,
  public.case_question_responses,
  public.rule_definitions,
  public.rule_actions,
  public.question_options
from service_role;

revoke select (
  id, organization_id, case_id, question_definition_id, question_text,
  description, response_type, required, display_order, options_snapshot,
  created_at
) on table public.case_questions from service_role;

revoke select (
  id, organization_id, case_id, case_question_id, response_value,
  responded_by_user_id, created_at, updated_at
) on table public.case_question_responses from service_role;

revoke select (
  id, organization_id, name, description, source_question_id,
  condition_operator, condition_option_id, active, display_order,
  created_by_user_id, updated_by_user_id, created_at, updated_at
) on table public.rule_definitions from service_role;

revoke select (
  id, organization_id, rule_definition_id, action_type, target_question_id,
  task_title, task_description, task_priority, task_required, task_blocking,
  display_order, retired_at, created_by_user_id, updated_by_user_id,
  created_at, updated_at
) on table public.rule_actions from service_role;

revoke select (
  id, organization_id, question_id, option_label, option_value,
  display_order, created_at
) on table public.question_options from service_role;

grant select (
  id, organization_id, case_id, question_definition_id, question_text,
  description, response_type, required, display_order, options_snapshot
) on table public.case_questions to service_role;

grant select (
  organization_id, case_id, case_question_id, response_value
) on table public.case_question_responses to service_role;

grant select (
  id, organization_id, name, source_question_id, condition_operator,
  condition_option_id, active, display_order
) on table public.rule_definitions to service_role;

grant select (
  id, organization_id, rule_definition_id, action_type, target_question_id,
  task_title, task_description, task_priority, task_required, task_blocking,
  display_order, retired_at
) on table public.rule_actions to service_role;

grant select (
  id, organization_id, question_id, option_value
) on table public.question_options to service_role;
