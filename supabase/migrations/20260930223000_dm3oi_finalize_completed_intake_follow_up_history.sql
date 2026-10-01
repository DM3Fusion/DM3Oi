begin;

-- Preserve completed Guided Intake document follow-up Tasks as historical
-- workflow evidence after their requirement is satisfied. Only completed
-- Tasks may have an empty current missing-option list; open Tasks must still
-- identify one or more current missing requirements.

create or replace function public.finalize_guided_case_intake(
  target_organization_id uuid,
  target_submission_key uuid,
  target_customer_id uuid,
  target_customer_mode text,
  target_description text,
  target_case_type_id uuid,
  target_priority public.priority_level,
  target_tax_year integer,
  target_manager_user_id uuid,
  target_staff_user_ids uuid[],
  target_answers jsonb,
  target_follow_up_tasks jsonb,
  target_portal_onboarding jsonb
)
returns public.cases
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  draft_row public.guided_case_intake_drafts;
  item public.cases;
  semantic_type public.organization_case_types;
  question_row public.question_definitions;
  action_row public.rule_actions;
  follow_up jsonb;
  case_question_id uuid;
  task_id uuid;
  next_sequence integer:=0;
  completed boolean;
  applicable_question_ids uuid[]:='{}'::uuid[];
  expanded_question_ids uuid[]:='{}'::uuid[];
  effective_rule_ids uuid[]:='{}'::uuid[];
  previous_count integer:=-1;
  current_tax_year integer;
  staff_id uuid;
  onboarding_mode text;
  customer_email text;
  submitted_resolution text;
  submitted_customer_id uuid;
  submitted_invitation_id uuid;
  portal_resolved boolean:=false;
begin
  if actor is null
    or target_submission_key is null
    or not public.has_effective_organization_permission(
      target_organization_id,'WORK_CASES'
    )
    or not public.has_effective_organization_permission(
      target_organization_id,'VIEW_CUSTOMERS'
    )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.organizations organization
    join public.customers customer
      on customer.organization_id=organization.id
      and customer.id=target_customer_id
      and customer.status='ACTIVE'
    where organization.id=target_organization_id
      and organization.status='ACTIVE'
  ) then
    raise exception 'invalid customer' using errcode='23514';
  end if;

  select * into draft_row
  from public.guided_case_intake_drafts draft
  where draft.organization_id=target_organization_id
    and draft.submission_key=target_submission_key
  for update;

  if not found or draft_row.case_id is null then
    raise exception 'Guided Intake Case has not been materialized'
      using errcode='23514';
  end if;

  select * into item
  from public.cases existing
  where existing.organization_id=target_organization_id
    and existing.id=draft_row.case_id
  for update;

  if not found
    or not public.can_access_case(
      item.id,
      target_organization_id,
      actor
    )
    or item.intake_submission_key is distinct from target_submission_key
    or item.customer_id<>target_customer_id
    or item.tax_year is distinct from target_tax_year
    or item.case_type_id is distinct from target_case_type_id
    or draft_row.customer_id is distinct from target_customer_id
    or draft_row.tax_year is distinct from target_tax_year
    or draft_row.case_type_id is distinct from target_case_type_id
  then
    raise exception 'Guided Intake Case identity does not match'
      using errcode='23514';
  end if;

  if draft_row.finalized_at is not null then
    return item;
  end if;

  if item.status not in ('IN_PROGRESS','WAITING') then
    raise exception 'Guided Intake Case is no longer active'
      using errcode='23514';
  end if;

  if target_customer_mode<>draft_row.customer_mode then
    raise exception 'Guided Intake Customer mode does not match'
      using errcode='23514';
  end if;

  select * into semantic_type
  from public.organization_case_types type_option
  where type_option.organization_id=target_organization_id
    and type_option.id=target_case_type_id
    and type_option.is_active
  for share;
  if not found then
    raise exception 'invalid Case Type' using errcode='23514';
  end if;
  if semantic_type.customer_mode<>'ANY'
    and semantic_type.customer_mode<>(
      case when target_customer_mode='new' then 'NEW' else 'EXISTING' end
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
  if target_tax_year is null or target_tax_year not between 1900 and 2200 then
    raise exception 'valid Case tax year is required' using errcode='23514';
  end if;
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

  target_staff_user_ids:=coalesce(target_staff_user_ids,'{}'::uuid[]);
  if cardinality(target_staff_user_ids)=0 then
    raise exception 'at least one assigned staff member is required'
      using errcode='23514';
  end if;
  if cardinality(target_staff_user_ids)<>(
    select count(distinct candidate)
    from unnest(target_staff_user_ids) candidate
  ) then
    raise exception 'duplicate staff assignment' using errcode='23514';
  end if;
  if target_manager_user_id is not null and not exists(
    select 1
    from public.organization_members member
    join public.profiles profile
      on profile.id=member.user_id and profile.is_active
    where member.organization_id=target_organization_id
      and member.user_id=target_manager_user_id
      and member.is_active
      and member.status='ACTIVE'
      and not public.is_super_admin(member.user_id)
      and public.effective_organization_role_permission(
        target_organization_id,member.role,'ASSIGN_CASES'
      )
  ) then
    raise exception 'invalid manager' using errcode='23514';
  end if;
  foreach staff_id in array target_staff_user_ids loop
    if not exists(
      select 1
      from public.organization_members member
      join public.profiles profile
        on profile.id=member.user_id and profile.is_active
      where member.organization_id=target_organization_id
        and member.user_id=staff_id
        and member.is_active
        and member.status='ACTIVE'
        and not public.is_super_admin(member.user_id)
    ) then
      raise exception 'invalid staff assignment' using errcode='23514';
    end if;
  end loop;
  if target_manager_user_id is distinct from item.manager_user_id
    or (
      target_manager_user_id is not null and not exists(
        select 1 from public.case_assignments assignment
        where assignment.organization_id=target_organization_id
          and assignment.case_id=item.id
          and assignment.user_id=target_manager_user_id
          and assignment.assignment_role='MANAGER'
          and assignment.is_active
      )
    )
    or (
      target_manager_user_id is null and exists(
        select 1 from public.case_assignments assignment
        where assignment.organization_id=target_organization_id
          and assignment.case_id=item.id
          and assignment.assignment_role='MANAGER'
          and assignment.is_active
      )
    )
    or exists(
      select 1 from unnest(target_staff_user_ids) requested(user_id)
      where not exists(
        select 1 from public.case_assignments assignment
        where assignment.organization_id=target_organization_id
          and assignment.case_id=item.id
          and assignment.user_id=requested.user_id
          and assignment.assignment_role='STAFF'
          and assignment.is_active
      )
    )
    or exists(
      select 1 from public.case_assignments assignment
      where assignment.organization_id=target_organization_id
        and assignment.case_id=item.id
        and assignment.assignment_role='STAFF'
        and assignment.is_active
        and not assignment.user_id=any(target_staff_user_ids)
    )
  then
    raise exception 'Case assignment changed after intake materialization'
      using errcode='23514';
  end if;

  if jsonb_typeof(target_answers)<>'object' then
    raise exception 'answers must be an object' using errcode='22023';
  end if;
  if exists(
    select 1
    from jsonb_object_keys(target_answers) answer_key
    left join public.question_definitions question
      on question.id::text=answer_key
      and question.organization_id=target_organization_id
      and question.active
    where question.id is null
  ) then
    raise exception 'invalid intake question' using errcode='23514';
  end if;

  perform public.assert_rule_graph_acyclic(target_organization_id);

  select coalesce(
    array_agg(question.id order by question.display_order,question.id),
    '{}'::uuid[]
  ) into applicable_question_ids
  from public.question_definitions question
  where question.organization_id=target_organization_id
    and question.active
    and (question.required or not exists(
      select 1
      from public.rule_actions action
      join public.rule_definitions rule
        on rule.id=action.rule_definition_id
        and rule.organization_id=action.organization_id
      join public.question_definitions source_question
        on source_question.id=rule.source_question_id
        and source_question.organization_id=rule.organization_id
        and source_question.active
      where action.organization_id=target_organization_id
        and rule.active
        and action.retired_at is null
        and action.action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
        and action.target_question_id=question.id
    ));

  loop
    previous_count:=cardinality(applicable_question_ids);
    select coalesce(
      array_agg(distinct candidate.id),'{}'::uuid[]
    ) into expanded_question_ids
    from (
      select unnest(applicable_question_ids) id
      union
      select action.target_question_id
      from public.rule_actions action
      join public.rule_definitions rule
        on rule.id=action.rule_definition_id
        and rule.organization_id=action.organization_id
      join public.question_definitions target_question
        on target_question.id=action.target_question_id
        and target_question.organization_id=action.organization_id
        and target_question.active
      where rule.organization_id=target_organization_id
        and rule.active
        and rule.source_question_id=any(applicable_question_ids)
        and action.retired_at is null
        and action.action_type in ('SHOW_QUESTION','REQUIRE_QUESTION')
        and action.target_question_id is not null
        and public.guided_intake_rule_matches(
          target_organization_id,rule.source_question_id,
          rule.condition_operator,rule.condition_option_id,target_answers
        )
    ) candidate;
    applicable_question_ids:=expanded_question_ids;
    exit when cardinality(applicable_question_ids)=previous_count;
  end loop;

  select coalesce(
    array_agg(rule.id order by rule.display_order,rule.id),'{}'::uuid[]
  ) into effective_rule_ids
  from public.rule_definitions rule
  where rule.organization_id=target_organization_id
    and rule.active
    and rule.source_question_id=any(applicable_question_ids)
    and public.guided_intake_rule_matches(
      target_organization_id,rule.source_question_id,
      rule.condition_operator,rule.condition_option_id,target_answers
    );

  for question_row in
    select question.*
    from public.question_definitions question
    where question.organization_id=target_organization_id
      and question.id=any(applicable_question_ids)
      and question.active
    order by question.display_order,question.id
  loop
    if target_answers ? question_row.id::text
      and not public.guided_intake_response_valid(
        target_organization_id,question_row.id,question_row.response_type,
        target_answers->question_row.id::text
      ) then
      raise exception 'invalid intake response' using errcode='22023';
    end if;
    if (
      question_row.required or exists(
        select 1 from public.rule_actions action
        where action.organization_id=target_organization_id
          and action.rule_definition_id=any(effective_rule_ids)
          and action.retired_at is null
          and action.action_type='REQUIRE_QUESTION'
          and action.target_question_id=question_row.id
      )
    ) and not (
      target_answers ? question_row.id::text
      and public.guided_intake_response_complete(
        target_organization_id,question_row.id,question_row.response_type,
        target_answers->question_row.id::text
      )
    ) then
      raise exception 'required intake response is missing'
        using errcode='23514';
    end if;
  end loop;

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
      or jsonb_typeof(follow_up->'missingOptionLabels')<>'array'
      or (
        not coalesce((follow_up->>'completed')::boolean,false)
        and jsonb_array_length(follow_up->'missingOptionIds')=0
      )
    then
      raise exception 'invalid follow-up Task' using errcode='23514';
    end if;

    select * into question_row
    from public.question_definitions question
    where question.organization_id=target_organization_id
      and question.id=nullif(follow_up->>'questionId','')::uuid
      and question.response_type='MULTI_SELECT'
      and question.require_all_options;
    if not found then
      raise exception 'invalid follow-up intake requirement'
        using errcode='23514';
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
      raise exception 'invalid missing requirement option'
        using errcode='23514';
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
      raise exception 'invalid follow-up Task assignee'
        using errcode='23514';
    end if;

    completed:=coalesce((follow_up->>'completed')::boolean,false);

    -- Completed missing-document Tasks remain historical workflow evidence.
    -- Once the linked requirement is satisfied, they may legitimately have no
    -- current missing-option context. Open Tasks still require missing items.
    if completed and not(
      target_answers ? question_row.id::text
      and public.guided_intake_response_complete(
        target_organization_id,question_row.id,question_row.response_type,
        target_answers->question_row.id::text
      )
    ) then
      raise exception 'missing documents prevent follow-up Task completion'
        using errcode='23514';
    end if;
  end loop;

  if jsonb_typeof(target_portal_onboarding)<>'object' then
    raise exception 'Customer Portal onboarding state must be an object'
      using errcode='22023';
  end if;

  select coalesce(settings.portal_onboarding_mode,'MANUAL_ONLY')
    into onboarding_mode
  from public.organizations organization
  left join public.organization_settings settings
    on settings.organization_id=organization.id
  where organization.id=target_organization_id
    and organization.status='ACTIVE';

  if not found then
    raise exception 'organization is inactive' using errcode='42501';
  end if;

  if onboarding_mode='PROMPT_DURING_CASE_INTAKE' then
    select lower(trim(customer.email)) into customer_email
    from public.customers customer
    where customer.organization_id=target_organization_id
      and customer.id=target_customer_id
      and customer.status='ACTIVE';

    submitted_resolution:=coalesce(target_portal_onboarding->>'resolution','');
    begin
      submitted_customer_id:=nullif(target_portal_onboarding->>'customerId','')::uuid;
      submitted_invitation_id:=nullif(target_portal_onboarding->>'invitationId','')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid Customer portal onboarding'
        using errcode='23514';
    end;

    select exists(
      select 1
      from public.customer_portal_users link
      join public.profiles profile
        on profile.id=link.user_id and profile.is_active
      join auth.users auth_user on auth_user.id=link.user_id
      join public.organizations organization
        on organization.id=link.organization_id
        and organization.status='ACTIVE'
      join public.organization_settings settings
        on settings.organization_id=link.organization_id
        and settings.portal_enabled
      where link.organization_id=target_organization_id
        and link.customer_id=target_customer_id
        and link.is_active
        and (
          auth_user.email_confirmed_at is not null
          or auth_user.last_sign_in_at is not null
        )
    ) into portal_resolved;

    if not portal_resolved
      and submitted_resolution='INVITATION_SENT'
      and submitted_customer_id=target_customer_id
      and submitted_invitation_id is not null
      and customer_email is not null
    then
      select exists(
        select 1
        from public.customer_portal_invitations invitation
        join public.customer_portal_users link
          on link.organization_id=invitation.organization_id
          and link.customer_id=invitation.customer_id
          and link.user_id=invitation.user_id
          and link.is_active
        join public.profiles profile
          on profile.id=link.user_id and profile.is_active
        join auth.users auth_user on auth_user.id=link.user_id
        join public.organizations organization
          on organization.id=invitation.organization_id
          and organization.status='ACTIVE'
        join public.organization_settings settings
          on settings.organization_id=invitation.organization_id
          and settings.portal_enabled
        where invitation.id=submitted_invitation_id
          and invitation.organization_id=target_organization_id
          and invitation.customer_id=target_customer_id
          and invitation.status in ('SENT','ACTIVATED')
          and invitation.send_count>0
          and invitation.last_sent_at is not null
          and invitation.recipient_email=customer_email
          and lower(coalesce(auth_user.email,''))=customer_email
      ) into portal_resolved;
    end if;

    if not portal_resolved
      and submitted_resolution='NOT_REQUIRED'
      and submitted_customer_id=target_customer_id
      and submitted_invitation_id is null
    then
      portal_resolved:=true;
    end if;

    if not portal_resolved then
      raise exception 'Customer Portal onboarding is unresolved'
        using errcode='23514';
    end if;
  end if;

  update public.cases
  set description=coalesce(trim(target_description),''),
      priority=target_priority
  where id=item.id
  returning * into item;

  for question_row in
    select question.*
    from public.question_definitions question
    where question.organization_id=target_organization_id
      and question.id=any(applicable_question_ids)
      and question.active
    order by question.display_order,question.id
  loop
    insert into public.case_questions(
      organization_id,case_id,question_definition_id,question_text,
      description,response_type,required,display_order,options_snapshot
    ) values(
      target_organization_id,item.id,question_row.id,
      question_row.question_text,question_row.description,
      question_row.response_type,
      question_row.required or exists(
        select 1 from public.rule_actions action
        where action.organization_id=target_organization_id
          and action.rule_definition_id=any(effective_rule_ids)
          and action.retired_at is null
          and action.action_type='REQUIRE_QUESTION'
          and action.target_question_id=question_row.id
      ),
      question_row.display_order,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',option_row.id,
          'label',option_row.option_label,
          'value',option_row.option_value,
          'display_order',option_row.display_order
        ) order by option_row.display_order,option_row.id)
        from public.question_options option_row
        where option_row.question_id=question_row.id
          and option_row.is_active
      ),'[]'::jsonb)
    )
    on conflict(case_id,question_definition_id) do nothing;

    select question.id into case_question_id
    from public.case_questions question
    where question.case_id=item.id
      and question.question_definition_id=question_row.id;

    if target_answers ? question_row.id::text then
      insert into public.case_question_responses(
        organization_id,case_id,case_question_id,response_value,
        responded_by_user_id
      ) values(
        target_organization_id,item.id,case_question_id,
        target_answers->question_row.id::text,actor
      )
      on conflict(case_question_id) do update
      set response_value=excluded.response_value,
          responded_by_user_id=actor;

      insert into public.case_activity(
        organization_id,case_id,actor_user_id,event_type,event_data
      ) values(
        target_organization_id,item.id,actor,'QUESTION_RESPONSE_UPDATED',
        jsonb_build_object('case_question_id',case_question_id)
      );
    end if;
  end loop;

  for action_row in
    select action.*
    from public.rule_actions action
    join public.rule_definitions rule
      on rule.id=action.rule_definition_id
      and rule.organization_id=action.organization_id
    where action.organization_id=target_organization_id
      and action.rule_definition_id=any(effective_rule_ids)
      and action.retired_at is null
      and action.action_type='CREATE_TASK'
      and action.task_title is not null
      and action.task_priority is not null
    order by rule.display_order,action.display_order,action.id
  loop
    select coalesce(max(sequence),0)+1 into next_sequence
    from public.case_tasks where case_id=item.id;

    insert into public.case_tasks(
      organization_id,case_id,title,description,status,required,due_at,
      sequence,created_by_user_id,priority,blocking,source_rule_id,
      source_rule_action_id
    ) values(
      target_organization_id,item.id,action_row.task_title,
      coalesce(action_row.task_description,''),'NOT_STARTED',
      coalesce(action_row.task_required,false),
      public.organization_task_due_at(
        target_organization_id,action_row.task_due_in_days
      ),
      next_sequence,actor,action_row.task_priority,
      coalesce(action_row.task_blocking,false),
      action_row.rule_definition_id,action_row.id
    )
    on conflict(organization_id,case_id,source_rule_action_id)
      where source_rule_action_id is not null
      do nothing
    returning id into task_id;

    if task_id is not null then
      insert into public.case_activity(
        organization_id,case_id,actor_user_id,event_type,event_data
      ) values(
        target_organization_id,item.id,actor,'RULE_TASK_CREATED',
        jsonb_build_object('task_id',task_id,'title',action_row.task_title)
      );
    end if;
    task_id:=null;
  end loop;

  for follow_up in select value from jsonb_array_elements(target_follow_up_tasks) loop
    select coalesce(max(sequence),0)+1 into next_sequence
    from public.case_tasks where case_id=item.id;
    completed:=coalesce((follow_up->>'completed')::boolean,false);

    insert into public.case_tasks(
      organization_id,case_id,title,description,assigned_user_id,status,
      required,due_at,sequence,created_by_user_id,priority,blocking,
      intake_follow_up_id,intake_question_definition_id,
      intake_requirement_context
    ) values(
      target_organization_id,item.id,trim(follow_up->>'title'),
      coalesce(follow_up->>'description',''),
      (follow_up->>'assignedUserId')::uuid,
      case when completed then 'COMPLETED'::public.case_task_status
        else 'NOT_STARTED'::public.case_task_status end,
      true,
      public.organization_end_of_date(
        target_organization_id,(follow_up->>'dueDate')::date
      ),
      next_sequence,actor,'NORMAL',true,(follow_up->>'id')::uuid,
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
        target_organization_id,item.id,actor,'TASK_CREATED',
        jsonb_build_object(
          'task_id',task_id,'title',follow_up->>'title',
          'source','GUIDED_INTAKE'
        )
      );
    end if;
    task_id:=null;
  end loop;

  update public.guided_case_intake_drafts
  set answers=target_answers,
      follow_up_tasks=target_follow_up_tasks,
      portal_onboarding=target_portal_onboarding,
      current_step=5,
      finalized_at=now()
  where id=draft_row.id;

  -- Milestone 2 deliberately leaves the operational lifecycle unchanged.
  if item.status not in ('IN_PROGRESS','WAITING') then
    raise exception 'Guided Intake finalization cannot change Case lifecycle'
      using errcode='23514';
  end if;

  return item;
end
$$;

alter function public.finalize_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb
) owner to postgres;

revoke all on function public.finalize_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb
) from public,anon,authenticated;

grant execute on function public.finalize_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb
) to authenticated;

comment on function public.finalize_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,
  uuid,uuid[],jsonb,jsonb,jsonb
) is
  'Idempotent Guided Intake finalization. Completed document follow-up Tasks remain historical workflow evidence after their requirement is satisfied.';

commit;
