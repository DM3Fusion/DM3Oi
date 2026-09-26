alter table public.question_options
  add column if not exists is_active boolean not null default true;

create index if not exists question_options_active_order_idx
  on public.question_options(organization_id,question_id,is_active,display_order);

create or replace function public.save_question_definition(
  target_organization_id uuid,
  target_question_id uuid,
  target_question_text text,
  target_description text,
  target_response_type public.question_response_type,
  target_required boolean,
  target_active boolean,
  target_display_order integer,
  target_options jsonb default '[]'
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
begin
  if not public.has_effective_organization_permission(
    target_organization_id,
    'MANAGE_QUESTIONS'
  ) then
    raise exception 'not authorized' using errcode='42501';
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

  if target_question_id is null then
    insert into public.question_definitions(
      organization_id,
      question_text,
      description,
      response_type,
      required,
      active,
      display_order,
      created_by_user_id
    )
    values(
      target_organization_id,
      trim(target_question_text),
      coalesce(target_description,''),
      target_response_type,
      target_required,
      target_active,
      target_display_order,
      actor
    )
    returning * into item;
  else
    update public.question_definitions
    set
      question_text=trim(target_question_text),
      description=coalesce(target_description,''),
      response_type=target_response_type,
      required=target_required,
      active=target_active,
      display_order=target_display_order
    where id=target_question_id
      and organization_id=target_organization_id
    returning * into item;

    if not found then
      raise exception 'question not found' using errcode='P0002';
    end if;
  end if;

  for opt in
    select value from jsonb_array_elements(target_options)
  loop
    if length(trim(coalesce(opt->>'label','')))=0 then
      raise exception 'question option label is required'
        using errcode='23514';
    end if;

    option_id:=nullif(opt->>'id','')::uuid;

    if option_id is not null then
      update public.question_options
      set
        option_label=trim(opt->>'label'),
        display_order=coalesce((opt->>'display_order')::integer,0),
        is_active=coalesce((opt->>'is_active')::boolean,true)
      where id=option_id
        and organization_id=target_organization_id
        and question_id=item.id;

      if not found then
        raise exception 'invalid question option'
          using errcode='23514';
      end if;
    else
      insert into public.question_options(
        organization_id,
        question_id,
        option_label,
        option_value,
        display_order,
        is_active
      )
      values(
        target_organization_id,
        item.id,
        trim(opt->>'label'),
        trim(opt->>'value'),
        coalesce((opt->>'display_order')::integer,0),
        coalesce((opt->>'is_active')::boolean,true)
      )
      returning id into option_id;
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

create or replace function public.guided_intake_response_valid(
  target_organization_id uuid,
  target_question_id uuid,
  target_response_type public.question_response_type,
  target_value jsonb
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case target_response_type
    when 'YES_NO' then jsonb_typeof(target_value)='boolean'
    when 'NUMBER' then jsonb_typeof(target_value)='number'
    when 'DATE' then jsonb_typeof(target_value)='string'
      and (target_value#>>'{}')~'^\d{4}-\d{2}-\d{2}$'
      and to_char((target_value#>>'{}')::date,'YYYY-MM-DD')=target_value#>>'{}'
    when 'TEXT' then jsonb_typeof(target_value)='string'
      and length(trim(target_value#>>'{}'))>0
    when 'LONG_TEXT' then jsonb_typeof(target_value)='string'
      and length(trim(target_value#>>'{}'))>0
    when 'SINGLE_SELECT' then
      jsonb_typeof(target_value)='string'
      and exists(
        select 1
        from public.question_options option_row
        where option_row.organization_id=target_organization_id
          and option_row.question_id=target_question_id
          and option_row.id::text=target_value#>>'{}'
          and option_row.is_active
      )
    when 'MULTI_SELECT' then
      jsonb_typeof(target_value)='array'
      and jsonb_array_length(target_value)>0
      and not exists(
        select 1
        from jsonb_array_elements_text(target_value) selected(value)
        where not exists(
          select 1
          from public.question_options option_row
          where option_row.organization_id=target_organization_id
            and option_row.question_id=target_question_id
            and option_row.id::text=selected.value
            and option_row.is_active
        )
      )
    else false
  end
$$;


create or replace function public.snapshot_case_questions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.intake_submission_key is not null then return new; end if;
  insert into public.case_questions(
    organization_id,case_id,question_definition_id,question_text,description,
    response_type,required,display_order,options_snapshot
  )
  select q.organization_id,new.id,q.id,q.question_text,q.description,q.response_type,
    q.required,q.display_order,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'label',o.option_label,'value',o.option_value,'display_order',o.display_order
      ) order by o.display_order,o.id)
      from public.question_options o where o.question_id=q.id and o.is_active
    ),'[]'::jsonb)
  from public.question_definitions q
  where q.organization_id=new.organization_id and q.active
  order by q.display_order,q.id;
  return new;
end $$;

create or replace function public.create_guided_case_intake(
  target_organization_id uuid,
  target_submission_key uuid,
  target_customer_id uuid,
  target_case_title_id uuid,
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
  selected_title public.organization_case_titles;
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
  select * into selected_title from public.organization_case_titles title_option
  where title_option.id=target_case_title_id and title_option.organization_id=target_organization_id
    and title_option.is_active for share;
  if not found then raise exception 'invalid Case Title' using errcode='23514'; end if;
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
      and public.guided_intake_response_valid(
        target_organization_id,question_row.id,question_row.response_type,
        target_answers->question_row.id::text
      )
    ) then raise exception 'required intake response is missing' using errcode='23514'; end if;
  end loop;

  insert into public.cases(
    organization_id,customer_id,title,case_title_id,description,case_type,case_type_id,
    priority,status,manager_user_id,created_by_user_id,intake_submission_key
  ) values(
    target_organization_id,target_customer_id,trim(selected_title.label),selected_title.id,
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
