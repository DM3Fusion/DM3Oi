begin;

-- Staff users with CREATE_CASE but without ASSIGN_CASES may create their own
-- Guided Intake Cases. The database enforces self-assignment and prevents
-- selecting a Manager or another Staff member.

create or replace function public.materialize_guided_case_intake(
  target_organization_id uuid,
  target_submission_key uuid,
  target_customer_id uuid,
  target_customer_mode text,
  target_description text,
  target_case_type_id uuid,
  target_priority public.priority_level,
  target_tax_year integer,
  target_manager_user_id uuid default null,
  target_staff_user_ids uuid[] default '{}'::uuid[]
)
returns public.cases
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  semantic_type public.organization_case_types;
  draft_row public.guided_case_intake_drafts;
  materialized public.cases;
  current_tax_year integer;
  staff_id uuid;
begin
  if actor is null
    or target_submission_key is null
    or not public.has_effective_organization_permission(
      target_organization_id,'CREATE_CASE'
    )
    or not public.has_effective_organization_permission(
      target_organization_id,'VIEW_CUSTOMERS'
    )
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if not exists(
    select 1 from public.organizations organization
    where organization.id=target_organization_id
      and organization.status='ACTIVE'
  ) then
    raise exception 'organization is inactive' using errcode='42501';
  end if;

  if target_customer_mode not in ('existing','new') then
    raise exception 'invalid Customer mode' using errcode='23514';
  end if;

  if not exists(
    select 1 from public.customers customer
    where customer.organization_id=target_organization_id
      and customer.id=target_customer_id
      and customer.status='ACTIVE'
  ) then
    raise exception 'invalid customer' using errcode='23514';
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

  if public.has_effective_organization_permission(
    target_organization_id,'ASSIGN_CASES'
  ) then
    if cardinality(target_staff_user_ids)=0 then
      raise exception 'at least one assigned staff member is required'
        using errcode='23514';
    end if;
  else
    -- Staff who may create Cases but may not assign Cases are always
    -- self-assigned. This does not grant ASSIGN_CASES and cannot be used
    -- to select a Manager or another Staff member.
    if target_manager_user_id is not null
       or cardinality(target_staff_user_ids)<>1
       or target_staff_user_ids[1] is distinct from actor then
      raise exception 'Case creator may only self-assign'
        using errcode='42501';
    end if;
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
  if cardinality(target_staff_user_ids)<>(
    select count(distinct candidate)
    from unnest(target_staff_user_ids) candidate
  ) then
    raise exception 'duplicate staff assignment' using errcode='23514';
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

  -- Serialize materialization for the authoritative Customer/Tax-Year key.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_organization_id::text||':'||target_customer_id::text||':'||target_tax_year::text,
      0
    )
  );

  select * into draft_row
  from public.guided_case_intake_drafts draft
  where draft.organization_id=target_organization_id
    and draft.created_by_user_id=actor
    and draft.submission_key=target_submission_key
  for update;

  if found then
    if draft_row.case_id is not null and (
      draft_row.customer_id is distinct from target_customer_id
      or draft_row.tax_year is distinct from target_tax_year
      or draft_row.case_type_id is distinct from target_case_type_id
    ) then
      raise exception 'Guided Intake draft Case identity does not match'
        using errcode='23514';
    end if;
    if draft_row.case_id is null then
      if exists(
        select 1
        from public.guided_case_intake_drafts other
        where other.organization_id=target_organization_id
          and other.created_by_user_id=actor
          and other.customer_id=target_customer_id
          and other.tax_year=target_tax_year
          and other.finalized_at is null
          and other.id<>draft_row.id
      ) then
        raise exception 'An unfinished intake already exists for this Customer and Tax Year'
          using errcode='23505';
      end if;

      update public.guided_case_intake_drafts
      set current_step=greatest(current_step,2),
          customer_mode=target_customer_mode,
          customer_id=target_customer_id,
          tax_year=target_tax_year,
          description=coalesce(trim(target_description),''),
          case_type_id=target_case_type_id,
          priority=target_priority,
          manager_user_id=target_manager_user_id,
          staff_user_ids=target_staff_user_ids
      where id=draft_row.id
      returning * into draft_row;
    end if;
  else
    if exists(
      select 1
      from public.guided_case_intake_drafts other
      where other.organization_id=target_organization_id
        and other.created_by_user_id=actor
        and other.customer_id=target_customer_id
        and other.tax_year=target_tax_year
        and other.finalized_at is null
    ) then
      raise exception 'An unfinished intake already exists for this Customer and Tax Year'
        using errcode='23505';
    end if;

    insert into public.guided_case_intake_drafts(
      organization_id,created_by_user_id,submission_key,current_step,
      customer_mode,customer_id,tax_year,description,case_type_id,priority,
      manager_user_id,staff_user_ids
    ) values(
      target_organization_id,actor,target_submission_key,2,
      target_customer_mode,target_customer_id,target_tax_year,
      coalesce(trim(target_description),''),target_case_type_id,target_priority,
      target_manager_user_id,target_staff_user_ids
    ) returning * into draft_row;
  end if;

  if draft_row.case_id is not null then
    select * into materialized
    from public.cases item
    where item.organization_id=target_organization_id
      and item.id=draft_row.case_id
    for update;

    if not found
      or materialized.created_by_user_id<>actor
      or materialized.intake_submission_key is distinct from target_submission_key
      or materialized.customer_id<>target_customer_id
      or materialized.tax_year is distinct from target_tax_year
      or materialized.case_type_id is distinct from target_case_type_id
    then
      raise exception 'Guided Intake Case linkage is invalid' using errcode='23514';
    end if;
    if materialized.status<>'IN_PROGRESS' then
      raise exception 'Guided Intake Case is no longer in progress'
        using errcode='23514';
    end if;
    return materialized;
  end if;

  select * into materialized
  from public.cases item
  where item.organization_id=target_organization_id
    and item.customer_id=target_customer_id
    and item.tax_year=target_tax_year
  for update;

  if found then
    if materialized.created_by_user_id<>actor
      or materialized.intake_submission_key is distinct from target_submission_key
    then
      raise exception 'Customer already has an unrelated Case for this tax year'
        using errcode='23505';
    end if;
  else
    insert into public.cases(
      organization_id,customer_id,title,description,case_type,case_type_id,
      priority,status,tax_year,manager_user_id,created_by_user_id,
      intake_submission_key
    ) values(
      target_organization_id,target_customer_id,trim(semantic_type.name),
      coalesce(trim(target_description),''),trim(semantic_type.name),
      semantic_type.id,target_priority,'IN_PROGRESS',target_tax_year,
      target_manager_user_id,actor,target_submission_key
    ) returning * into materialized;

    insert into public.case_activity(
      organization_id,case_id,actor_user_id,event_type,event_data
    ) values(
      target_organization_id,materialized.id,actor,'CASE_CREATED',
      jsonb_build_object(
        'case_number',materialized.case_number,
        'status',materialized.status,
        'source','GUIDED_INTAKE_STEP_2'
      )
    );

    if target_manager_user_id is not null then
      insert into public.case_assignments(
        organization_id,case_id,user_id,assignment_role,assigned_by_user_id
      ) values(
        target_organization_id,materialized.id,target_manager_user_id,
        'MANAGER',actor
      );
      insert into public.case_activity(
        organization_id,case_id,actor_user_id,event_type,event_data
      ) values(
        target_organization_id,materialized.id,actor,'CASE_ASSIGNED',
        jsonb_build_object(
          'user_id',target_manager_user_id,'assignment_role','MANAGER'
        )
      );
    end if;

    foreach staff_id in array target_staff_user_ids loop
      insert into public.case_assignments(
        organization_id,case_id,user_id,assignment_role,assigned_by_user_id
      ) values(
        target_organization_id,materialized.id,staff_id,'STAFF',actor
      );
      insert into public.case_activity(
        organization_id,case_id,actor_user_id,event_type,event_data
      ) values(
        target_organization_id,materialized.id,actor,'CASE_ASSIGNED',
        jsonb_build_object('user_id',staff_id,'assignment_role','STAFF')
      );
    end loop;
  end if;

  update public.guided_case_intake_drafts
  set case_id=materialized.id,
      current_step=greatest(current_step,2),
      customer_mode=target_customer_mode,
      description=coalesce(trim(target_description),''),
      priority=target_priority,
      manager_user_id=target_manager_user_id,
      staff_user_ids=target_staff_user_ids
  where id=draft_row.id;

  return materialized;
end
$$;

revoke all on function public.materialize_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,uuid,uuid[]
) from public,anon;

grant execute on function public.materialize_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,uuid,uuid[]
) to authenticated;

comment on function public.materialize_guided_case_intake(
  uuid,uuid,uuid,text,text,uuid,public.priority_level,integer,uuid,uuid[]
) is
  'Race-safe Guided Intake Case materialization. Users with assignment permission may assign eligible staff; other authorized Case creators are restricted to self-assignment.';

commit;
