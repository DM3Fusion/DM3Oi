begin;

create or replace function public.enforce_guided_intake_task_purpose()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  missing_documents_purpose_id uuid;
  requirement_kind text;
begin
  if new.intake_follow_up_id is null then
    return new;
  end if;

  requirement_kind :=
    coalesce(new.intake_requirement_context->>'kind','');

  if requirement_kind='QUESTION_FOLLOW_UP' then
    -- Generic Intake follow-up Tasks derive their visible purpose from the
    -- originating Question section rather than an organization-configured
    -- Task Purpose.
    new.task_purpose_id:=null;
    return new;
  end if;

  -- Explicit Document Requirement Tasks retain the organization-controlled
  -- Missing Documents purpose. Preserve this behavior for legacy Intake
  -- requirement Tasks whose older context did not yet store a kind.
  select purpose.id
  into missing_documents_purpose_id
  from public.organization_task_purposes purpose
  where purpose.organization_id=new.organization_id
    and purpose.is_active
    and lower(trim(purpose.label))='missing documents'
  limit 1;

  if missing_documents_purpose_id is null then
    raise exception
      'Missing Documents Task Purpose is required for Guided Intake document requirement Tasks'
      using errcode='23514';
  end if;

  new.task_purpose_id:=missing_documents_purpose_id;

  return new;
end
$$;

drop trigger if exists enforce_guided_intake_task_purpose
  on public.case_tasks;

create trigger enforce_guided_intake_task_purpose
before insert or update of
  intake_follow_up_id,
  intake_question_definition_id,
  intake_requirement_context,
  task_purpose_id
on public.case_tasks
for each row
execute function public.enforce_guided_intake_task_purpose();

comment on function public.enforce_guided_intake_task_purpose() is
  'Document Requirement Tasks are system-owned Missing Documents work. Generic QUESTION_FOLLOW_UP Tasks have no organization Task Purpose ID and derive their visible purpose from the originating Guided Intake Question section.';

-- Correct generic Tasks created while the legacy trigger forced every Guided
-- Intake Task to Missing Documents.
update public.case_tasks
set task_purpose_id=null
where intake_follow_up_id is not null
  and intake_requirement_context->>'kind'='QUESTION_FOLLOW_UP'
  and task_purpose_id is not null;

create or replace view public.organization_case_tasks
with (security_invoker=true)
as
select
  t.id,
  t.organization_id,
  t.case_id,
  t.title,
  t.description,
  t.assigned_user_id,
  t.status,
  t.required,
  t.due_at,
  t.completed_at,
  public.organization_actor_id(t.completed_by_user_id) as completed_by_user_id,
  public.organization_actor_label(t.completed_by_user_id) as completed_by_display_name,
  t.sequence,
  public.organization_actor_id(t.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(t.created_by_user_id) as created_by_display_name,
  t.created_at,
  t.updated_at,
  t.priority,
  t.blocking,
  t.source_rule_action_id is not null as generated_by_rule,
  t.intake_follow_up_id is not null as generated_by_intake,
  t.intake_question_definition_id,
  t.intake_requirement_context,
  t.task_purpose_id,
  case
    when t.intake_requirement_context->>'kind'='QUESTION_FOLLOW_UP'
    then
      case question.question_group
        when 'CUSTOMER_PROFILE' then 'Customer Profile'
        when 'VERIFICATION_ELIGIBILITY' then 'Verification & Eligibility'
        when 'REQUIRED_DOCUMENTS' then 'Required Documents'
        when 'MISSING_INFORMATION_FOLLOW_UP' then 'Missing Information / Follow-up'
        when 'READY_FOR_HANDOFF' then 'Ready for Handoff'
        else 'Intake Follow-up'
      end
    else purpose.label
  end as task_purpose_label
from public.case_tasks t
left join public.organization_task_purposes purpose
  on purpose.organization_id=t.organization_id
 and purpose.id=t.task_purpose_id
left join public.question_definitions question
  on question.organization_id=t.organization_id
 and question.id=t.intake_question_definition_id
where public.can_access_case(
  t.case_id,
  t.organization_id,
  auth.uid()
);

commit;
