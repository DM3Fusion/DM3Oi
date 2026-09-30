begin;

-- ============================================================
-- CUSTOMER DOCUMENT-SUBMISSION CONFIRMATION
--
-- This records only the customer's statement that the requested
-- documents were submitted through the organization's external
-- secure document system.
--
-- DM3Oi never receives, stores, previews, or transmits the
-- underlying documents.
-- ============================================================

create table public.case_document_confirmations (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,
  case_id uuid not null,
  task_id uuid not null,
  customer_id uuid not null,

  portal_access_id uuid,
  reported_by_user_id uuid,

  reported_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  foreign key (organization_id,case_id)
    references public.cases(organization_id,id)
    on delete cascade,

  foreign key (organization_id,customer_id)
    references public.customers(organization_id,id)
    on delete cascade,

  foreign key (task_id)
    references public.case_tasks(id)
    on delete cascade,

  foreign key (portal_access_id)
    references public.customer_portal_users(id)
    on delete set null,

  foreign key (reported_by_user_id)
    references public.profiles(id)
    on delete set null
);

create unique index case_document_confirmations_task_uidx
  on public.case_document_confirmations(task_id);

create index case_document_confirmations_case_idx
  on public.case_document_confirmations(
    organization_id,
    case_id,
    reported_sent_at desc
  );

alter table public.case_document_confirmations enable row level security;

revoke all on table public.case_document_confirmations
  from public,anon,authenticated;

comment on table public.case_document_confirmations is
  'Durable customer confirmation that requested documents were reported submitted through an external secure document system. No document content is stored in DM3Oi.';

comment on column public.case_document_confirmations.reported_sent_at is
  'Time the Customer Portal user reported that the requested documents had been submitted externally. This is not staff verification of receipt.';


-- ============================================================
-- CUSTOMER PORTAL: REPORT DOCUMENTS SENT
--
-- Authorization is derived entirely from the authenticated
-- Customer Portal relationship. The caller supplies no customer,
-- organization, Case, or Staff identity.
-- ============================================================

create or replace function public.report_customer_case_documents_sent(
  target_portal_access_id uuid,
  target_task_id uuid
)
returns table(
  confirmation_id uuid,
  case_number text,
  task_id uuid,
  reported_sent_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  access_row public.customer_portal_users;
  case_row public.cases;
  task_row public.case_tasks;
  customer_name text;
  confirmation public.case_document_confirmations;
  recipient record;
  document_labels text;
begin
  if actor is null then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select access.*
  into access_row
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
    and access.user_id=actor
    and access.is_active
    and coalesce(settings.portal_enabled,true);

  if not found then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select item.*
  into case_row
  from public.cases item
  join public.case_tasks task
    on task.organization_id=item.organization_id
    and task.case_id=item.id
  where task.id=target_task_id
    and item.organization_id=access_row.organization_id
    and item.customer_id=access_row.customer_id;

  if not found then
    raise exception 'document requirement not found'
      using errcode='P0002';
  end if;

  select task.*
  into task_row
  from public.case_tasks task
  where task.id=target_task_id
    and task.organization_id=case_row.organization_id
    and task.case_id=case_row.id
    and task.intake_follow_up_id is not null
    and task.intake_question_definition_id is not null
    and jsonb_typeof(
      task.intake_requirement_context->'missing_option_labels'
    )='array'
    and jsonb_array_length(
      task.intake_requirement_context->'missing_option_labels'
    )>0;

  if not found then
    raise exception 'document requirement not found'
      using errcode='P0002';
  end if;

  -- A repeat submission returns the original durable confirmation,
  -- even if Staff has subsequently advanced the Task.
  select existing.*
  into confirmation
  from public.case_document_confirmations existing
  where existing.task_id=task_row.id;

  if found then
    return query
    select
      confirmation.id,
      case_row.case_number,
      confirmation.task_id,
      confirmation.reported_sent_at;
    return;
  end if;

  if case_row.status in ('COMPLETED','CLOSED','CANCELLED')
     or task_row.status <> 'IN_PROGRESS'
  then
    raise exception 'document requirement is not awaiting confirmation'
      using errcode='23514';
  end if;

  select customer.name
  into customer_name
  from public.customers customer
  where customer.organization_id=access_row.organization_id
    and customer.id=access_row.customer_id;

  select string_agg(label, ', ' order by ordinal)
  into document_labels
  from jsonb_array_elements_text(
    task_row.intake_requirement_context->'missing_option_labels'
  ) with ordinality as labels(label,ordinal);

  insert into public.case_document_confirmations(
    organization_id,
    case_id,
    task_id,
    customer_id,
    portal_access_id,
    reported_by_user_id
  )
  values(
    case_row.organization_id,
    case_row.id,
    task_row.id,
    access_row.customer_id,
    access_row.id,
    actor
  )
  on conflict (task_id) do nothing
  returning *
  into confirmation;

  -- Concurrent repeat submissions resolve to the same confirmation.
  if confirmation.id is null then
    select existing.*
    into confirmation
    from public.case_document_confirmations existing
    where existing.task_id=task_row.id;

    return query
    select
      confirmation.id,
      case_row.case_number,
      confirmation.task_id,
      confirmation.reported_sent_at;
    return;
  end if;

  -- Notify every Staff member currently assigned to this Case.
  -- Historical notifications remain attached to the recipient who
  -- was assigned when the customer reported the submission.
  for recipient in
    select distinct assignment.user_id
    from public.case_assignments assignment
    join public.organization_members member
      on member.organization_id=assignment.organization_id
      and member.user_id=assignment.user_id
      and member.is_active
      and member.role in (
        'BUSINESS_OWNER',
        'BUSINESS_ADMIN',
        'STAFF_MANAGER',
        'STAFF_USER'
      )
    join public.profiles profile
      on profile.id=assignment.user_id
      and profile.is_active
    where assignment.organization_id=case_row.organization_id
      and assignment.case_id=case_row.id
      and assignment.is_active
      and assignment.assignment_role in ('MANAGER','STAFF')
  loop
    perform public.create_notification(
      case_row.organization_id,
      recipient.user_id,
      'DOCUMENTS_REPORTED_SENT',
      'CASE',
      coalesce(customer_name,'Customer') || ' reported documents sent',
      case_row.case_number || ' · ' || coalesce(document_labels,'Documents'),
      'TASK',
      task_row.id,
      confirmation.id,
      '/cases/' || case_row.id::text || '#task-' || task_row.id::text
    );
  end loop;

  return query
  select
    confirmation.id,
    case_row.case_number,
    confirmation.task_id,
    confirmation.reported_sent_at;
end
$$;

alter function public.report_customer_case_documents_sent(uuid,uuid)
  owner to postgres;

revoke all
  on function public.report_customer_case_documents_sent(uuid,uuid)
  from public,anon,authenticated;

grant execute
  on function public.report_customer_case_documents_sent(uuid,uuid)
  to authenticated;

comment on function public.report_customer_case_documents_sent(uuid,uuid) is
  'Records an idempotent Customer Portal confirmation that a Guided Intake document requirement was submitted externally and notifies current Case assignees. Does not receive documents or complete the Task.';


-- ============================================================
-- CUSTOMER-SAFE DOCUMENT REQUIREMENT PROJECTION
--
-- Add the opaque Task identifier required for the confirmation
-- action plus the customer's previously reported timestamp.
-- No internal Task content or document content is exposed.
-- ============================================================

drop function if exists public.get_customer_portal_case_requirements(uuid);

create function public.get_customer_portal_case_requirements(
  target_portal_access_id uuid
)
returns table(
  task_id uuid,
  case_number text,
  missing_documents jsonb,
  reported_sent_at timestamptz
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
    task.id,
    item.case_number,
    task.intake_requirement_context->'missing_option_labels',
    confirmation.reported_sent_at
  from authorized_portal_access access
  join public.cases item
    on item.organization_id=access.organization_id
    and item.customer_id=access.customer_id
  join public.case_tasks task
    on task.organization_id=item.organization_id
    and task.case_id=item.id
  left join public.case_document_confirmations confirmation
    on confirmation.task_id=task.id
  where item.status not in ('COMPLETED','CLOSED','CANCELLED')
    and task.status='IN_PROGRESS'
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

revoke all
  on function public.get_customer_portal_case_requirements(uuid)
  from public,anon,authenticated;

grant execute
  on function public.get_customer_portal_case_requirements(uuid)
  to authenticated;

comment on function public.get_customer_portal_case_requirements(uuid) is
  'Customer-safe active document requirements for the authenticated Customer Portal relationship, including reported-submission state. No document content is exposed or stored.';

commit;
