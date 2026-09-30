begin;

-- Convert the existing unique Task index into a named constraint so the
-- idempotent insert can target it without colliding with the RPC's
-- task_id output parameter.
alter table public.case_document_confirmations
  add constraint case_document_confirmations_task_key
  unique using index case_document_confirmations_task_uidx;

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
  on conflict on constraint case_document_confirmations_task_key
    do nothing
  returning *
  into confirmation;

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

commit;
