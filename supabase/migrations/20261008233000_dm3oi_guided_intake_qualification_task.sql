begin;

-- A Case may have one system-owned Guided Intake qualification Task.
-- It is deliberately separate from intake_follow_up_id because the existing
-- Guided Intake follow-up contract is scoped to document requirements and
-- individual YES_REQUIRED Questions.

alter table public.case_tasks
  add column if not exists intake_qualification_key text null,
  add column if not exists intake_qualification_signature text null,
  add column if not exists intake_qualification_notice_sent_at timestamptz null;

alter table public.case_tasks
  drop constraint if exists case_tasks_intake_qualification_shape;

alter table public.case_tasks
  add constraint case_tasks_intake_qualification_shape check (
    (
      intake_qualification_key is null
      and intake_qualification_signature is null
      and intake_qualification_notice_sent_at is null
    )
    or (
      intake_qualification_key = 'GUIDED_INTAKE_QUALIFICATION'
      and intake_qualification_signature is not null
      and intake_follow_up_id is null
      and intake_question_definition_id is null
      and intake_requirement_context is null
    )
  );

create unique index if not exists
  case_tasks_one_guided_intake_qualification_task_idx
on public.case_tasks(
  organization_id,
  case_id,
  intake_qualification_key
)
where intake_qualification_key is not null;

comment on column public.case_tasks.intake_qualification_key is
  'System provenance for the single Case-level Guided Intake qualification Task.';

comment on column public.case_tasks.intake_qualification_signature is
  'Stable signature of the current unresolved qualification findings.';

comment on column public.case_tasks.intake_qualification_notice_sent_at is
  'Timestamp of the Customer notice for the current qualification signature.';

create or replace function public.protect_guided_intake_qualification_task()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.intake_qualification_key is not null
     and auth.uid() is not null
  then
    raise exception
      'Guided Intake qualification Tasks are controlled by the workflow.'
      using errcode='42501';
  end if;

  if tg_op='DELETE' then
    return old;
  end if;

  return new;
end
$$;

drop trigger if exists protect_guided_intake_qualification_task_delete
on public.case_tasks;

drop trigger if exists protect_guided_intake_qualification_task_mutation
on public.case_tasks;

create trigger protect_guided_intake_qualification_task_mutation
before update or delete on public.case_tasks
for each row
when (old.intake_qualification_key is not null)
execute function public.protect_guided_intake_qualification_task();

revoke all
on function public.protect_guided_intake_qualification_task()
from public, anon, authenticated;

create or replace function public.sync_guided_intake_qualification_task(
  target_organization_id uuid,
  target_case_id uuid,
  target_actor_user_id uuid,
  target_findings jsonb,
  target_assigned_user_id uuid default null,
  target_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  item public.cases;
  existing public.case_tasks;
  changed public.case_tasks;
  findings_count integer;
  finding_signature text;
  finding_description text;
  next_sequence integer;
begin
  if target_organization_id is null
     or target_case_id is null
     or target_actor_user_id is null
     or jsonb_typeof(target_findings) <> 'array'
  then
    raise exception 'invalid qualification Task synchronization'
      using errcode='22023';
  end if;

  select *
  into item
  from public.cases
  where organization_id=target_organization_id
    and id=target_case_id;

  if not found then
    raise exception 'Case not found' using errcode='P0002';
  end if;

  if target_assigned_user_id is not null
     and not exists (
       select 1
       from public.organization_members member
       join public.profiles profile
         on profile.id=member.user_id
        and profile.is_active
       where member.organization_id=target_organization_id
         and member.user_id=target_assigned_user_id
         and member.is_active
         and member.status='ACTIVE'
         and not public.is_super_admin(member.user_id)
     )
  then
    raise exception 'invalid qualification Task assignee'
      using errcode='23514';
  end if;

  select count(*)
  into findings_count
  from jsonb_array_elements(target_findings);

  select *
  into existing
  from public.case_tasks
  where organization_id=target_organization_id
    and case_id=target_case_id
    and intake_qualification_key='GUIDED_INTAKE_QUALIFICATION'
  for update;

  if findings_count=0 then
    if found and existing.status <> 'COMPLETED' then
      update public.case_tasks
      set
        status='COMPLETED',
        completed_at=coalesce(completed_at,now()),
        completed_by_user_id=target_actor_user_id,
        description='All Guided Intake qualification requirements are satisfied.',
        intake_qualification_signature='SATISFIED',
        intake_qualification_notice_sent_at=null,
        updated_at=now()
      where id=existing.id
      returning * into changed;
    else
      changed:=existing;
    end if;

    return jsonb_build_object(
      'task_id',
        case when changed.id is null then null else changed.id::text end,
      'finding_count',0,
      'notice_sent_at',null
    );
  end if;

  if existing.id is null
     and (target_assigned_user_id is null or target_due_date is null)
  then
    return jsonb_build_object(
      'task_id',null,
      'finding_count',findings_count,
      'requires_configuration',true,
      'notice_sent_at',null
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(target_findings) finding
    where jsonb_typeof(finding) <> 'object'
       or nullif(trim(finding->>'title'),'') is null
       or nullif(trim(finding->>'message'),'') is null
  ) then
    raise exception 'invalid qualification finding'
      using errcode='22023';
  end if;

  finding_signature:=md5(target_findings::text);

  select string_agg(
    trim(finding->>'title') || ': ' || trim(finding->>'message'),
    E'\n'
    order by finding->>'title'
  )
  into finding_description
  from jsonb_array_elements(target_findings) finding;

  if existing.id is not null then
    update public.case_tasks
    set
      title='Resolve qualification requirements',
      description=finding_description,
      assigned_user_id=coalesce(target_assigned_user_id,existing.assigned_user_id),
      due_at=coalesce(target_due_date,existing.due_at),
      status=case
        when existing.status='COMPLETED' then 'WAITING_ON_CUSTOMER'
        else existing.status
      end,
      required=true,
      blocking=true,
      completed_at=case
        when existing.status='COMPLETED' then null
        else existing.completed_at
      end,
      completed_by_user_id=case
        when existing.status='COMPLETED' then null
        else existing.completed_by_user_id
      end,
      intake_qualification_signature=finding_signature,
      intake_qualification_notice_sent_at=case
        when existing.intake_qualification_signature=finding_signature
          then existing.intake_qualification_notice_sent_at
        else null
      end,
      updated_at=now()
    where id=existing.id
    returning * into changed;
  else
    select coalesce(max(sequence),0)+1
    into next_sequence
    from public.case_tasks
    where organization_id=target_organization_id
      and case_id=target_case_id;

    insert into public.case_tasks(
      organization_id,
      case_id,
      title,
      description,
      assigned_user_id,
      status,
      required,
      due_at,
      sequence,
      created_by_user_id,
      blocking,
      intake_qualification_key,
      intake_qualification_signature,
      intake_qualification_notice_sent_at
    )
    values(
      target_organization_id,
      target_case_id,
      'Resolve qualification requirements',
      finding_description,
      target_assigned_user_id,
      'WAITING_ON_CUSTOMER',
      true,
      target_due_date,
      next_sequence,
      target_actor_user_id,
      true,
      'GUIDED_INTAKE_QUALIFICATION',
      finding_signature,
      null
    )
    returning * into changed;
  end if;

  return jsonb_build_object(
    'task_id',changed.id::text,
    'finding_count',findings_count,
    'notice_sent_at',changed.intake_qualification_notice_sent_at
  );
end
$$;

revoke all
on function public.sync_guided_intake_qualification_task(
  uuid,uuid,uuid,jsonb,uuid,date
)
from public,anon,authenticated;

grant execute
on function public.sync_guided_intake_qualification_task(
  uuid,uuid,uuid,jsonb,uuid,date
)
to service_role;


create or replace function public.get_guided_intake_qualification_notice_state(
  target_organization_id uuid,
  target_case_id uuid
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'task_id',task.id::text,
        'signature',task.intake_qualification_signature,
        'notice_sent_at',task.intake_qualification_notice_sent_at
      )
      from public.case_tasks task
      where task.organization_id=target_organization_id
        and task.case_id=target_case_id
        and task.intake_qualification_key='GUIDED_INTAKE_QUALIFICATION'
      limit 1
    ),
    '{}'::jsonb
  )
$$;

revoke all
on function public.get_guided_intake_qualification_notice_state(uuid,uuid)
from public,anon,authenticated;

grant execute
on function public.get_guided_intake_qualification_notice_state(uuid,uuid)
to service_role;


create or replace function public.mark_guided_intake_qualification_notice_sent(
  target_organization_id uuid,
  target_case_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.case_tasks
  set
    intake_qualification_notice_sent_at=now(),
    updated_at=now()
  where organization_id=target_organization_id
    and case_id=target_case_id
    and intake_qualification_key='GUIDED_INTAKE_QUALIFICATION';

  return found;
end
$$;

revoke all
on function public.mark_guided_intake_qualification_notice_sent(uuid,uuid)
from public,anon,authenticated;

grant execute
on function public.mark_guided_intake_qualification_notice_sent(uuid,uuid)
to service_role;


-- Keep the database-side editable-template variable allowlist aligned with
-- the application template definition. The special MISSING_DOCUMENTS_NOTICE
-- renderer uses this variable for the Customer-safe qualification section.

create or replace function public.email_template_content_is_safe(
  target_template_key text,
  target_content text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  allowed text[];
  token text[];
  remainder text;
begin
  allowed := case target_template_key
    when 'ORGANIZATION_USER_INVITATION' then
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'role',
        'action_url'
      ]
    when 'ORGANIZATION_USER_INVITATION_RESEND' then
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'role',
        'action_url'
      ]
    when 'CUSTOMER_PORTAL_INVITATION' then
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'action_url'
      ]
    when 'MISSING_DOCUMENTS_NOTICE' then
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'case_number',
        'missing_documents',
        'additional_information',
        'action_url'
      ]
    when 'SIGN_IN_CODE' then
      array[
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'sign_in_code',
        'action_url'
      ]
    when 'NEW_SERVICE_REQUEST_NOTIFICATION' then
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'service_request_number',
        'customer_name',
        'request_subject',
        'action_url'
      ]
    when 'CUSTOMER_DATA_SUBMISSION_NOTIFICATION' then
      array[
        'organization_name',
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'uploader_name',
        'uploader_email',
        'filename',
        'submitted_at',
        'action_url'
      ]
    when 'NEW_TRIAL_REQUEST_NOTIFICATION' then
      array[
        'recipient_first_name',
        'recipient_name',
        'recipient_email',
        'trial_request_number',
        'business_name',
        'contact_name',
        'business_email',
        'phone',
        'primary_use_case',
        'estimated_users',
        'action_url'
      ]
    else array[]::text[]
  end;

  for token in
    select captures
    from pg_catalog.regexp_matches(
      target_content,
      '\{\{([a-z_]+)\}\}',
      'g'
    ) as matched(captures)
  loop
    if not token[1] = any(allowed) then
      return false;
    end if;
  end loop;

  remainder := pg_catalog.regexp_replace(
    target_content,
    '\{\{[a-z_]+\}\}',
    '',
    'g'
  );

  return pg_catalog.strpos(remainder, '{{') = 0
    and pg_catalog.strpos(remainder, '}}') = 0;
end;
$$;

revoke all on function public.email_template_content_is_safe(text, text)
  from public, anon, authenticated;



-- Broaden the original missing-document defaults so the same tracked
-- delivery can represent documents, qualification information, or both.
-- Preserve administrator-customized copy by updating only the original
-- canonical defaults.

update public.platform_email_templates
set
  subject_template='Items needed for {{case_number}}',
  updated_at=now()
where template_key='MISSING_DOCUMENTS_NOTICE'
  and subject_template='Documents needed for {{case_number}}';

update public.platform_email_templates
set
  opening_message=
    'Hello {{recipient_first_name}}, {{organization_name}} needs additional information or documents to continue your Case {{case_number}}.',
  updated_at=now()
where template_key='MISSING_DOCUMENTS_NOTICE'
  and opening_message=
    'Hello {{recipient_first_name}}, {{organization_name}} is waiting for the following document(s) to continue your Case: {{missing_documents}}.';


commit;
