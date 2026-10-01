begin;

create or replace view public.organization_cases
with (security_barrier=true) as
select
  c.id,
  c.organization_id,
  c.case_number,
  c.customer_id,
  c.title,
  c.description,
  c.case_type,
  c.priority,
  c.status,
  c.due_at,
  c.opened_at,
  c.completed_at,
  c.closed_at,
  c.manager_user_id,
  public.organization_actor_id(c.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(c.created_by_user_id) as created_by_display_name,
  c.created_at,
  c.updated_at,
  c.case_title_id,
  c.case_type_id,
  c.tax_year,
  c.tax_outcome
from public.cases c
where public.can_access_case(
  c.id,
  c.organization_id,
  auth.uid()
);

comment on view public.organization_cases is
  'Authorized organization Case projection including final tax preparation outcome.';

commit;
