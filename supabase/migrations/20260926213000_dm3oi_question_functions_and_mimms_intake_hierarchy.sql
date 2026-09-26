alter table public.question_definitions
  add column if not exists question_group text;

alter table public.question_definitions
  drop constraint if exists question_definitions_question_group_check;

alter table public.question_definitions
  add constraint question_definitions_question_group_check
  check (
    question_group is null
    or question_group in (
      'CUSTOMER_PROFILE',
      'VERIFICATION_ELIGIBILITY',
      'REQUIRED_DOCUMENTS',
      'MISSING_INFORMATION_FOLLOW_UP',
      'READY_FOR_HANDOFF'
    )
  );

grant select(question_group)
  on public.question_definitions
  to authenticated;

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
  q.question_group
from public.question_definitions q
where public.is_super_admin(auth.uid())
   or public.is_internal_member(q.organization_id,auth.uid());

drop function if exists public.save_question_definition(
  uuid,
  uuid,
  text,
  text,
  public.question_response_type,
  boolean,
  boolean,
  boolean,
  integer,
  jsonb
);

create function public.save_question_definition(
  target_organization_id uuid,
  target_question_id uuid,
  target_question_text text,
  target_description text,
  target_response_type public.question_response_type,
  target_required boolean,
  target_require_all_options boolean,
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

  if target_question_id is null then
    insert into public.question_definitions(
      organization_id,
      question_text,
      description,
      response_type,
      required,
      require_all_options,
      active,
      display_order,
      question_group,
      created_by_user_id
    )
    values(
      target_organization_id,
      trim(target_question_text),
      coalesce(target_description,''),
      target_response_type,
      target_required,
      target_response_type='MULTI_SELECT'
        and coalesce(target_require_all_options,false),
      target_active,
      target_display_order,
      normalized_group,
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
      require_all_options=(
        target_response_type='MULTI_SELECT'
        and coalesce(target_require_all_options,false)
      ),
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

  for opt in
    select value
    from jsonb_array_elements(target_options)
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

revoke all on function public.save_question_definition(
  uuid,
  uuid,
  text,
  text,
  public.question_response_type,
  boolean,
  boolean,
  boolean,
  integer,
  jsonb,
  text
) from public,anon;

grant execute on function public.save_question_definition(
  uuid,
  uuid,
  text,
  text,
  public.question_response_type,
  boolean,
  boolean,
  boolean,
  integer,
  jsonb,
  text
) to authenticated;

do $$
declare
  target_organization_id uuid := 'e5a00c5a-f028-47f8-bb34-5527219eb995';
  seed_actor_id uuid;
  dependents_rule_id uuid;
  business_rule_id uuid;
begin
  if not exists (
    select 1
    from public.organizations
    where id=target_organization_id
      and name='Mimms'' Tax Service'
      and status='ACTIVE'
  ) then
    raise exception 'Mimms'' Tax Service organization not found or inactive';
  end if;

  select member.user_id
  into seed_actor_id
  from public.organization_members member
  join public.profiles profile
    on profile.id=member.user_id
   and profile.is_active
  where member.organization_id=target_organization_id
    and member.role='BUSINESS_OWNER'
    and member.is_active
    and member.status='ACTIVE'
  order by member.created_at
  limit 1;

  if seed_actor_id is null then
    raise exception 'Mimms active BUSINESS_OWNER not found';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    seed_actor_id::text,
    true
  );

  update public.question_definitions
  set question_group='CUSTOMER_PROFILE'
  where organization_id=target_organization_id
    and id in (
      'c8e0016d-4172-4627-995c-331c78b10d14',
      'a74527d6-9cb7-4f6d-ac3c-e5a6ed259ac4',
      '3965faf9-d128-4f70-835d-fe3fbb576d8b',
      'd13771bc-1b7b-4ec5-b5e9-8200a89222d2',
      '9a13d83d-f731-4dd2-8d59-b5ba63cb243c'
    );

  update public.question_definitions
  set question_group='VERIFICATION_ELIGIBILITY'
  where organization_id=target_organization_id
    and id in (
      'b792697a-e278-4a8d-8bcb-b19861256a66',
      '297567f1-6867-4862-b8d8-c1d115ccbdee'
    );

  update public.question_definitions
  set question_group='REQUIRED_DOCUMENTS'
  where organization_id=target_organization_id
    and id in (
      '911c69ee-14bd-4391-ae87-f5b34047ea60',
      '7668caec-7f75-46c2-8349-cd2611bcbf2b'
    );

  update public.question_definitions
  set
    active=false,
    question_group=null
  where organization_id=target_organization_id
    and id in (
      'f22f5767-9e3f-4cab-9eab-e2bf12fc89e4',
      '1f5c2dc2-d67c-475f-96af-398cf1635b2e',
      'f0d6133c-f974-41eb-8ed9-98e81f8b0123',
      '8866a609-3a86-490e-8fd0-ab153565598b',
      '87faefb5-5218-42f1-965a-0750699d8d4c',
      '68e99e88-2b12-4861-9bb3-3465bb12b5a2',
      '899e0116-dd59-4b05-b05a-76afba046c8d',
      'a6695ee1-b130-40e4-8003-e2db236b01f5',
      'b13be4e9-5e56-43cf-91ae-0a3e8e6dd537',
      '0f78f410-3735-4e26-9204-bb98a546f89b',
      'bea28c03-a676-457d-959a-8321087bae2e',
      '5b53bf52-8dd6-41f0-a210-3f22f673be0f',
      '6d43cdb6-7d3c-4a6f-98f4-c4ead152e450',
      'e5db03c9-71ba-4954-be75-51f71c9b3e34'
    );

  select id
  into dependents_rule_id
  from public.rule_definitions
  where organization_id=target_organization_id
    and name='Require dependent verification when dependents are claimed'
  limit 1;

  if dependents_rule_id is null then
    insert into public.rule_definitions(
      organization_id,
      name,
      description,
      source_question_id,
      condition_operator,
      condition_option_id,
      active,
      display_order,
      created_by_user_id,
      updated_by_user_id
    )
    values(
      target_organization_id,
      'Require dependent verification when dependents are claimed',
      'Dependent verification applies only when the customer is claiming dependents.',
      'd13771bc-1b7b-4ec5-b5e9-8200a89222d2',
      'IS_YES',
      null,
      true,
      10,
      seed_actor_id,
      seed_actor_id
    )
    returning id into dependents_rule_id;
  else
    update public.rule_definitions
    set
      description='Dependent verification applies only when the customer is claiming dependents.',
      source_question_id='d13771bc-1b7b-4ec5-b5e9-8200a89222d2',
      condition_operator='IS_YES',
      condition_option_id=null,
      active=true,
      display_order=10,
      updated_by_user_id=seed_actor_id
    where id=dependents_rule_id
      and organization_id=target_organization_id;
  end if;

  if not exists (
    select 1
    from public.rule_actions
    where organization_id=target_organization_id
      and rule_definition_id=dependents_rule_id
      and action_type='REQUIRE_QUESTION'
      and target_question_id='297567f1-6867-4862-b8d8-c1d115ccbdee'
      and retired_at is null
  ) then
    insert into public.rule_actions(
      organization_id,
      rule_definition_id,
      action_type,
      target_question_id,
      display_order,
      created_by_user_id,
      updated_by_user_id
    )
    values(
      target_organization_id,
      dependents_rule_id,
      'REQUIRE_QUESTION',
      '297567f1-6867-4862-b8d8-c1d115ccbdee',
      10,
      seed_actor_id,
      seed_actor_id
    );
  end if;

  select id
  into business_rule_id
  from public.rule_definitions
  where organization_id=target_organization_id
    and name='Require business records when business income is involved'
  limit 1;

  if business_rule_id is null then
    insert into public.rule_definitions(
      organization_id,
      name,
      description,
      source_question_id,
      condition_operator,
      condition_option_id,
      active,
      display_order,
      created_by_user_id,
      updated_by_user_id
    )
    values(
      target_organization_id,
      'Require business records when business income is involved',
      'Business income and expense records apply only when self-employment or business income is involved.',
      '9a13d83d-f731-4dd2-8d59-b5ba63cb243c',
      'IS_YES',
      null,
      true,
      20,
      seed_actor_id,
      seed_actor_id
    )
    returning id into business_rule_id;
  else
    update public.rule_definitions
    set
      description='Business income and expense records apply only when self-employment or business income is involved.',
      source_question_id='9a13d83d-f731-4dd2-8d59-b5ba63cb243c',
      condition_operator='IS_YES',
      condition_option_id=null,
      active=true,
      display_order=20,
      updated_by_user_id=seed_actor_id
    where id=business_rule_id
      and organization_id=target_organization_id;
  end if;

  if not exists (
    select 1
    from public.rule_actions
    where organization_id=target_organization_id
      and rule_definition_id=business_rule_id
      and action_type='REQUIRE_QUESTION'
      and target_question_id='7668caec-7f75-46c2-8349-cd2611bcbf2b'
      and retired_at is null
  ) then
    insert into public.rule_actions(
      organization_id,
      rule_definition_id,
      action_type,
      target_question_id,
      display_order,
      created_by_user_id,
      updated_by_user_id
    )
    values(
      target_organization_id,
      business_rule_id,
      'REQUIRE_QUESTION',
      '7668caec-7f75-46c2-8349-cd2611bcbf2b',
      10,
      seed_actor_id,
      seed_actor_id
    );
  end if;

end
$$;
