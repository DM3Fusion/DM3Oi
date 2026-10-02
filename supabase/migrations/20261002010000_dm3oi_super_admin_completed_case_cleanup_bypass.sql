begin;

create or replace function public.guard_completed_case_child_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_case_id uuid;
  super_admin_cleanup boolean :=
    coalesce(
      current_setting('dm3oi.super_admin_case_cleanup', true),
      ''
    ) = 'on'
    and auth.uid() is not null
    and public.is_super_admin(auth.uid());
begin
  if super_admin_cleanup then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  target_case_id :=
    case
      when tg_op = 'DELETE' then old.case_id
      else new.case_id
    end;

  if exists(
    select 1
    from public.cases item
    where item.id = target_case_id
      and item.status = 'COMPLETED'
  ) then
    raise exception
      'Completed Cases are read-only.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$function$;


create or replace function public.guard_completed_case_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  super_admin_cleanup boolean :=
    coalesce(
      current_setting('dm3oi.super_admin_case_cleanup', true),
      ''
    ) = 'on'
    and auth.uid() is not null
    and public.is_super_admin(auth.uid());
begin
  if super_admin_cleanup then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if old.status = 'COMPLETED' then
    raise exception
      'Completed Cases are read-only.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$function$;


create or replace function public.permanently_delete_organization_cases(
  target_organization_id uuid,
  target_case_ids uuid[],
  confirmation_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  organization_record public.organizations;
  normalized_case_ids uuid[];
  selected_count integer;
  expected_confirmation text;
  preview jsonb;
  snapshot jsonb;
  case_numbers text[];
  deleted_count bigint;
  activity_deleted bigint := 0;
  service_requests_detached bigint := 0;
  email_deliveries_detached bigint := 0;
  audit_id uuid;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select *
  into organization_record
  from public.organizations
  where id = target_organization_id
  for update;

  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  expected_confirmation := 'DELETE ' || organization_record.name || ' CASES';

  if confirmation_text <> expected_confirmation then
    raise exception 'confirmation text does not match'
      using errcode = '22023';
  end if;

  select coalesce(
    array_agg(distinct selected_id order by selected_id),
    array[]::uuid[]
  )
  into normalized_case_ids
  from unnest(coalesce(target_case_ids, array[]::uuid[])) selected_id;

  if cardinality(normalized_case_ids) = 0 then
    raise exception 'select at least one case' using errcode = '22023';
  end if;

  perform 1
  from public.cases c
  where c.organization_id = target_organization_id
    and c.id = any(normalized_case_ids)
  for update;

  select count(*)
  into selected_count
  from public.cases c
  where c.organization_id = target_organization_id
    and c.id = any(normalized_case_ids);

  if selected_count <> cardinality(normalized_case_ids) then
    raise exception 'one or more selected cases were not found'
      using errcode = 'P0002';
  end if;

  preview := public.preview_organization_case_deletion(
    target_organization_id,
    normalized_case_ids
  );

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'caseNumber', c.case_number,
          'title', c.title,
          'status', c.status,
          'customerId', c.customer_id,
          'createdAt', c.created_at,
          'updatedAt', c.updated_at
        )
        order by c.case_number, c.id
      ),
      '[]'::jsonb
    ),
    coalesce(
      array_agg(c.case_number order by c.case_number, c.id),
      array[]::text[]
    )
  into snapshot, case_numbers
  from public.cases c
  where c.organization_id = target_organization_id
    and c.id = any(normalized_case_ids);

  perform set_config(
    'dm3oi.super_admin_case_cleanup',
    'on',
    true
  );

  update public.service_requests
  set case_id = null
  where organization_id = target_organization_id
    and case_id = any(normalized_case_ids);

  get diagnostics service_requests_detached = row_count;

  update public.email_deliveries
  set case_id = null
  where organization_id = target_organization_id
    and case_id = any(normalized_case_ids);

  get diagnostics email_deliveries_detached = row_count;

  delete from public.case_activity
  where organization_id = target_organization_id
    and case_id = any(normalized_case_ids);

  get diagnostics activity_deleted = row_count;

  delete from public.cases
  where organization_id = target_organization_id
    and id = any(normalized_case_ids);

  get diagnostics deleted_count = row_count;

  if deleted_count <> cardinality(normalized_case_ids) then
    raise exception 'case deletion count did not match selection'
      using errcode = 'P0001';
  end if;

  preview := preview || jsonb_build_object(
    'casesDeleted', deleted_count,
    'caseActivityDeleted', activity_deleted,
    'serviceRequestsDetached', service_requests_detached,
    'emailDeliveriesDetached', email_deliveries_detached
  );

  insert into public.platform_case_deletion_audit (
    organization_id,
    organization_name,
    actor_user_id,
    deleted_case_ids,
    deleted_case_numbers,
    case_snapshot,
    deleted_counts
  )
  values (
    target_organization_id,
    organization_record.name,
    actor,
    normalized_case_ids,
    case_numbers,
    snapshot,
    preview
  )
  returning id into audit_id;

  return preview || jsonb_build_object(
    'deletionAuditId', audit_id
  );
end;
$$;

revoke all on function public.permanently_delete_organization_cases(
  uuid,
  uuid[],
  text
) from public, anon;

grant execute on function public.permanently_delete_organization_cases(
  uuid,
  uuid[],
  text
) to authenticated;

commit;
