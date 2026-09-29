begin;

-- ============================================================
-- ORGANIZATION-CONFIGURED EXTERNAL DOCUMENT ROUTING
--
-- DM3Oi tracks that a document is required but never receives,
-- stores, previews, or transmits the customer's private document.
-- ============================================================

alter table public.organization_settings
  add column if not exists secure_document_system_url text,
  add column if not exists document_submission_instructions text;

alter table public.organization_settings
  drop constraint if exists organization_settings_secure_document_system_url_check;

alter table public.organization_settings
  add constraint organization_settings_secure_document_system_url_check
  check (
    secure_document_system_url is null
    or (
      secure_document_system_url = trim(secure_document_system_url)
      and length(secure_document_system_url) between 9 and 2048
      and secure_document_system_url ~* '^https://'
    )
  );

alter table public.organization_settings
  drop constraint if exists organization_settings_document_submission_instructions_check;

alter table public.organization_settings
  add constraint organization_settings_document_submission_instructions_check
  check (
    document_submission_instructions is null
    or (
      document_submission_instructions = trim(document_submission_instructions)
      and length(document_submission_instructions) between 1 and 4000
    )
  );

comment on column public.organization_settings.secure_document_system_url is
  'External HTTPS document-delivery system used by the organization. DM3Oi does not receive or store customer documents.';

comment on column public.organization_settings.document_submission_instructions is
  'Customer-facing instructions for providing private documents outside DM3Oi.';


-- ============================================================
-- SUCCESSFUL MISSING-DOCUMENT NOTICE -> TASK IN PROGRESS
-- ============================================================

create or replace function public.mark_intake_requirement_notice_sent(
  target_task_id uuid
)
returns public.case_tasks
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  existing public.case_tasks;
  changed public.case_tasks;
begin
  if actor is null then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select *
  into existing
  from public.case_tasks
  where id=target_task_id
  for update;

  if not found then
    raise exception 'task not found' using errcode='P0002';
  end if;

  if existing.intake_follow_up_id is null
     or existing.intake_question_definition_id is null
     or jsonb_typeof(
          coalesce(
            existing.intake_requirement_context->'missing_option_labels',
            '[]'::jsonb
          )
        ) <> 'array'
     or jsonb_array_length(
          coalesce(
            existing.intake_requirement_context->'missing_option_labels',
            '[]'::jsonb
          )
        ) = 0
  then
    raise exception 'task is not a Guided Intake document requirement'
      using errcode='23514';
  end if;

  if not public.has_effective_organization_permission(
       existing.organization_id,
       'WORK_TASKS'
     )
     or not public.can_access_case(
       existing.case_id,
       existing.organization_id,
       actor
     )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if not public.can_manage_case(existing.organization_id,actor)
     and existing.assigned_user_id is distinct from actor
     and not public.has_effective_organization_permission(
       existing.organization_id,
       'MANAGE_TASKS'
     )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  -- Idempotent when the notice was already recorded successfully.
  if existing.status='IN_PROGRESS' then
    return existing;
  end if;

  if existing.status<>'NOT_STARTED' then
    raise exception 'task is not awaiting a customer notice'
      using errcode='23514';
  end if;

  update public.case_tasks
  set status='IN_PROGRESS'
  where id=existing.id
  returning * into changed;

  insert into public.case_activity(
    organization_id,
    case_id,
    actor_user_id,
    event_type,
    event_data
  )
  values(
    changed.organization_id,
    changed.case_id,
    actor,
    'TASK_STARTED',
    jsonb_build_object(
      'task_id',changed.id,
      'before_status',existing.status,
      'after_status',changed.status,
      'source','GUIDED_INTAKE',
      'customer_notice_sent',true
    )
  );

  return changed;
end
$$;

revoke all on function public.mark_intake_requirement_notice_sent(uuid)
  from public,anon,authenticated;

grant execute on function public.mark_intake_requirement_notice_sent(uuid)
  to authenticated;

comment on function public.mark_intake_requirement_notice_sent(uuid) is
  'Marks an authorized Guided Intake document-requirement Task IN_PROGRESS only after its customer notice has been successfully sent.';


-- ============================================================
-- CUSTOMER-SAFE OUTSTANDING DOCUMENT REQUIREMENTS
--
-- Uses the same portal relationship authorization boundary as
-- get_customer_portal_cases(). No internal Task details are exposed.
-- ============================================================

create or replace function public.get_customer_portal_case_requirements(
  target_portal_access_id uuid
)
returns table(
  case_number text,
  missing_documents jsonb
)
language sql
stable
security definer
set search_path=''
as $$
  with authorized_portal_access as (
    select access.organization_id, access.customer_id
    from public.customer_portal_users access
    join public.profiles profile
      on profile.id=access.user_id
      and profile.is_active
    join public.organizations organization
      on organization.id=access.organization_id
      and organization.status='ACTIVE'
    join public.customers customer
      on customer.id=access.customer_id
      and customer.organization_id=access.organization_id
      and customer.status='ACTIVE'
    left join public.organization_settings settings
      on settings.organization_id=access.organization_id
    where access.id=target_portal_access_id
      and access.user_id=auth.uid()
      and access.is_active
      and coalesce(settings.portal_enabled,true)
  )
  select
    item.case_number,
    task.intake_requirement_context->'missing_option_labels'
      as missing_documents
  from authorized_portal_access access
  join public.cases item
    on item.organization_id=access.organization_id
    and item.customer_id=access.customer_id
  join public.case_tasks task
    on task.organization_id=item.organization_id
    and task.case_id=item.id
  where item.status not in ('COMPLETED','CLOSED','CANCELLED')
    and task.status = 'IN_PROGRESS'
    and task.intake_follow_up_id is not null
    and task.intake_question_definition_id is not null
    and jsonb_typeof(
      task.intake_requirement_context->'missing_option_labels'
    )='array'
    and jsonb_array_length(
      task.intake_requirement_context->'missing_option_labels'
    )>0
  order by item.opened_at desc,item.case_number desc,task.sequence
$$;

alter function public.get_customer_portal_case_requirements(uuid)
  owner to postgres;

revoke all on function public.get_customer_portal_case_requirements(uuid)
  from public,anon,authenticated;

grant execute on function public.get_customer_portal_case_requirements(uuid)
  to authenticated;

comment on function public.get_customer_portal_case_requirements(uuid) is
  'Customer-safe outstanding document requirements for the authenticated Customer Portal relationship. Exposes requirement labels only; documents remain outside DM3Oi.';

commit;
