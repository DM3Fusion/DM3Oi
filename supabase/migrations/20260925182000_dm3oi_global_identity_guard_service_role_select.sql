-- Allow the server-only global identity deletion guard to evaluate every
-- dependency table it checks before permanently removing an Auth identity.
--
-- The guard intentionally fails closed when any dependency lookup cannot be
-- completed. These tables currently lack effective SELECT permission for the
-- service_role used by the server-side cleanup/reconciliation workflow.
--
-- Grant read-only access only. RLS policies are unchanged.

grant select on table
  public.case_activity,
  public.case_assignments,
  public.case_question_responses,
  public.case_tasks,
  public.cases,
  public.notifications,
  public.organization_license_events,
  public.organization_licenses,
  public.organization_lifecycle_statuses,
  public.organization_role_permissions,
  public.platform_user_roles,
  public.question_definitions,
  public.rule_actions,
  public.rule_definitions,
  public.service_request_activity,
  public.service_request_messages,
  public.trial_request_status_history,
  public.trial_requests
to service_role;
