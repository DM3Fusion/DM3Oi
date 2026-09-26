-- Guided Case Intake: stable reporting dimensions and one atomic creation path.

create table public.organization_case_titles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 180),
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order>=0),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  updated_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id)
);

create unique index organization_case_titles_active_label_uidx
  on public.organization_case_titles(organization_id,lower(trim(label)))
  where is_active;
create index organization_case_titles_active_order_idx
  on public.organization_case_titles(organization_id,is_active,sort_order,label);
create function public.stamp_case_title_configuration()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not public.has_effective_organization_permission(new.organization_id,'MANAGE_ORGANIZATION_SETTINGS')
    then raise exception 'not authorized' using errcode='42501'; end if;
  new.label:=trim(new.label);
  if tg_op='UPDATE' then
    if new.organization_id<>old.organization_id
      then raise exception 'Case Title organization cannot change' using errcode='23514'; end if;
    new.created_by_user_id:=old.created_by_user_id;
  else new.created_by_user_id:=actor; end if;
  new.updated_by_user_id:=actor;
  return new;
end $$;
create trigger organization_case_titles_stamp_actor before insert or update
  on public.organization_case_titles for each row execute function public.stamp_case_title_configuration();
create trigger organization_case_titles_updated_at before update
  on public.organization_case_titles for each row execute function public.set_updated_at();

revoke all on function public.stamp_case_title_configuration() from public,anon,authenticated;

alter table public.organization_case_titles enable row level security;
create policy organization_case_titles_intake_read
  on public.organization_case_titles for select to authenticated
  using (
    public.has_effective_organization_permission(organization_id,'CREATE_CASE')
    or public.has_effective_organization_permission(organization_id,'VIEW_ADMINISTRATION')
  );
create policy organization_case_titles_admin_insert
  on public.organization_case_titles for insert to authenticated
  with check (public.has_effective_organization_permission(organization_id,'MANAGE_ORGANIZATION_SETTINGS'));
create policy organization_case_titles_admin_update
  on public.organization_case_titles for update to authenticated
  using (public.has_effective_organization_permission(organization_id,'MANAGE_ORGANIZATION_SETTINGS'))
  with check (public.has_effective_organization_permission(organization_id,'MANAGE_ORGANIZATION_SETTINGS'));
grant select,insert,update on public.organization_case_titles to authenticated;

-- Case Types already have stable UUIDs. Make their compound tenant identity
-- referenceable and allow Case creators to read active choices without gaining
-- configuration mutation authority.
alter table public.organization_case_types
  add constraint organization_case_types_organization_id_id_key unique(organization_id,id);

do $$
begin
  if exists(
    select 1
    from public.organization_case_types
    where is_active
    group by organization_id,lower(trim(name))
    having count(*)>1
  ) then
    raise exception
      'Duplicate active Case Type names must be resolved before Guided Case Intake migration'
      using errcode='23505';
  end if;
end $$;

create unique index organization_case_types_active_name_ci_uidx
  on public.organization_case_types(organization_id,lower(trim(name)))
  where is_active;
create policy organization_case_types_intake_read
  on public.organization_case_types for select to authenticated
  using (public.has_effective_organization_permission(organization_id,'CREATE_CASE'));

alter table public.cases
  add column case_title_id uuid,
  add column case_type_id uuid,
  add column intake_submission_key uuid;
alter table public.cases
  add constraint cases_case_title_identity_fkey
    foreign key(organization_id,case_title_id)
    references public.organization_case_titles(organization_id,id) on delete restrict,
  add constraint cases_case_type_identity_fkey
    foreign key(organization_id,case_type_id)
    references public.organization_case_types(organization_id,id) on delete restrict;
create unique index cases_guided_intake_submission_uidx
  on public.cases(organization_id,created_by_user_id,intake_submission_key)
  where intake_submission_key is not null;
create index cases_case_title_reporting_idx on public.cases(organization_id,case_title_id);
create index cases_case_type_reporting_idx on public.cases(organization_id,case_type_id);

create or replace view public.organization_cases with (security_barrier=true) as
select c.id,c.organization_id,c.case_number,c.customer_id,c.title,c.description,c.case_type,c.priority,c.status,
  c.due_at,c.opened_at,c.completed_at,c.closed_at,c.manager_user_id,
  public.organization_actor_id(c.created_by_user_id) as created_by_user_id,
  public.organization_actor_label(c.created_by_user_id) as created_by_display_name,
  c.created_at,c.updated_at,c.case_title_id,c.case_type_id
from public.cases c
where public.can_access_case(c.id,c.organization_id,auth.uid());

-- Safely associate legacy Cases where the historical text has one unambiguous
-- configured Case Type match. Unmatched legacy rows remain valid with a null ID.
update public.cases existing
set case_type_id=(
  select configured.id
  from public.organization_case_types configured
  where configured.organization_id=existing.organization_id
    and lower(trim(configured.name))=lower(trim(existing.case_type))
  order by configured.created_at,configured.id
  limit 1
)
where existing.case_type_id is null
  and (
    select count(*)
    from public.organization_case_types configured
    where configured.organization_id=existing.organization_id
      and lower(trim(configured.name))=lower(trim(existing.case_type))
  )=1;

-- Preserve legacy creation behavior, but Guided Intake explicitly owns its
-- applicable snapshot inside the transaction below.
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
      from public.question_options o where o.question_id=q.id
    ),'[]'::jsonb)
  from public.question_definitions q
  where q.organization_id=new.organization_id and q.active
  order by q.display_order,q.id;
  return new;
end $$;

create function public.guided_intake_response_valid(
  target_organization_id uuid,
  target_question_id uuid,
  target_response_type public.question_response_type,
  target_value jsonb
) returns boolean language sql stable security definer set search_path='' as $$
  select case target_response_type
    when 'YES_NO' then jsonb_typeof(target_value)='boolean'
    when 'NUMBER' then jsonb_typeof(target_value)='number'
    when 'DATE' then jsonb_typeof(target_value)='string'
      and (target_value#>>'{}')~'^\d{4}-\d{2}-\d{2}$'
      and to_char((target_value#>>'{}')::date,'YYYY-MM-DD')=target_value#>>'{}'
    when 'TEXT' then jsonb_typeof(target_value)='string' and length(trim(target_value#>>'{}'))>0
    when 'LONG_TEXT' then jsonb_typeof(target_value)='string' and length(trim(target_value#>>'{}'))>0
    when 'SINGLE_SELECT' then jsonb_typeof(target_value)='string' and exists(
      select 1 from public.question_options option_row
      where option_row.organization_id=target_organization_id
        and option_row.question_id=target_question_id
        and option_row.id::text=target_value#>>'{}'
    )
    when 'MULTI_SELECT' then jsonb_typeof(target_value)='array'
      and jsonb_array_length(target_value)>0
      and not exists(
        select 1 from jsonb_array_elements_text(target_value) selected(value)
        where not exists(
          select 1 from public.question_options option_row
          where option_row.organization_id=target_organization_id
            and option_row.question_id=target_question_id
            and option_row.id::text=selected.value
        )
      )
    else false
  end
$$;

create function public.guided_intake_rule_matches(
  target_organization_id uuid,
  source_question_id uuid,
  condition_operator public.rule_condition_operator,
  condition_option_id uuid,
  target_answers jsonb
) returns boolean language plpgsql stable security definer set search_path='' as $$
declare
  source_type public.question_response_type;
  answer jsonb:=target_answers->source_question_id::text;
  answered boolean:=false;
begin
  select q.response_type into source_type from public.question_definitions q
  where q.organization_id=target_organization_id and q.id=source_question_id and q.active;
  if source_type is null then return false; end if;
  answered:=target_answers ? source_question_id::text
    and public.guided_intake_response_valid(target_organization_id,source_question_id,source_type,answer);
  if condition_operator='IS_ANSWERED' then return answered; end if;
  if condition_operator='IS_NOT_ANSWERED' then return not answered; end if;
  if not answered then return false; end if;
  if condition_operator='IS_YES' then return answer='true'::jsonb; end if;
  if condition_operator='IS_NO' then return answer='false'::jsonb; end if;
  if condition_operator='EQUALS' then return answer#>>'{}'=condition_option_id::text; end if;
  if condition_operator='NOT_EQUALS' then return answer#>>'{}'<>condition_option_id::text; end if;
  if condition_operator='CONTAINS' then
    return answer ? condition_option_id::text;
  end if;
  if condition_operator='NOT_CONTAINS' then
    return not(answer ? condition_option_id::text);
  end if;
  return false;
end $$;

create function public.create_guided_case_intake(
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
  if found then return created_case; end if;

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
      from public.question_options option_row where option_row.question_id=question_row.id),'[]'::jsonb)
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
  return created_case;
exception when unique_violation then
  select * into created_case from public.cases
  where organization_id=target_organization_id and created_by_user_id=actor
    and intake_submission_key=target_submission_key;
  if found then return created_case; end if;
  raise;
end $$;

-- Existing response editing remains backward compatible with legacy value
-- snapshots while accepting authoritative option UUIDs for Guided Intake.
create or replace function public.save_case_question_response(
  target_case_question_id uuid,target_response_value jsonb
) returns public.case_question_responses language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();q public.case_questions;r public.case_question_responses;valid boolean;
begin
  select * into q from public.case_questions where id=target_case_question_id;
  if not found then raise exception 'case question not found' using errcode='P0002';end if;
  if not public.can_access_case(q.case_id,q.organization_id,actor)
    then raise exception 'not authorized' using errcode='42501';end if;
  valid:=case q.response_type
    when 'YES_NO' then jsonb_typeof(target_response_value)='boolean'
    when 'NUMBER' then jsonb_typeof(target_response_value)='number'
    when 'DATE' then jsonb_typeof(target_response_value)='string' and (target_response_value#>>'{}')~'^\d{4}-\d{2}-\d{2}$'
    when 'TEXT' then jsonb_typeof(target_response_value)='string' and length(trim(target_response_value#>>'{}'))>0
    when 'LONG_TEXT' then jsonb_typeof(target_response_value)='string' and length(trim(target_response_value#>>'{}'))>0
    when 'SINGLE_SELECT' then jsonb_typeof(target_response_value)='string' and exists(
      select 1 from jsonb_array_elements(q.options_snapshot) option_row
      where option_row->>'id'=target_response_value#>>'{}' or option_row->>'value'=target_response_value#>>'{}'
    )
    when 'MULTI_SELECT' then jsonb_typeof(target_response_value)='array' and jsonb_array_length(target_response_value)>0
      and not exists(select 1 from jsonb_array_elements_text(target_response_value) selected(value)
        where not exists(select 1 from jsonb_array_elements(q.options_snapshot) option_row
          where option_row->>'id'=selected.value or option_row->>'value'=selected.value))
    else false end;
  if not valid then raise exception 'invalid question response' using errcode='22023';end if;
  insert into public.case_question_responses(
    organization_id,case_id,case_question_id,response_value,responded_by_user_id
  ) values(q.organization_id,q.case_id,q.id,target_response_value,actor)
  on conflict(case_question_id) do update set
    response_value=excluded.response_value,responded_by_user_id=actor
  returning * into r;
  insert into public.case_activity(organization_id,case_id,actor_user_id,event_type,event_data)
  values(q.organization_id,q.case_id,actor,'QUESTION_RESPONSE_UPDATED',jsonb_build_object('case_question_id',q.id));
  return r;
end $$;

revoke all on function public.guided_intake_response_valid(uuid,uuid,public.question_response_type,jsonb) from public,anon,authenticated;
revoke all on function public.guided_intake_rule_matches(uuid,uuid,public.rule_condition_operator,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.create_guided_case_intake(uuid,uuid,uuid,uuid,text,uuid,public.priority_level,uuid,uuid[],jsonb) from public,anon;
grant execute on function public.create_guided_case_intake(uuid,uuid,uuid,uuid,text,uuid,public.priority_level,uuid,uuid[],jsonb) to authenticated;

comment on function public.create_guided_case_intake(uuid,uuid,uuid,uuid,text,uuid,public.priority_level,uuid,uuid[],jsonb)
is 'Idempotently validates and atomically creates a guided-intake Case, assignments, applicable question snapshots, responses, Rule Tasks, and activity.';
