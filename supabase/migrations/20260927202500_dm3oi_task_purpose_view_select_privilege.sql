-- Allow the security-invoker organization_case_tasks projection to expose
-- the Task Purpose relationship to authenticated organization users.
--
-- Direct row visibility remains governed by case_tasks RLS and the
-- organization_case_tasks authorization predicate.

grant select(task_purpose_id)
on public.case_tasks
to authenticated;
