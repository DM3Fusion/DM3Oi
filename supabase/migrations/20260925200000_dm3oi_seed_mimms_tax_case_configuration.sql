-- Seed Mimms' Tax Service Case Titles and Case Types for its
-- refund-advance tax preparation operating model.
--
-- Existing matching configuration is reactivated and updated in place so
-- stable IDs remain intact. Missing configuration is inserted.

do $$
declare
  target_organization_id uuid := 'e5a00c5a-f028-47f8-bb34-5527219eb995';
  seed_actor_id uuid;
begin
  if not exists (
    select 1
    from public.organizations
    where id = target_organization_id
      and name = 'Mimms'' Tax Service'
      and status = 'ACTIVE'
  ) then
    raise exception 'Mimms'' Tax Service organization not found or inactive';
  end if;

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
  order by member.created_at, member.user_id
  limit 1;

  if seed_actor_id is null then
    raise exception 'Mimms'' Tax Service has no active BUSINESS_OWNER available for configuration attribution';
  end if;

  alter table public.organization_case_titles
    disable trigger organization_case_titles_stamp_actor;

  update public.organization_case_titles title
  set
    label = seed.label,
    sort_order = seed.sort_order,
    is_active = true,
    updated_by_user_id = seed_actor_id,
    updated_at = now()
  from (
    values
      ('New Client — Refund Advance', 10),
      ('Returning Client — Refund Advance', 20),
      ('W-2 Annual Return', 30),
      ('Self-Employed / 1099 Return', 40),
      ('W-2 + Self-Employment Return', 50),
      ('Dependents / Child Tax Credit', 60),
      ('Earned Income Credit', 70),
      ('Education Credit', 80),
      ('Retirement / Social Security Income', 90),
      ('Multi-State Return', 100),
      ('Missing Tax Documents', 110),
      ('Awaiting W-2 / 1099', 120),
      ('Identity Verification Required', 130),
      ('Prior-Year Return', 140),
      ('Amended Return', 150),
      ('Federal Refund Delayed', 160),
      ('State Refund Delayed', 170),
      ('Refund Offset / Intercept', 180),
      ('Refund Amount Reduced', 190),
      ('Refund Amount Greater Than Expected', 200),
      ('Refund Check Received', 210),
      ('Refund Check Not Received', 220),
      ('Refund Payment Reconciliation', 230),
      ('Advance Balance Remaining', 240),
      ('IRS Notice Received', 250),
      ('State Tax Notice Received', 260)
  ) as seed(label, sort_order)
  where title.organization_id = target_organization_id
    and lower(trim(title.label)) = lower(trim(seed.label));

  insert into public.organization_case_titles (
    organization_id,
    label,
    is_active,
    sort_order,
    created_by_user_id,
    updated_by_user_id
  )
  select
    target_organization_id,
    seed.label,
    true,
    seed.sort_order,
    seed_actor_id,
    seed_actor_id
  from (
    values
      ('New Client — Refund Advance', 10),
      ('Returning Client — Refund Advance', 20),
      ('W-2 Annual Return', 30),
      ('Self-Employed / 1099 Return', 40),
      ('W-2 + Self-Employment Return', 50),
      ('Dependents / Child Tax Credit', 60),
      ('Earned Income Credit', 70),
      ('Education Credit', 80),
      ('Retirement / Social Security Income', 90),
      ('Multi-State Return', 100),
      ('Missing Tax Documents', 110),
      ('Awaiting W-2 / 1099', 120),
      ('Identity Verification Required', 130),
      ('Prior-Year Return', 140),
      ('Amended Return', 150),
      ('Federal Refund Delayed', 160),
      ('State Refund Delayed', 170),
      ('Refund Offset / Intercept', 180),
      ('Refund Amount Reduced', 190),
      ('Refund Amount Greater Than Expected', 200),
      ('Refund Check Received', 210),
      ('Refund Check Not Received', 220),
      ('Refund Payment Reconciliation', 230),
      ('Advance Balance Remaining', 240),
      ('IRS Notice Received', 250),
      ('State Tax Notice Received', 260)
  ) as seed(label, sort_order)
  where not exists (
    select 1
    from public.organization_case_titles existing
    where existing.organization_id = target_organization_id
      and lower(trim(existing.label)) = lower(trim(seed.label))
  );

  alter table public.organization_case_titles
    enable trigger organization_case_titles_stamp_actor;

  update public.organization_case_types case_type
  set
    name = seed.name,
    description = seed.description,
    sort_order = seed.sort_order,
    is_active = true,
    updated_at = now()
  from (
    values
      (
        'New Refund Advance Return',
        'First-time client annual tax return prepared under the refund-advance arrangement.',
        10
      ),
      (
        'Returning Refund Advance Return',
        'Returning client annual tax return prepared under the refund-advance arrangement.',
        20
      ),
      (
        'Standard Tax Preparation',
        'Federal and state tax preparation without a refund-advance arrangement.',
        30
      ),
      (
        'Prior-Year Refund Return',
        'Prior-year or delinquent tax return expected to produce a refund.',
        40
      ),
      (
        'Amended Refund Return',
        'Amended federal or state return expected to change or produce a refund.',
        50
      ),
      (
        'Refund Issue / Exception',
        'Post-filing refund delay, reduction, offset, intercept, or other exception.',
        60
      ),
      (
        'Repayment / Settlement',
        'Refund receipt, advance repayment, balance reconciliation, or settlement activity.',
        70
      ),
      (
        'Tax Notice / Follow-Up',
        'IRS or state tax notice and related post-filing follow-up activity.',
        80
      )
  ) as seed(name, description, sort_order)
  where case_type.organization_id = target_organization_id
    and lower(trim(case_type.name)) = lower(trim(seed.name));

  insert into public.organization_case_types (
    organization_id,
    name,
    description,
    is_active,
    sort_order
  )
  select
    target_organization_id,
    seed.name,
    seed.description,
    true,
    seed.sort_order
  from (
    values
      (
        'New Refund Advance Return',
        'First-time client annual tax return prepared under the refund-advance arrangement.',
        10
      ),
      (
        'Returning Refund Advance Return',
        'Returning client annual tax return prepared under the refund-advance arrangement.',
        20
      ),
      (
        'Standard Tax Preparation',
        'Federal and state tax preparation without a refund-advance arrangement.',
        30
      ),
      (
        'Prior-Year Refund Return',
        'Prior-year or delinquent tax return expected to produce a refund.',
        40
      ),
      (
        'Amended Refund Return',
        'Amended federal or state return expected to change or produce a refund.',
        50
      ),
      (
        'Refund Issue / Exception',
        'Post-filing refund delay, reduction, offset, intercept, or other exception.',
        60
      ),
      (
        'Repayment / Settlement',
        'Refund receipt, advance repayment, balance reconciliation, or settlement activity.',
        70
      ),
      (
        'Tax Notice / Follow-Up',
        'IRS or state tax notice and related post-filing follow-up activity.',
        80
      )
  ) as seed(name, description, sort_order)
  where not exists (
    select 1
    from public.organization_case_types existing
    where existing.organization_id = target_organization_id
      and lower(trim(existing.name)) = lower(trim(seed.name))
  );
end
$$;
