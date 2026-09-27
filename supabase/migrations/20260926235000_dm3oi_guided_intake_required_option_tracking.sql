-- Per-Case required-option tracking for Guided Intake MULTI_SELECT Questions.
-- Organization configuration defines the available catalog; intake state
-- independently records which items are required and which were received.

alter table public.question_definitions
  add column track_required_options boolean not null default false;

update public.question_definitions
set require_all_options=false,
  track_required_options=false
where response_type<>'MULTI_SELECT'
  and (require_all_options or track_required_options);

alter table public.question_definitions
  add constraint question_definitions_multi_select_requirement_mode_check
  check (
    (response_type = 'MULTI_SELECT' or (
      not require_all_options and not track_required_options
    ))
    and not (require_all_options and track_required_options)
  );

grant select(track_required_options)
  on public.question_definitions
  to authenticated;

alter table public.guided_case_intake_drafts
  add column required_option_ids jsonb not null default '{}'::jsonb;

alter table public.guided_case_intake_drafts
  add constraint guided_case_intake_drafts_required_option_ids_object
  check (jsonb_typeof(required_option_ids) = 'object');

create or replace view public.organization_question_definitions
with (security_barrier=true) as
select
  q.id,
  q.organization_id,
  q.question_text,
  q.description,
  q.response_type,
  q.required,
  q.active,
  q.display_order,
  public.organization_actor_id(q.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(q.created_by_user_id) as created_by_display_name,
  q.created_at,
  q.updated_at,
  q.require_all_options,
  q.question_group,
  q.track_required_options
from public.question_definitions q
where public.is_super_admin(auth.uid())
   or public.is_internal_member(q.organization_id,auth.uid());

drop function if exists public.save_question_definition(
  uuid,uuid,text,text,public.question_response_type,boolean,boolean,boolean,
  integer,jsonb,text
);

create function public.save_question_definition(
  target_organization_id uuid,
  target_question_id uuid,
  target_question_text text,
  target_description text,
  target_response_type public.question_response_type,
  target_required boolean,
  target_require_all_options boolean,
  target_track_required_options boolean,
  target_active boolean,
  target_display_order integer,
  target_options jsonb default '[]',
  target_question_group text default null
)
returns public.question_definitions
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  item public.question_definitions;
  opt jsonb;
  option_id uuid;
  seen_option_ids uuid[]:='{}'::uuid[];
  normalized_group text:=nullif(trim(coalesce(target_question_group,'')),'');
  normalized_require_all boolean:=false;
  normalized_track_required boolean:=false;
begin
  if not public.has_effective_organization_permission(
    target_organization_id,
    'MANAGE_QUESTIONS'
  ) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if normalized_group is not null
    and normalized_group not in (
      'CUSTOMER_PROFILE',
      'VERIFICATION_ELIGIBILITY',
      'REQUIRED_DOCUMENTS',
      'MISSING_INFORMATION_FOLLOW_UP',
      'READY_FOR_HANDOFF'
    )
  then
    raise exception 'invalid question group' using errcode='22023';
  end if;

  if jsonb_typeof(target_options)<>'array' then
    raise exception 'options must be an array' using errcode='22023';
  end if;

  if target_response_type in ('SINGLE_SELECT','MULTI_SELECT')
    and not exists(
      select 1
      from jsonb_array_elements(target_options) candidate
      where coalesce((candidate->>'is_active')::boolean,true)
        and length(trim(coalesce(candidate->>'label','')))>0
    )
  then
    raise exception 'select questions require at least one displayed option'
      using errcode='23514';
  end if;

  if target_response_type='MULTI_SELECT' then
    normalized_require_all:=coalesce(target_require_all_options,false);
    normalized_track_required:=coalesce(target_track_required_options,false);
  end if;

  if normalized_require_all and normalized_track_required then
    raise exception 'require-all and tracked required options cannot coexist'
      using errcode='23514';
  end if;

  if target_question_id is null then
    insert into public.question_definitions(
      organization_id,question_text,description,response_type,required,
      require_all_options,track_required_options,active,display_order,
      question_group,created_by_user_id
    ) values(
      target_organization_id,trim(target_question_text),
      coalesce(target_description,''),target_response_type,target_required,
      normalized_require_all,normalized_track_required,target_active,
      target_display_order,normalized_group,actor
    ) returning * into item;
  else
    update public.question_definitions
    set question_text=trim(target_question_text),
      description=coalesce(target_description,''),
      response_type=target_response_type,
      required=target_required,
      require_all_options=normalized_require_all,
      track_required_options=normalized_track_required,
      active=target_active,
      display_order=target_display_order,
      question_group=normalized_group
    where id=target_question_id
      and organization_id=target_organization_id
    returning * into item;
    if not found then
      raise exception 'question not found' using errcode='P0002';
    end if;
  end if;

  for opt in select value from jsonb_array_elements(target_options) loop
    if length(trim(coalesce(opt->>'label','')))=0 then
      raise exception 'question option label is required' using errcode='23514';
    end if;
    option_id:=nullif(opt->>'id','')::uuid;
    if option_id is not null then
      update public.question_options
      set option_label=trim(opt->>'label'),
        display_order=coalesce((opt->>'display_order')::integer,0),
        is_active=coalesce((opt->>'is_active')::boolean,true)
      where id=option_id
        and organization_id=target_organization_id
        and question_id=item.id;
      if not found then
        raise exception 'invalid question option' using errcode='23514';
      end if;
    else
      insert into public.question_options(
        organization_id,question_id,option_label,option_value,display_order,is_active
      ) values(
        target_organization_id,item.id,trim(opt->>'label'),trim(opt->>'value'),
        coalesce((opt->>'display_order')::integer,0),
        coalesce((opt->>'is_active')::boolean,true)
      ) returning id into option_id;
    end if;
    seen_option_ids:=array_append(seen_option_ids,option_id);
  end loop;

  update public.question_options
  set is_active=false
  where organization_id=target_organization_id
    and question_id=item.id
    and not (id=any(seen_option_ids));

  if not public.is_super_admin(actor)
    and public.is_super_admin(item.created_by_user_id)
  then
    item.created_by_user_id:=null;
  end if;
  return item;
end $$;

revoke all on function public.save_question_definition(
  uuid,uuid,text,text,public.question_response_type,boolean,boolean,boolean,
  boolean,integer,jsonb,text
) from public,anon;
grant execute on function public.save_question_definition(
  uuid,uuid,text,text,public.question_response_type,boolean,boolean,boolean,
  boolean,integer,jsonb,text
) to authenticated;

drop function if exists public.create_guided_case_intake(
  uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,uuid,uuid[],jsonb,jsonb
);

create function public.create_guided_case_intake(
  target_organization_id uuid,
  target_submission_key uuid,
  target_customer_id uuid,
  target_case_title_id uuid,
  target_description text,
  target_case_type_id uuid,
  target_priority public.priority_level,
  target_tax_year integer,
  target_manager_user_id uuid default null,
  target_staff_user_ids uuid[] default '{}'::uuid[],
  target_answers jsonb default '{}'::jsonb,
  target_required_option_ids jsonb default '{}'::jsonb,
  target_follow_up_tasks jsonb default '[]'::jsonb
)
returns public.cases
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  created public.cases;
  existing_case_id uuid;
  follow_up jsonb;
  question_row public.question_definitions;
  case_question_row public.case_questions;
  required_value jsonb;
  received_value jsonb;
  authoritative_missing_ids uuid[];
  authoritative_missing_labels text[];
  submitted_missing_ids uuid[];
  submitted_missing_labels text[];
  required_ids uuid[];
  snapshot_ids uuid[];
  task_id uuid;
  next_sequence integer;
  completed boolean;
begin
  if actor is null
    or not public.has_effective_organization_permission(
      target_organization_id,'CREATE_CASE'
    )
    or not public.has_effective_organization_permission(
      target_organization_id,'VIEW_CUSTOMERS'
    )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if target_tax_year is null or target_tax_year not between 1900 and 2200 then
    raise exception 'valid Case tax year is required' using errcode='23514';
  end if;
  if jsonb_typeof(target_answers)<>'object' then
    raise exception 'answers must be an object' using errcode='22023';
  end if;
  if jsonb_typeof(target_required_option_ids)<>'object' then
    raise exception 'required option selections must be an object' using errcode='22023';
  end if;
  if jsonb_typeof(target_follow_up_tasks)<>'array' then
    raise exception 'follow-up Tasks must be an array' using errcode='22023';
  end if;

  if exists(
    select 1
    from jsonb_object_keys(target_required_option_ids) submitted(question_id)
    left join public.question_definitions q
      on q.id::text=submitted.question_id
      and q.organization_id=target_organization_id
      and q.active
      and q.response_type='MULTI_SELECT'
      and q.track_required_options
    where q.id is null
  ) then
    raise exception 'invalid tracked intake question' using errcode='23514';
  end if;

  for question_row in
    select q.*
    from public.question_definitions q
    where q.organization_id=target_organization_id
      and q.active
      and q.response_type='MULTI_SELECT'
      and q.track_required_options
  loop
    required_value:=target_required_option_ids->question_row.id::text;
    received_value:=target_answers->question_row.id::text;

    if required_value is not null and jsonb_typeof(required_value)<>'array' then
      raise exception 'tracked required options must be an array' using errcode='22023';
    end if;
    if received_value is not null and jsonb_typeof(received_value)<>'array' then
      raise exception 'tracked received options must be an array' using errcode='22023';
    end if;
    if required_value is not null and exists(
      select selected.value
      from jsonb_array_elements_text(required_value) selected(value)
      group by selected.value having count(*)>1
    ) then
      raise exception 'duplicate tracked required option' using errcode='23514';
    end if;
    if received_value is not null and exists(
      select received.value
      from jsonb_array_elements_text(received_value) received(value)
      group by received.value having count(*)>1
    ) then
      raise exception 'duplicate tracked received option' using errcode='23514';
    end if;
    if required_value is not null and exists(
      select 1
      from jsonb_array_elements_text(required_value) selected(value)
      left join public.question_options option_row
        on option_row.id::text=selected.value
        and option_row.organization_id=target_organization_id
        and option_row.question_id=question_row.id
        and option_row.is_active
      where option_row.id is null
    ) then
      raise exception 'invalid tracked required option' using errcode='23514';
    end if;
    if received_value is not null and exists(
      select 1
      from jsonb_array_elements_text(received_value) received(value)
      left join public.question_options option_row
        on option_row.id::text=received.value
        and option_row.organization_id=target_organization_id
        and option_row.question_id=question_row.id
        and option_row.is_active
      where option_row.id is null
    ) then
      raise exception 'invalid tracked received option' using errcode='23514';
    end if;
    if received_value is not null and exists(
      select 1
      from jsonb_array_elements_text(received_value) received(value)
      where required_value is null
         or not exists(
           select 1
           from jsonb_array_elements_text(required_value) required(value)
           where required.value=received.value
         )
    ) then
      raise exception 'received option is not required' using errcode='23514';
    end if;
  end loop;

  if exists(
    select submitted->>'id'
    from jsonb_array_elements(target_follow_up_tasks) submitted
    group by submitted->>'id' having count(*)>1
  ) then
    raise exception 'duplicate follow-up Task' using errcode='23514';
  end if;
  if exists(
    select submitted->>'questionId'
    from jsonb_array_elements(target_follow_up_tasks) submitted
    group by submitted->>'questionId' having count(*)>1
  ) then
    raise exception 'duplicate follow-up requirement Task' using errcode='23514';
  end if;

  for follow_up in select value from jsonb_array_elements(target_follow_up_tasks) loop
    if nullif(follow_up->>'id','')::uuid is null
      or follow_up->>'title'<>'Obtain missing required documents'
      or nullif(follow_up->>'assignedUserId','')::uuid is null
      or coalesce(follow_up->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(follow_up->'missingOptionIds')<>'array'
      or jsonb_typeof(follow_up->'missingOptionLabels')<>'array'
    then
      raise exception 'invalid follow-up Task' using errcode='23514';
    end if;

    select * into question_row
    from public.question_definitions q
    where q.id=nullif(follow_up->>'questionId','')::uuid
      and q.organization_id=target_organization_id
      and q.active
      and q.response_type='MULTI_SELECT'
      and (q.require_all_options or q.track_required_options);
    if not found then
      raise exception 'invalid follow-up intake requirement' using errcode='23514';
    end if;

    required_value:=case when question_row.track_required_options
      then coalesce(target_required_option_ids->question_row.id::text,'[]'::jsonb)
      else coalesce((
        select jsonb_agg(option_row.id order by option_row.display_order,option_row.id)
        from public.question_options option_row
        where option_row.organization_id=target_organization_id
          and option_row.question_id=question_row.id
          and option_row.is_active
      ),'[]'::jsonb) end;
    received_value:=coalesce(target_answers->question_row.id::text,'[]'::jsonb);

    select coalesce(array_agg(option_row.id order by option_row.display_order,option_row.id),'{}'::uuid[]),
      coalesce(array_agg(option_row.option_label order by option_row.display_order,option_row.id),'{}'::text[])
    into authoritative_missing_ids,authoritative_missing_labels
    from public.question_options option_row
    where option_row.organization_id=target_organization_id
      and option_row.question_id=question_row.id
      and option_row.is_active
      and exists(
        select 1 from jsonb_array_elements_text(required_value) required(value)
        where required.value=option_row.id::text
      )
      and not exists(
        select 1 from jsonb_array_elements_text(received_value) received(value)
        where received.value=option_row.id::text
      );

    select coalesce(array_agg(value::uuid),'{}'::uuid[])
      into submitted_missing_ids
    from jsonb_array_elements_text(follow_up->'missingOptionIds') submitted(value);
    select coalesce(array_agg(value),'{}'::text[])
      into submitted_missing_labels
    from jsonb_array_elements_text(follow_up->'missingOptionLabels') submitted(value);

    if submitted_missing_ids<>authoritative_missing_ids
      or submitted_missing_labels<>authoritative_missing_labels
    then
      raise exception 'follow-up Task does not match missing requirements' using errcode='23514';
    end if;

    if not exists(
      select 1
      from public.organization_members member
      join public.profiles profile on profile.id=member.user_id and profile.is_active
      where member.organization_id=target_organization_id
        and member.user_id=nullif(follow_up->>'assignedUserId','')::uuid
        and member.is_active and member.status='ACTIVE'
        and not public.is_super_admin(member.user_id)
    ) then
      raise exception 'invalid follow-up Task assignee' using errcode='23514';
    end if;

    completed:=coalesce((follow_up->>'completed')::boolean,false);
    if completed and cardinality(authoritative_missing_ids)>0 then
      raise exception 'missing documents prevent follow-up Task completion' using errcode='23514';
    end if;
  end loop;

  select c.id into existing_case_id
  from public.cases c
  where c.organization_id=target_organization_id
    and c.created_by_user_id=actor
    and c.intake_submission_key=target_submission_key;

  created:=private.create_guided_case_intake(
    target_organization_id,target_submission_key,target_customer_id,
    target_case_title_id,target_description,target_case_type_id,target_priority,
    target_manager_user_id,target_staff_user_ids,target_answers
  );

  update public.cases set tax_year=target_tax_year
  where id=created.id and (tax_year is null or tax_year=target_tax_year)
  returning * into created;
  if not found then
    raise exception 'Case tax year is immutable through intake replay' using errcode='23514';
  end if;

  for case_question_row in
    select case_question.*
    from public.case_questions case_question
    join public.question_definitions q
      on q.id=case_question.question_definition_id
      and q.organization_id=case_question.organization_id
      and q.track_required_options
    where case_question.organization_id=target_organization_id
      and case_question.case_id=created.id
    order by case_question.display_order,case_question.id
  loop
    required_value:=coalesce(
      target_required_option_ids->case_question_row.question_definition_id::text,
      '[]'::jsonb
    );
    received_value:=coalesce(
      target_answers->case_question_row.question_definition_id::text,
      '[]'::jsonb
    );

    if case_question_row.required and jsonb_array_length(required_value)=0 then
      raise exception 'tracked required question requires at least one option'
        using errcode='23514';
    end if;
    if exists(
      select 1
      from jsonb_array_elements_text(required_value) required(value)
      where not exists(
        select 1
        from jsonb_array_elements_text(received_value) received(value)
        where received.value=required.value
      )
    ) then
      raise exception 'required tracked option has not been received'
        using errcode='23514';
    end if;

    select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[])
      into required_ids
    from jsonb_array_elements_text(required_value) required(value);
    select coalesce(array_agg((snapshot->>'id')::uuid order by (snapshot->>'id')::uuid),'{}'::uuid[])
      into snapshot_ids
    from jsonb_array_elements(case_question_row.options_snapshot) snapshot;

    if existing_case_id is not null then
      if snapshot_ids<>required_ids then
        raise exception 'Case required option snapshot is immutable through intake replay'
          using errcode='23514';
      end if;
    else
      update public.case_questions
      set options_snapshot=coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',option_row.id,
          'label',option_row.option_label,
          'value',option_row.option_value,
          'display_order',option_row.display_order
        ) order by option_row.display_order,option_row.id)
        from public.question_options option_row
        where option_row.organization_id=target_organization_id
          and option_row.question_id=case_question_row.question_definition_id
          and option_row.is_active
          and exists(
            select 1
            from jsonb_array_elements_text(required_value) required(value)
            where required.value=option_row.id::text
          )
      ),'[]'::jsonb)
      where id=case_question_row.id
        and organization_id=target_organization_id
        and case_id=created.id;
    end if;
  end loop;

  for follow_up in select value from jsonb_array_elements(target_follow_up_tasks) loop
    if existing_case_id is not null and not exists(
      select 1
      from public.case_tasks existing_task
      where existing_task.organization_id=target_organization_id
        and existing_task.case_id=created.id
        and existing_task.intake_follow_up_id=(follow_up->>'id')::uuid
    ) then
      raise exception 'follow-up Tasks are immutable through intake replay'
        using errcode='23514';
    end if;
    select coalesce(max(sequence),0)+1 into next_sequence
    from public.case_tasks where case_id=created.id;
    completed:=coalesce((follow_up->>'completed')::boolean,false);
    insert into public.case_tasks(
      organization_id,case_id,title,description,assigned_user_id,status,required,
      due_at,sequence,created_by_user_id,priority,blocking,intake_follow_up_id,
      intake_question_definition_id,intake_requirement_context
    ) values(
      target_organization_id,created.id,'Obtain missing required documents',
      coalesce(follow_up->>'description',''),
      (follow_up->>'assignedUserId')::uuid,
      case when completed then 'COMPLETED'::public.case_task_status
        else 'NOT_STARTED'::public.case_task_status end,
      true,public.organization_end_of_date(
        target_organization_id,(follow_up->>'dueDate')::date
      ),next_sequence,actor,'NORMAL',true,(follow_up->>'id')::uuid,
      (follow_up->>'questionId')::uuid,
      jsonb_build_object(
        'missing_option_ids',follow_up->'missingOptionIds',
        'missing_option_labels',follow_up->'missingOptionLabels'
      )
    ) on conflict(organization_id,case_id,intake_follow_up_id)
      where intake_follow_up_id is not null do nothing
    returning id into task_id;
    if task_id is not null then
      insert into public.case_activity(
        organization_id,case_id,actor_user_id,event_type,event_data
      ) values(
        target_organization_id,created.id,actor,'TASK_CREATED',
        jsonb_build_object(
          'task_id',task_id,
          'title','Obtain missing required documents',
          'source','GUIDED_INTAKE'
        )
      );
    end if;
    task_id:=null;
  end loop;
  return created;
end $$;

revoke all on function public.create_guided_case_intake(
  uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,uuid,uuid[],jsonb,jsonb,jsonb
) from public,anon;
grant execute on function public.create_guided_case_intake(
  uuid,uuid,uuid,uuid,text,uuid,public.priority_level,integer,uuid,uuid[],jsonb,jsonb,jsonb
) to authenticated;

do $$
declare affected integer;
begin
  update public.question_definitions
  set track_required_options=true,
    require_all_options=false
  where id='911c69ee-14bd-4391-ae87-f5b34047ea60'
    and organization_id='e5a00c5a-f028-47f8-bb34-5527219eb995'
    and response_type='MULTI_SELECT';
  get diagnostics affected=row_count;
  if affected<>1 then
    raise exception 'Mimms required-document Question was not found';
  end if;
end $$;
