-- Guided Intake Case model refinement.
-- New Guided Intake path no longer requires Case Titles.
-- Existing RPC overloads remain temporarily for backward compatibility with
-- the currently deployed application during migration-first deployment.

create or replace function private.create_guided_case_intake(
  target_organization_id uuid,
  target_submission_key uuid,
  target_customer_id uuid,
  target_description text,
  target_case_type_id uuid,
  target_priority public.priority_level,
  target_manager_user_id uuid default null,
  target_staff_user_ids uuid[] default '{}'::uuid[],
  target_answers jsonb default '{}'::jsonb
) returns public.cases language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  created_case public.cases;
  selected_type public.organization_case_types;
  staff_id uuid;
  question_row public.question_definitions;
  response_item record;
  case_question_id uuid;
  action_row public.rule_actions;
  task_id uuid;
  next_sequence integer:=0;
  applicable_question_ids uuid[]:='{}'::uuid[];
  expanded_question_ids uuid[]:='{}'::uuid[];
  effective_rule_ids uuid[]:='{}'::uuid[];
  previous_count integer:=-1;
begin
  if actor is null or target_submission_key is null
    or not public.has_effective_organization_permission(target_organization_id,'CREATE_CASE')
    or not public.has_effective_organization_permission(target_organization_id,'VIEW_CUSTOMERS')
  then raise exception 'not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.organizations o where o.id=target_organization_id and o.status='ACTIVE')
    then raise exception 'organization is inactive' using errcode='42501'; end if;

  select * into created_case from public.cases
  where organization_id=target_organization_id and created_by_user_id=actor
    and intake_submission_key=target_submission_key;
  if found then
    delete from public.guided_case_intake_drafts
    where organization_id=target_organization_id
      and created_by_user_id=actor
      and submission_key=target_submission_key;
    return created_case;
  end if;

  if not exists(select 1 from public.customers customer
    where customer.id=target_customer_id and customer.organization_id=target_organization_id
      and customer.status='ACTIVE')
    then raise exception 'invalid customer' using errcode='23514'; end if;
  select * into selected_type from public.organization_case_types type_option
  where type_option.id=target_case_type_id and type_option.organization_id=target_organization_id
    and type_option.is_active for share;
  if not found then raise exception 'invalid Case Type' using errcode='23514'; end if;

  target_staff_user_ids:=coalesce(target_staff_user_ids,'{}'::uuid[]);
  if cardinality(target_staff_user_ids)=0 then
    raise exception 'at least one assigned staff member is required'
      using errcode='23514';
  end if;
  if target_manager_user_id is not null or cardinality(target_staff_user_ids)>0 then
    if not public.has_effective_organization_permission(target_organization_id,'ASSIGN_CASES')
      then raise exception 'assignment permission required' using errcode='42501'; end if;
  end if;
  if target_manager_user_id is not null and not exists(
    select 1 from public.organization_members member
    join public.profiles profile on profile.id=member.user_id and profile.is_active
    where member.organization_id=target_organization_id and member.user_id=target_manager_user_id
      and member.is_active and member.status='ACTIVE'
      and not public.is_super_admin(member.user_id)
      and public.effective_organization_role_permission(target_organization_id,member.role,'ASSIGN_CASES')
  ) then raise exception 'invalid manager' using errcode='23514'; end if;
  if cardinality(target_staff_user_ids)<>(select count(distinct candidate) from unnest(target_staff_user_ids) candidate)
    then raise exception 'duplicate staff assignment' using errcode='23514'; end if;
  foreach staff_id in array target_staff_user_ids loop
    if not exists(
      select 1
      from public.organization_members member
      join public.profiles profile
        on profile.id=member.user_id
       and profile.is_active
      where member.organization_id=target_organization_id
        and member.user_id=staff_id
        and member.is_active
        and member.status='ACTIVE'
        and not public.is_super_admin(member.user_id)
    ) then
      raise exception 'invalid staff assignment' using errcode='23514';
    end if;
  end loop;

  if jsonb_typeof(target_answers)<>'object'
    then raise exception 'answers must be an object' using errcode='22023'; end if;
  if exists(
    select 1 from jsonb_object_keys(target_answers) answer_key
    left join public.question_definitions q
      on q.id::text=answer_key
      and q.organization_id=target_organization_id
      and q.active
    where q.id is null
  ) then raise exception 'invalid intake question' using errcode='23514'; end if;
  perform public.assert_rule_graph_acyclic(target_organization_id);

  select coalesce(array_agg(q.id order by q.display_order,q.id),'{}'::uuid[])
  into applicable_question_ids
  from public.question_definitions q
  where q.organization_id=target_organization_id and q.active
    and (q.required or not exists(
      select 1 from public.rule_actions action
      join public.rule_definitions rule
        on rule.id=action.rule_definition_id and rule.organization_id=action.organization_id
      join public.question_definitions source_question
        on source_question.id=rule.source_question_id
        and source_question.organization_id=rule.organization_id and source_question.active
      where action.organization_id=target_organization_id and rule.active
        and action.retired_at is null and action.action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
        and action.target_question_id=q.id
    ));

  loop
    previous_count:=cardinality(applicable_question_ids);
    select coalesce(array_agg(distinct candidate),'{}'::uuid[]) into expanded_question_ids
    from (
      select unnest(applicable_question_ids) candidate
      union
      select action.target_question_id
      from public.rule_actions action
      join public.rule_definitions rule
        on rule.id=action.rule_definition_id and rule.organization_id=action.organization_id
      join public.question_definitions target_question
        on target_question.id=action.target_question_id
        and target_question.organization_id=action.organization_id and target_question.active
      where action.organization_id=target_organization_id and rule.active
        and action.retired_at is null and action.action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
        and rule.source_question_id=any(applicable_question_ids)
        and public.guided_intake_rule_matches(
          target_organization_id,rule.source_question_id,rule.condition_operator,
          rule.condition_option_id,target_answers
        )
    ) expanded;
    applicable_question_ids:=expanded_question_ids;
    exit when cardinality(applicable_question_ids)=previous_count;
  end loop;

  select coalesce(array_agg(rule.id order by rule.display_order,rule.id),'{}'::uuid[])
  into effective_rule_ids from public.rule_definitions rule
  where rule.organization_id=target_organization_id and rule.active
    and rule.source_question_id=any(applicable_question_ids)
    and public.guided_intake_rule_matches(
      target_organization_id,rule.source_question_id,rule.condition_operator,
      rule.condition_option_id,target_answers
    );

  for question_row in
    select q.* from public.question_definitions q
    where q.organization_id=target_organization_id and q.id=any(applicable_question_ids)
      and q.active
    order by q.display_order,q.id
  loop
    if target_answers ? question_row.id::text
      and not public.guided_intake_response_valid(
        target_organization_id,question_row.id,question_row.response_type,
        target_answers->question_row.id::text
      ) then raise exception 'invalid intake response' using errcode='22023'; end if;
    if (
      question_row.required or exists(
        select 1 from public.rule_actions action
        where action.organization_id=target_organization_id
          and action.rule_definition_id=any(effective_rule_ids)
          and action.retired_at is null and action.action_type='REQUIRE_QUESTION'
          and action.target_question_id=question_row.id
      )
    ) and not (
      target_answers ? question_row.id::text
      and public.guided_intake_response_complete(
        target_organization_id,question_row.id,question_row.response_type,
        target_answers->question_row.id::text
      )
    ) then raise exception 'required intake response is missing' using errcode='23514'; end if;
  end loop;

  insert into public.cases(
    organization_id,customer_id,title,description,case_type,case_type_id,
    priority,status,manager_user_id,created_by_user_id,intake_submission_key
  ) values(
    target_organization_id,target_customer_id,trim(selected_type.name),
    coalesce(trim(target_description),''),trim(selected_type.name),selected_type.id,target_priority,
    case when target_manager_user_id is null and cardinality(target_staff_user_ids)=0
      then 'UNASSIGNED'::public.case_status else 'ASSIGNED'::public.case_status end,
    target_manager_user_id,actor,target_submission_key
  ) returning * into created_case;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
  values(target_organization_id,created_case.id,actor,'CASE_CREATED',
    jsonb_build_object('case_number',created_case.case_number,'status',created_case.status));

  if target_manager_user_id is not null then
    insert into public.case_assignments(organization_id,case_id,user_id,assignment_role,assigned_by_user_id)
    values(target_organization_id,created_case.id,target_manager_user_id,'MANAGER',actor);
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
    values(target_organization_id,created_case.id,actor,'CASE_ASSIGNED',
      jsonb_build_object('user_id',target_manager_user_id,'assignment_role','MANAGER'));
  end if;
  foreach staff_id in array target_staff_user_ids loop
    insert into public.case_assignments(organization_id,case_id,user_id,assignment_role,assigned_by_user_id)
    values(target_organization_id,created_case.id,staff_id,'STAFF',actor);
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
    values(target_organization_id,created_case.id,actor,'CASE_ASSIGNED',
      jsonb_build_object('user_id',staff_id,'assignment_role','STAFF'));
  end loop;

  for question_row in
    select q.* from public.question_definitions q
    where q.organization_id=target_organization_id and q.id=any(applicable_question_ids)
      and q.active order by q.display_order,q.id
  loop
    insert into public.case_questions(
      organization_id,case_id,question_definition_id,question_text,description,
      response_type,required,display_order,options_snapshot
    ) values(
      target_organization_id,created_case.id,question_row.id,question_row.question_text,
      question_row.description,question_row.response_type,
      question_row.required or exists(
        select 1 from public.rule_actions action
        where action.organization_id=target_organization_id
          and action.rule_definition_id=any(effective_rule_ids)
          and action.retired_at is null and action.action_type='REQUIRE_QUESTION'
          and action.target_question_id=question_row.id
      ),question_row.display_order,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id',option_row.id,'label',option_row.option_label,'value',option_row.option_value,
        'display_order',option_row.display_order
      ) order by option_row.display_order,option_row.id)
      from public.question_options option_row where option_row.question_id=question_row.id and option_row.is_active),'[]'::jsonb)
    ) returning id into case_question_id;
    if target_answers ? question_row.id::text then
      insert into public.case_question_responses(
        organization_id,case_id,case_question_id,response_value,responded_by_user_id
      ) values(
        target_organization_id,created_case.id,case_question_id,
        target_answers->question_row.id::text,actor
      );
      insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
      values(target_organization_id,created_case.id,actor,'QUESTION_RESPONSE_UPDATED',
        jsonb_build_object('case_question_id',case_question_id));
    end if;
  end loop;

  for action_row in
    select action.* from public.rule_actions action
    join public.rule_definitions rule
      on rule.id=action.rule_definition_id and rule.organization_id=action.organization_id
    where action.organization_id=target_organization_id
      and action.rule_definition_id=any(effective_rule_ids)
      and action.retired_at is null and action.action_type='CREATE_TASK'
      and action.task_title is not null and action.task_priority is not null
    order by rule.display_order,action.display_order,action.id
  loop
    next_sequence:=next_sequence+1;
    insert into public.case_tasks(
      organization_id,case_id,title,description,status,required,sequence,created_by_user_id,
      priority,blocking,source_rule_id,source_rule_action_id
    ) values(
      target_organization_id,created_case.id,action_row.task_title,
      coalesce(action_row.task_description,''),'NOT_STARTED',coalesce(action_row.task_required,false),
      next_sequence,actor,action_row.task_priority,coalesce(action_row.task_blocking,false),
      action_row.rule_definition_id,action_row.id
    ) returning id into task_id;
    insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
    values(target_organization_id,created_case.id,actor,'RULE_TASK_CREATED',
      jsonb_build_object('task_id',task_id,'title',action_row.task_title));
  end loop;

  delete from public.guided_case_intake_drafts
  where organization_id=target_organization_id
    and created_by_user_id=actor
    and submission_key=target_submission_key;

  return created_case;
exception when unique_violation then
  select * into created_case from public.cases
  where organization_id=target_organization_id and created_by_user_id=actor
    and intake_submission_key=target_submission_key;
  if found then
    delete from public.guided_case_intake_drafts
    where organization_id=target_organization_id
      and created_by_user_id=actor
      and submission_key=target_submission_key;
    return created_case;
  end if;
  raise;
end $$;

revoke all on function private.create_guided_case_intake(uuid,uuid,uuid,text,uuid,public.priority_level,uuid,uuid[],jsonb)
  from public,anon,authenticated;

create or replace function public.create_guided_case_intake(
  target_organization_id uuid,target_submission_key uuid,target_customer_id uuid,target_customer_mode text,target_description text,target_case_type_id uuid,target_priority public.priority_level,target_tax_year integer,
  target_manager_user_id uuid default null,target_staff_user_ids uuid[] default '{}'::uuid[],
  target_answers jsonb default '{}'::jsonb,target_follow_up_tasks jsonb default '[]'::jsonb
) returns public.cases language plpgsql security definer set search_path='' as $$
declare
  semantic_type public.organization_case_types;
  current_tax_year integer;
  created public.cases;
  follow_up jsonb;
  question_row public.question_definitions;
  task_id uuid;
  next_sequence integer;
  completed boolean;
begin
  if target_customer_mode not in ('existing','new') then
    raise exception 'invalid Customer mode' using errcode='23514';
  end if;

  select * into semantic_type
  from public.organization_case_types type_option
  where type_option.id=target_case_type_id
    and type_option.organization_id=target_organization_id
    and type_option.is_active
  for share;

  if not found then
    raise exception 'invalid Case Type' using errcode='23514';
  end if;

  if semantic_type.customer_mode<>'ANY'
     and semantic_type.customer_mode<>(
       case
         when target_customer_mode='new' then 'NEW'
         else 'EXISTING'
       end
     ) then
    raise exception 'Case Type is not valid for the selected Customer mode'
      using errcode='23514';
  end if;

  select extract(
    year from now() at time zone coalesce(settings.timezone,'UTC')
  )::integer
  into current_tax_year
  from public.organization_settings settings
  where settings.organization_id=target_organization_id;

  current_tax_year:=coalesce(
    current_tax_year,
    extract(year from now() at time zone 'UTC')::integer
  );

  if semantic_type.tax_year_rule='CURRENT_YEAR'
     and target_tax_year<>current_tax_year then
    raise exception 'Case Type requires the current Tax Year'
      using errcode='23514';
  end if;

  if semantic_type.tax_year_rule='PRIOR_YEAR_REQUIRED'
     and target_tax_year>=current_tax_year then
    raise exception 'Case Type requires a prior Tax Year'
      using errcode='23514';
  end if;

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
    target_organization_id,target_submission_key,target_customer_id,target_description,target_case_type_id,target_priority,target_manager_user_id,
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

revoke all on function public.create_guided_case_intake(uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,uuid,uuid[],jsonb,jsonb)
  from public,anon;

grant execute on function public.create_guided_case_intake(uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,uuid,uuid[],jsonb,jsonb)
  to authenticated;

do $$
begin
  if exists(
    select 1
    from public.guided_case_intake_drafts
    where customer_id is not null
      and tax_year is not null
    group by
      organization_id,
      created_by_user_id,
      customer_id,
      tax_year
    having count(*)>1
  ) then
    raise exception
      'Duplicate Guided Intake drafts exist for the same creator, Customer, and Tax Year. Resolve them before applying this migration.'
      using errcode='23505';
  end if;
end
$$;

create unique index if not exists
  guided_case_intake_drafts_one_customer_year_per_creator
on public.guided_case_intake_drafts(
  organization_id,
  created_by_user_id,
  customer_id,
  tax_year
)
where customer_id is not null
  and tax_year is not null;

comment on index
  public.guided_case_intake_drafts_one_customer_year_per_creator
is
  'One active Guided Intake draft per organization, creator, Customer, and Tax Year.';
