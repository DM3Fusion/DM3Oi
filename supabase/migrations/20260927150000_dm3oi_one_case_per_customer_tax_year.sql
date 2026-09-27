-- Enforce one Case per Customer per tax year inside an organization.
-- Existing duplicates are never deleted or merged automatically.

do $$
begin
  if exists(
    select 1
    from public.cases
    where tax_year is not null
    group by organization_id,customer_id,tax_year
    having count(*)>1
  ) then
    raise exception
      'Cannot enforce one Case per Customer per tax year because historical duplicates exist. Resolve duplicates before applying this migration.'
      using errcode='23514';
  end if;
end $$;

create unique index cases_one_customer_per_tax_year
  on public.cases(organization_id,customer_id,tax_year)
  where tax_year is not null;

create or replace function public.create_case_workflow(
  target_organization_id uuid,target_customer_id uuid,target_title text,target_description text,target_case_type text,
  target_priority public.priority_level,target_tax_year integer,target_due_at timestamptz default null,
  target_manager_user_id uuid default null,target_staff_user_ids uuid[] default '{}'::uuid[],target_initial_tasks jsonb default '[]'::jsonb
) returns public.cases language plpgsql security definer set search_path='' as $$
declare created public.cases;
begin
  if target_tax_year is null or target_tax_year not between 1900 and 2200 then
    raise exception 'valid Case tax year is required' using errcode='23514';
  end if;
  if exists(
    select 1 from public.cases c
    where c.organization_id=target_organization_id
      and c.customer_id=target_customer_id
      and c.tax_year=target_tax_year
  ) then
    raise exception 'Customer already has a Case for this tax year' using errcode='23505';
  end if;
  if jsonb_typeof(target_initial_tasks)<>'array' then
    raise exception 'initial tasks must be an array' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(target_initial_tasks) task
    where nullif(task->>'due_at','') is null
  ) then
    raise exception 'every initial Task requires a Due Date' using errcode='23514';
  end if;

  created:=private.create_case_workflow(
    target_organization_id,target_customer_id,target_title,target_description,target_case_type,target_priority,
    target_due_at,target_manager_user_id,target_staff_user_ids,target_initial_tasks
  );

  update public.cases set tax_year=target_tax_year
  where id=created.id and (tax_year is null or tax_year=target_tax_year)
  returning * into created;

  if not found then
    raise exception 'Case tax year is immutable through creation replay' using errcode='23514';
  end if;
  return created;
end $$;

create or replace function public.create_guided_case_intake(
  target_organization_id uuid,target_submission_key uuid,target_customer_id uuid,target_case_title_id uuid,
  target_description text,target_case_type_id uuid,target_priority public.priority_level,target_tax_year integer,
  target_manager_user_id uuid default null,target_staff_user_ids uuid[] default '{}'::uuid[],
  target_answers jsonb default '{}'::jsonb,target_follow_up_tasks jsonb default '[]'::jsonb
) returns public.cases language plpgsql security definer set search_path='' as $$
declare
  created public.cases;
  follow_up jsonb;
  question_row public.question_definitions;
  task_id uuid;
  next_sequence integer;
  completed boolean;
begin
  if target_tax_year is null or target_tax_year not between 1900 and 2200 then
    raise exception 'valid Case tax year is required' using errcode='23514';
  end if;

  if exists(
    select 1 from public.cases c
    where c.organization_id=target_organization_id
      and c.customer_id=target_customer_id
      and c.tax_year=target_tax_year
      and c.intake_submission_key is distinct from target_submission_key
  ) then
    raise exception 'Customer already has a Case for this tax year' using errcode='23505';
  end if;

  if jsonb_typeof(target_follow_up_tasks)<>'array' then
    raise exception 'follow-up Tasks must be an array' using errcode='22023';
  end if;

  if exists(
    select submitted->>'id'
    from jsonb_array_elements(target_follow_up_tasks) submitted
    group by submitted->>'id'
    having count(*)>1
  ) then
    raise exception 'duplicate follow-up Task' using errcode='23514';
  end if;

  for follow_up in select value from jsonb_array_elements(target_follow_up_tasks) loop
    if nullif(follow_up->>'id','')::uuid is null
      or length(trim(coalesce(follow_up->>'title','')))=0
      or nullif(follow_up->>'assignedUserId','')::uuid is null
      or coalesce(follow_up->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(follow_up->'missingOptionIds')<>'array'
      or jsonb_array_length(follow_up->'missingOptionIds')=0
      or jsonb_typeof(follow_up->'missingOptionLabels')<>'array'
    then
      raise exception 'invalid follow-up Task' using errcode='23514';
    end if;

    select * into question_row
    from public.question_definitions q
    where q.id=nullif(follow_up->>'questionId','')::uuid
      and q.organization_id=target_organization_id
      and q.response_type='MULTI_SELECT'
      and q.require_all_options;

    if not found then
      raise exception 'invalid follow-up intake requirement' using errcode='23514';
    end if;

    if exists(
      select 1
      from jsonb_array_elements_text(follow_up->'missingOptionIds') missing(id)
      left join public.question_options option_row
        on option_row.id=missing.id::uuid
        and option_row.question_id=question_row.id
        and option_row.organization_id=target_organization_id
      where option_row.id is null
    ) then
      raise exception 'invalid missing requirement option' using errcode='23514';
    end if;

    if not exists(
      select 1
      from public.organization_members member
      join public.profiles profile
        on profile.id=member.user_id and profile.is_active
      where member.organization_id=target_organization_id
        and member.user_id=nullif(follow_up->>'assignedUserId','')::uuid
        and member.is_active
        and member.status='ACTIVE'
        and not public.is_super_admin(member.user_id)
    ) then
      raise exception 'invalid follow-up Task assignee' using errcode='23514';
    end if;

    completed:=coalesce((follow_up->>'completed')::boolean,false);
    if completed and not(
      target_answers ? question_row.id::text
      and public.guided_intake_response_valid(
        target_organization_id,
        question_row.id,
        question_row.response_type,
        target_answers->question_row.id::text
      )
    ) then
      raise exception 'missing documents prevent follow-up Task completion' using errcode='23514';
    end if;
  end loop;

  created:=private.create_guided_case_intake(
    target_organization_id,target_submission_key,target_customer_id,target_case_title_id,
    target_description,target_case_type_id,target_priority,target_manager_user_id,
    target_staff_user_ids,target_answers
  );

  update public.cases set tax_year=target_tax_year
  where id=created.id and (tax_year is null or tax_year=target_tax_year)
  returning * into created;

  if not found then
    raise exception 'Case tax year is immutable through intake replay' using errcode='23514';
  end if;

  for follow_up in select value from jsonb_array_elements(target_follow_up_tasks) loop
    select coalesce(max(sequence),0)+1
    into next_sequence
    from public.case_tasks
    where case_id=created.id;

    completed:=coalesce((follow_up->>'completed')::boolean,false);

    insert into public.case_tasks(
      organization_id,case_id,title,description,assigned_user_id,status,required,due_at,sequence,created_by_user_id,
      priority,blocking,intake_follow_up_id,intake_question_definition_id,intake_requirement_context
    ) values(
      target_organization_id,created.id,trim(follow_up->>'title'),coalesce(follow_up->>'description',''),
      (follow_up->>'assignedUserId')::uuid,
      case when completed then 'COMPLETED'::public.case_task_status else 'NOT_STARTED'::public.case_task_status end,
      true,
      public.organization_end_of_date(target_organization_id,(follow_up->>'dueDate')::date),
      next_sequence,auth.uid(),'NORMAL',true,(follow_up->>'id')::uuid,
      (follow_up->>'questionId')::uuid,
      jsonb_build_object(
        'missing_option_ids',follow_up->'missingOptionIds',
        'missing_option_labels',follow_up->'missingOptionLabels'
      )
    )
    on conflict(organization_id,case_id,intake_follow_up_id)
      where intake_follow_up_id is not null
      do nothing
    returning id into task_id;

    if task_id is not null then
      insert into public.case_activity(
        organization_id,case_id,actor_user_id,event_type,event_data
      ) values(
        target_organization_id,created.id,auth.uid(),'TASK_CREATED',
        jsonb_build_object(
          'task_id',task_id,
          'title',follow_up->>'title',
          'source','GUIDED_INTAKE'
        )
      );
    end if;
    task_id:=null;
  end loop;

  return created;
end $$;

revoke all on function
  public.create_case_workflow(uuid,uuid,text,text,text,public.priority_level,integer,timestamptz,uuid,uuid[],jsonb),
  public.create_guided_case_intake(uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,uuid,uuid[],jsonb,jsonb)
from public,anon;

grant execute on function
  public.create_case_workflow(uuid,uuid,text,text,text,public.priority_level,integer,timestamptz,uuid,uuid[],jsonb),
  public.create_guided_case_intake(uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,uuid,uuid[],jsonb,jsonb)
to authenticated;
