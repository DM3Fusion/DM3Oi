-- Expand Mimms Tax Service Guided Intake from manual document selection
-- to rule-driven tax facts -> required document availability.
--
-- This migration is intentionally organization-scoped.
-- Staff answers tax facts; DM3Oi determines the required document set.

do $$
declare
  target_organization_id uuid := 'e5a00c5a-f028-47f8-bb34-5527219eb995';
  seed_actor_id uuid;

  filing_status_question_id uuid;
  mfj_option_id uuid;
  mfs_option_id uuid;
  hoh_option_id uuid;
  qss_option_id uuid;

  document_question_id uuid := '911c69ee-14bd-4391-ae87-f5b34047ea60';

  taxpayer_wages_question_id uuid :=
    'a1000000-0000-4000-8000-000000000001';
  spouse_wages_question_id uuid :=
    'a1000000-0000-4000-8000-000000000002';
  retirement_question_id uuid :=
    'a1000000-0000-4000-8000-000000000003';
  social_security_question_id uuid :=
    'a1000000-0000-4000-8000-000000000004';
  interest_question_id uuid :=
    'a1000000-0000-4000-8000-000000000005';
  dividends_question_id uuid :=
    'a1000000-0000-4000-8000-000000000006';
  brokerage_question_id uuid :=
    'a1000000-0000-4000-8000-000000000007';
  mortgage_question_id uuid :=
    'a1000000-0000-4000-8000-000000000008';
  rental_question_id uuid :=
    'a1000000-0000-4000-8000-000000000009';
  business_expenses_question_id uuid :=
    'a1000000-0000-4000-8000-00000000000a';

  hoh_unmarried_question_id uuid :=
    'a1000000-0000-4000-8000-000000000011';
  hoh_home_cost_question_id uuid :=
    'a1000000-0000-4000-8000-000000000012';
  hoh_qualifying_person_question_id uuid :=
    'a1000000-0000-4000-8000-000000000013';
  hoh_residency_question_id uuid :=
    'a1000000-0000-4000-8000-000000000014';

  qss_death_period_question_id uuid :=
    'a1000000-0000-4000-8000-000000000021';
  qss_not_remarried_question_id uuid :=
    'a1000000-0000-4000-8000-000000000022';
  qss_home_question_id uuid :=
    'a1000000-0000-4000-8000-000000000023';
  qss_child_question_id uuid :=
    'a1000000-0000-4000-8000-000000000024';

  self_employment_question_id uuid :=
    '9a13d83d-f731-4dd2-8d59-b5ba63cb243c';

  rule_id uuid;
begin
  select member.user_id
  into seed_actor_id
  from public.organization_members member
  join public.profiles profile
    on profile.id = member.user_id
   and profile.is_active
  where member.organization_id = target_organization_id
    and member.role = 'BUSINESS_OWNER'
    and member.is_active
    and member.status = 'ACTIVE'
  order by member.created_at
  limit 1;

  if seed_actor_id is null then
    raise exception 'Mimms active BUSINESS_OWNER not found';
  end if;

  select id
  into filing_status_question_id
  from public.question_definitions
  where organization_id = target_organization_id
    and active
    and lower(question_text) like '%filing status%'
  order by display_order, created_at
  limit 1;

  if filing_status_question_id is null then
    raise exception 'Mimms filing-status question not found';
  end if;

  if not exists (
    select 1
    from public.question_definitions
    where id = document_question_id
      and organization_id = target_organization_id
  ) then
    raise exception 'Mimms required-document question not found';
  end if;

  -- Ensure Qualifying Surviving Spouse is available as a filing-status option.
  insert into public.question_options (
    organization_id,
    question_id,
    option_label,
    option_value,
    display_order,
    is_active
  )
  select
    target_organization_id,
    filing_status_question_id,
    'Qualifying Surviving Spouse',
    'qualifying-surviving-spouse',
    coalesce((
      select max(display_order) + 1
      from public.question_options
      where question_id = filing_status_question_id
    ), 0),
    true
  where not exists (
    select 1
    from public.question_options
    where question_id = filing_status_question_id
      and lower(trim(option_label)) =
        'qualifying surviving spouse'
  );

  select id into mfj_option_id
  from public.question_options
  where question_id = filing_status_question_id
    and lower(trim(option_label)) in (
      'married filing jointly',
      'married filing joint'
    )
  limit 1;

  select id into mfs_option_id
  from public.question_options
  where question_id = filing_status_question_id
    and lower(trim(option_label)) =
      'married filing separately'
  limit 1;

  select id into hoh_option_id
  from public.question_options
  where question_id = filing_status_question_id
    and lower(trim(option_label)) =
      'head of household'
  limit 1;

  select id into qss_option_id
  from public.question_options
  where question_id = filing_status_question_id
    and lower(trim(option_label)) =
      'qualifying surviving spouse'
  limit 1;

  if mfj_option_id is null
     or mfs_option_id is null
     or hoh_option_id is null
     or qss_option_id is null then
    raise exception
      'Expected filing-status options were not found';
  end if;

  -- Tax-fact questions.
  insert into public.question_definitions (
    id,
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
  values
    (
      taxpayer_wages_question_id,
      target_organization_id,
      'Did the taxpayer receive wages from an employer?',
      'A Yes answer causes DM3Oi to require a taxpayer W-2.',
      'YES_NO',
      true,
      false,
      true,
      310,
      'CUSTOMER_PROFILE',
      seed_actor_id
    ),
    (
      spouse_wages_question_id,
      target_organization_id,
      'Did the spouse receive wages from an employer?',
      'Displayed only for Married Filing Jointly. A Yes answer causes DM3Oi to require a spouse W-2.',
      'YES_NO',
      false,
      false,
      true,
      320,
      'CUSTOMER_PROFILE',
      seed_actor_id
    ),
    (
      retirement_question_id,
      target_organization_id,
      'Did the taxpayer receive retirement or pension income?',
      'A Yes answer causes DM3Oi to require the applicable retirement-income document.',
      'YES_NO',
      true,
      false,
      true,
      330,
      'CUSTOMER_PROFILE',
      seed_actor_id
    ),
    (
      social_security_question_id,
      target_organization_id,
      'Did the taxpayer receive Social Security benefits?',
      'A Yes answer causes DM3Oi to require SSA-1099.',
      'YES_NO',
      true,
      false,
      true,
      340,
      'CUSTOMER_PROFILE',
      seed_actor_id
    ),
    (
      interest_question_id,
      target_organization_id,
      'Did the taxpayer receive taxable interest income?',
      'A Yes answer causes DM3Oi to require the applicable interest-income statement.',
      'YES_NO',
      true,
      false,
      true,
      350,
      'CUSTOMER_PROFILE',
      seed_actor_id
    ),
    (
      dividends_question_id,
      target_organization_id,
      'Did the taxpayer receive dividend income?',
      'A Yes answer causes DM3Oi to require the applicable dividend-income statement.',
      'YES_NO',
      true,
      false,
      true,
      360,
      'CUSTOMER_PROFILE',
      seed_actor_id
    ),
    (
      brokerage_question_id,
      target_organization_id,
      'Did the taxpayer sell stocks, securities, cryptocurrency, or other investments?',
      'A Yes answer causes DM3Oi to require the applicable brokerage or investment statement.',
      'YES_NO',
      true,
      false,
      true,
      370,
      'CUSTOMER_PROFILE',
      seed_actor_id
    ),
    (
      mortgage_question_id,
      target_organization_id,
      'Did the taxpayer pay mortgage interest?',
      'A Yes answer causes DM3Oi to require the applicable mortgage-interest statement.',
      'YES_NO',
      true,
      false,
      true,
      380,
      'CUSTOMER_PROFILE',
      seed_actor_id
    ),
    (
      rental_question_id,
      target_organization_id,
      'Did the taxpayer own rental property or receive rental income?',
      'A Yes answer causes DM3Oi to require rental income and expense records.',
      'YES_NO',
      true,
      false,
      true,
      390,
      'CUSTOMER_PROFILE',
      seed_actor_id
    ),
    (
      business_expenses_question_id,
      target_organization_id,
      'Does the taxpayer have business expenses to report?',
      'Displayed when self-employment or business income applies.',
      'YES_NO',
      false,
      false,
      true,
      400,
      'CUSTOMER_PROFILE',
      seed_actor_id
    ),

    -- Head of Household eligibility.
    (
      hoh_unmarried_question_id,
      target_organization_id,
      'Was the taxpayer unmarried or considered unmarried on the last day of the tax year?',
      'Required when Head of Household is selected.',
      'YES_NO',
      false,
      false,
      true,
      510,
      'VERIFICATION_ELIGIBILITY',
      seed_actor_id
    ),
    (
      hoh_home_cost_question_id,
      target_organization_id,
      'Did the taxpayer pay more than half the cost of keeping up the home?',
      'Required when Head of Household is selected.',
      'YES_NO',
      false,
      false,
      true,
      520,
      'VERIFICATION_ELIGIBILITY',
      seed_actor_id
    ),
    (
      hoh_qualifying_person_question_id,
      target_organization_id,
      'Does the taxpayer have a qualifying person for Head of Household purposes?',
      'Required when Head of Household is selected.',
      'YES_NO',
      false,
      false,
      true,
      530,
      'VERIFICATION_ELIGIBILITY',
      seed_actor_id
    ),
    (
      hoh_residency_question_id,
      target_organization_id,
      'Did the qualifying person meet the applicable household residency requirement?',
      'Required when Head of Household is selected. The dependent-parent exception must be considered where applicable.',
      'YES_NO',
      false,
      false,
      true,
      540,
      'VERIFICATION_ELIGIBILITY',
      seed_actor_id
    ),

    -- Qualifying Surviving Spouse eligibility.
    (
      qss_death_period_question_id,
      target_organization_id,
      'Did the spouse die within the applicable Qualifying Surviving Spouse period?',
      'Required when Qualifying Surviving Spouse is selected.',
      'YES_NO',
      false,
      false,
      true,
      610,
      'VERIFICATION_ELIGIBILITY',
      seed_actor_id
    ),
    (
      qss_not_remarried_question_id,
      target_organization_id,
      'Has the taxpayer remained unmarried through the end of the tax year?',
      'Required when Qualifying Surviving Spouse is selected.',
      'YES_NO',
      false,
      false,
      true,
      620,
      'VERIFICATION_ELIGIBILITY',
      seed_actor_id
    ),
    (
      qss_home_question_id,
      target_organization_id,
      'Did the taxpayer pay more than half the cost of keeping up the home for the qualifying child?',
      'Required when Qualifying Surviving Spouse is selected.',
      'YES_NO',
      false,
      false,
      true,
      630,
      'VERIFICATION_ELIGIBILITY',
      seed_actor_id
    ),
    (
      qss_child_question_id,
      target_organization_id,
      'Does the taxpayer have a qualifying dependent child for Qualifying Surviving Spouse status?',
      'Required when Qualifying Surviving Spouse is selected.',
      'YES_NO',
      false,
      false,
      true,
      640,
      'VERIFICATION_ELIGIBILITY',
      seed_actor_id
    )
  on conflict (id) do update
  set
    question_text = excluded.question_text,
    description = excluded.description,
    response_type = excluded.response_type,
    required = excluded.required,
    require_all_options = excluded.require_all_options,
    active = excluded.active,
    display_order = excluded.display_order,
    question_group = excluded.question_group;

  -- Eligibility questions must resolve Yes, not merely be answered.
  update public.question_definitions
  set completion_condition = 'YES_REQUIRED'
  where organization_id = target_organization_id
    and id in (
      hoh_unmarried_question_id,
      hoh_home_cost_question_id,
      hoh_qualifying_person_question_id,
      hoh_residency_question_id,
      qss_death_period_question_id,
      qss_not_remarried_question_id,
      qss_home_question_id,
      qss_child_question_id
    );

  -- Extend the existing tax-document catalog.
  insert into public.question_options (
    organization_id,
    question_id,
    option_label,
    option_value,
    display_order,
    is_active
  )
  values
    (
      target_organization_id,
      document_question_id,
      'W-2 — Taxpayer',
      'w-2-taxpayer',
      20,
      true
    ),
    (
      target_organization_id,
      document_question_id,
      'W-2 — Spouse',
      'w-2-spouse',
      21,
      true
    ),
    (
      target_organization_id,
      document_question_id,
      'Business Income Records',
      'business-income-records',
      22,
      true
    ),
    (
      target_organization_id,
      document_question_id,
      'Business Expense Records',
      'business-expense-records',
      23,
      true
    ),
    (
      target_organization_id,
      document_question_id,
      'Rental Income / Expense Records',
      'rental-income-expense-records',
      24,
      true
    )
  on conflict (question_id, option_value)
  do update set
    option_label = excluded.option_label,
    display_order = excluded.display_order,
    is_active = true;

  -- This is migration-owned organization configuration.
  -- Rule actor-stamping requires an authenticated application actor, which
  -- does not exist during db push. Preserve all other Rule validation,
  -- relationship, shape, and graph safeguards.
  alter table public.rule_definitions
    disable trigger rule_definitions_stamp_actor;
  alter table public.rule_actions
    disable trigger rule_actions_stamp_actor;

  -- MFJ -> spouse wage question.
  select id into rule_id
  from public.rule_definitions
  where organization_id = target_organization_id
    and name = 'Ask spouse wages for Married Filing Jointly'
  limit 1;

  if rule_id is null then
    insert into public.rule_definitions (
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
    values (
      target_organization_id,
      'Ask spouse wages for Married Filing Jointly',
      'Spouse wage information applies only when Married Filing Jointly is selected.',
      filing_status_question_id,
      'EQUALS',
      mfj_option_id,
      true,
      100,
      seed_actor_id,
      seed_actor_id
    )
    returning id into rule_id;
  else
    update public.rule_definitions
    set
      source_question_id = filing_status_question_id,
      condition_operator = 'EQUALS',
      condition_option_id = mfj_option_id,
      active = true,
      updated_by_user_id = seed_actor_id
    where id = rule_id;
  end if;

  insert into public.rule_actions (
    organization_id,
    rule_definition_id,
    action_type,
    target_question_id,
    display_order,
    created_by_user_id,
    updated_by_user_id
  )
  select
    target_organization_id,
    rule_id,
    action_type,
    spouse_wages_question_id,
    display_order,
    seed_actor_id,
    seed_actor_id
  from (
    values
      ('SHOW_QUESTION'::public.rule_action_type, 10),
      ('REQUIRE_QUESTION'::public.rule_action_type, 20)
  ) action_seed(action_type, display_order)
  where not exists (
    select 1
    from public.rule_actions existing
    where existing.organization_id = target_organization_id
      and existing.rule_definition_id = rule_id
      and existing.action_type = action_seed.action_type
      and existing.target_question_id = spouse_wages_question_id
      and existing.retired_at is null
  );

  -- HOH eligibility questions.
  select id into rule_id
  from public.rule_definitions
  where organization_id = target_organization_id
    and name = 'Validate Head of Household eligibility'
  limit 1;

  if rule_id is null then
    insert into public.rule_definitions (
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
    values (
      target_organization_id,
      'Validate Head of Household eligibility',
      'Head of Household requires affirmative eligibility confirmations.',
      filing_status_question_id,
      'EQUALS',
      hoh_option_id,
      true,
      110,
      seed_actor_id,
      seed_actor_id
    )
    returning id into rule_id;
  else
    update public.rule_definitions
    set
      source_question_id = filing_status_question_id,
      condition_operator = 'EQUALS',
      condition_option_id = hoh_option_id,
      active = true,
      updated_by_user_id = seed_actor_id
    where id = rule_id;
  end if;

  insert into public.rule_actions (
    organization_id,
    rule_definition_id,
    action_type,
    target_question_id,
    display_order,
    created_by_user_id,
    updated_by_user_id
  )
  select
    target_organization_id,
    rule_id,
    action_seed.action_type,
    targets.question_id,
    targets.base_order + action_seed.offset_order,
    seed_actor_id,
    seed_actor_id
  from (
    values
      (hoh_unmarried_question_id, 10),
      (hoh_home_cost_question_id, 30),
      (hoh_qualifying_person_question_id, 50),
      (hoh_residency_question_id, 70)
  ) targets(question_id, base_order)
  cross join (
    values
      ('SHOW_QUESTION'::public.rule_action_type, 0),
      ('REQUIRE_QUESTION'::public.rule_action_type, 10)
  ) action_seed(action_type, offset_order)
  where not exists (
    select 1
    from public.rule_actions existing
    where existing.organization_id = target_organization_id
      and existing.rule_definition_id = rule_id
      and existing.action_type = action_seed.action_type
      and existing.target_question_id = targets.question_id
      and existing.retired_at is null
  );

  -- Qualifying Surviving Spouse eligibility questions.
  select id into rule_id
  from public.rule_definitions
  where organization_id = target_organization_id
    and name = 'Validate Qualifying Surviving Spouse eligibility'
  limit 1;

  if rule_id is null then
    insert into public.rule_definitions (
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
    values (
      target_organization_id,
      'Validate Qualifying Surviving Spouse eligibility',
      'Qualifying Surviving Spouse requires affirmative eligibility confirmations, a qualifying dependent child, and the intake Dependents Claimed answer must be Yes.',
      filing_status_question_id,
      'EQUALS',
      qss_option_id,
      true,
      120,
      seed_actor_id,
      seed_actor_id
    )
    returning id into rule_id;
  else
    update public.rule_definitions
    set
      source_question_id = filing_status_question_id,
      condition_operator = 'EQUALS',
      condition_option_id = qss_option_id,
      active = true,
      updated_by_user_id = seed_actor_id
    where id = rule_id;
  end if;

  insert into public.rule_actions (
    organization_id,
    rule_definition_id,
    action_type,
    target_question_id,
    display_order,
    created_by_user_id,
    updated_by_user_id
  )
  select
    target_organization_id,
    rule_id,
    action_seed.action_type,
    targets.question_id,
    targets.base_order + action_seed.offset_order,
    seed_actor_id,
    seed_actor_id
  from (
    values
      (qss_death_period_question_id, 10),
      (qss_not_remarried_question_id, 30),
      (qss_home_question_id, 50),
      (qss_child_question_id, 70)
  ) targets(question_id, base_order)
  cross join (
    values
      ('SHOW_QUESTION'::public.rule_action_type, 0),
      ('REQUIRE_QUESTION'::public.rule_action_type, 10)
  ) action_seed(action_type, offset_order)
  where not exists (
    select 1
    from public.rule_actions existing
    where existing.organization_id = target_organization_id
      and existing.rule_definition_id = rule_id
      and existing.action_type = action_seed.action_type
      and existing.target_question_id = targets.question_id
      and existing.retired_at is null
  );

  -- Business expenses only apply when business/self-employment income applies.
  select id into rule_id
  from public.rule_definitions
  where organization_id = target_organization_id
    and name = 'Ask business expenses when business income applies'
  limit 1;

  if rule_id is null then
    insert into public.rule_definitions (
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
    values (
      target_organization_id,
      'Ask business expenses when business income applies',
      'Business expense records are evaluated only when self-employment or business income applies.',
      self_employment_question_id,
      'IS_YES',
      null,
      true,
      130,
      seed_actor_id,
      seed_actor_id
    )
    returning id into rule_id;
  else
    update public.rule_definitions
    set
      source_question_id = self_employment_question_id,
      condition_operator = 'IS_YES',
      condition_option_id = null,
      active = true,
      updated_by_user_id = seed_actor_id
    where id = rule_id;
  end if;

  insert into public.rule_actions (
    organization_id,
    rule_definition_id,
    action_type,
    target_question_id,
    display_order,
    created_by_user_id,
    updated_by_user_id
  )
  select
    target_organization_id,
    rule_id,
    action_type,
    business_expenses_question_id,
    display_order,
    seed_actor_id,
    seed_actor_id
  from (
    values
      ('SHOW_QUESTION'::public.rule_action_type, 10),
      ('REQUIRE_QUESTION'::public.rule_action_type, 20)
  ) action_seed(action_type, display_order)
  where not exists (
    select 1
    from public.rule_actions existing
    where existing.organization_id = target_organization_id
      and existing.rule_definition_id = rule_id
      and existing.action_type = action_seed.action_type
      and existing.target_question_id = business_expenses_question_id
      and existing.retired_at is null
  );

  -- Flush the deferred Rule graph checks before changing trigger state.
  set constraints
    rule_definitions_graph_acyclic,
    rule_actions_graph_acyclic
    immediate;

  alter table public.rule_actions
    enable trigger rule_actions_stamp_actor;
  alter table public.rule_definitions
    enable trigger rule_definitions_stamp_actor;
end
$$;
