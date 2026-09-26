create or replace function public.super_admin_customer_deletion_preview(
  target_organization_id uuid,
  target_customer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  customer_row public.customers;
  portal_count bigint := 0;
  case_count bigint := 0;
  service_request_count bigint := 0;
  draft_count bigint := 0;
  blockers jsonb := '[]'::jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select *
  into customer_row
  from public.customers
  where organization_id=target_organization_id
    and id=target_customer_id;

  if not found then
    return jsonb_build_object(
      'exists', false,
      'eligible', false,
      'blockers', jsonb_build_array(
        jsonb_build_object(
          'code', 'CUSTOMER_NOT_FOUND',
          'label', 'Customer could not be found.',
          'count', 0
        )
      )
    );
  end if;

  select count(*)
  into portal_count
  from public.customer_portal_users
  where organization_id=target_organization_id
    and customer_id=target_customer_id;

  select count(*)
  into case_count
  from public.cases
  where organization_id=target_organization_id
    and customer_id=target_customer_id;

  select count(*)
  into service_request_count
  from public.service_requests
  where organization_id=target_organization_id
    and customer_id=target_customer_id;

  select count(*)
  into draft_count
  from public.guided_case_intake_drafts
  where organization_id=target_organization_id
    and customer_id=target_customer_id;

  if portal_count > 0 then
    blockers := blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'PORTAL_ACCESS',
        'label', 'Customer Portal relationship exists.',
        'count', portal_count
      )
    );
  end if;

  if case_count > 0 then
    blockers := blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'CASE_HISTORY',
        'label', 'Case history exists.',
        'count', case_count
      )
    );
  end if;

  if service_request_count > 0 then
    blockers := blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'SERVICE_DESK_HISTORY',
        'label', 'Service Desk history exists.',
        'count', service_request_count
      )
    );
  end if;

  if draft_count > 0 then
    blockers := blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'GUIDED_INTAKE_DRAFT',
        'label', 'Guided Case Intake draft exists.',
        'count', draft_count
      )
    );
  end if;

  return jsonb_build_object(
    'exists', true,
    'eligible', jsonb_array_length(blockers)=0,
    'customer_id', customer_row.id,
    'customer_number', customer_row.customer_number,
    'customer_name', customer_row.name,
    'blockers', blockers
  );
exception
  when others then
    if sqlstate='42501' then
      raise;
    end if;

    raise exception 'customer deletion dependency check failed'
      using errcode='P0001';
end
$$;

create or replace function public.super_admin_permanently_delete_customer(
  target_organization_id uuid,
  target_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  customer_row public.customers;
  portal_count bigint := 0;
  case_count bigint := 0;
  service_request_count bigint := 0;
  draft_count bigint := 0;
  blockers jsonb := '[]'::jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select *
  into customer_row
  from public.customers
  where organization_id=target_organization_id
    and id=target_customer_id
  for update;

  if not found then
    raise exception 'customer not found' using errcode='P0002';
  end if;

  select count(*)
  into portal_count
  from public.customer_portal_users
  where organization_id=target_organization_id
    and customer_id=target_customer_id;

  select count(*)
  into case_count
  from public.cases
  where organization_id=target_organization_id
    and customer_id=target_customer_id;

  select count(*)
  into service_request_count
  from public.service_requests
  where organization_id=target_organization_id
    and customer_id=target_customer_id;

  select count(*)
  into draft_count
  from public.guided_case_intake_drafts
  where organization_id=target_organization_id
    and customer_id=target_customer_id;

  if portal_count > 0 then
    blockers := blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'PORTAL_ACCESS',
        'label', 'Customer Portal relationship exists.',
        'count', portal_count
      )
    );
  end if;

  if case_count > 0 then
    blockers := blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'CASE_HISTORY',
        'label', 'Case history exists.',
        'count', case_count
      )
    );
  end if;

  if service_request_count > 0 then
    blockers := blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'SERVICE_DESK_HISTORY',
        'label', 'Service Desk history exists.',
        'count', service_request_count
      )
    );
  end if;

  if draft_count > 0 then
    blockers := blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'GUIDED_INTAKE_DRAFT',
        'label', 'Guided Case Intake draft exists.',
        'count', draft_count
      )
    );
  end if;

  if jsonb_array_length(blockers) > 0 then
    raise exception 'customer has protected dependencies'
      using
        errcode='23514',
        detail=blockers::text;
  end if;

  delete from public.customers
  where organization_id=target_organization_id
    and id=target_customer_id;

  if not found then
    raise exception 'customer not found' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'deleted', true,
    'customer_id', customer_row.id,
    'customer_number', customer_row.customer_number,
    'customer_name', customer_row.name
  );
end
$$;

alter function public.super_admin_customer_deletion_preview(uuid,uuid)
  owner to postgres;

alter function public.super_admin_permanently_delete_customer(uuid,uuid)
  owner to postgres;

revoke all on function public.super_admin_customer_deletion_preview(uuid,uuid)
  from public,anon;

revoke all on function public.super_admin_permanently_delete_customer(uuid,uuid)
  from public,anon;

grant execute on function public.super_admin_customer_deletion_preview(uuid,uuid)
  to authenticated;

grant execute on function public.super_admin_permanently_delete_customer(uuid,uuid)
  to authenticated;

comment on function public.super_admin_customer_deletion_preview(uuid,uuid) is
  'SUPER_ADMIN-only fail-closed preflight for permanent Customer deletion.';

comment on function public.super_admin_permanently_delete_customer(uuid,uuid) is
  'SUPER_ADMIN-only permanent Customer deletion. Rechecks all protected direct Customer dependencies atomically before deletion.';
