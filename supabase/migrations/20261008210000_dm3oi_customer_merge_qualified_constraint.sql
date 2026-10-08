begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- super_admin_merge_customers() is SECURITY DEFINER with an intentionally
-- empty search_path. SET CONSTRAINTS resolves an unqualified constraint name
-- through search_path, so qualify the reviewed public constraint explicitly
-- without weakening the function's search_path hardening.

create or replace function public.super_admin_merge_customers(
  target_organization_id uuid,
  target_surviving_customer_id uuid,
  target_merged_customer_id uuid,
  target_field_resolution jsonb,
  target_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  survivor public.customers;
  merged public.customers;
  resolved jsonb :=
    coalesce(target_field_resolution->'values', '{}'::jsonb);
  notes_strategy text :=
    coalesce(target_field_resolution->>'notes_strategy', 'COMBINE');
  resolved_notes text;
  case_count bigint;
  request_count bigint;
  draft_count bigint;
  portal_count bigint;
  survivor_portal_count bigint;
  confirmation_count bigint;
  email_delivery_count bigint;
  unknown_dependencies text[];
  audit_id uuid;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  if coalesce(jsonb_typeof(target_field_resolution), 'null') <> 'object'
     or coalesce(
       jsonb_typeof(target_field_resolution->'values'),
       'null'
     ) <> 'object' then
    raise exception 'invalid field resolution'
      using errcode = '22023';
  end if;

  if target_surviving_customer_id = target_merged_customer_id then
    raise exception 'customers must be different'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_organization_id::text, 0)
  );

  select *
  into survivor
  from public.customers
  where id = target_surviving_customer_id
    and organization_id = target_organization_id
  for update;

  select *
  into merged
  from public.customers
  where id = target_merged_customer_id
    and organization_id = target_organization_id
  for update;

  if survivor.id is null or merged.id is null then
    raise exception 'customer not found in target organization'
      using errcode = 'P0002';
  end if;

  if target_confirmation <>
     format(
       'MERGE %s INTO %s',
       merged.customer_number,
       survivor.customer_number
     ) then
    raise exception 'merge confirmation does not match'
      using errcode = '22023';
  end if;

  -- Continue failing closed for every unreviewed Customer FK.
  select array_agg(
    format(
      '%s.%I: %s',
      conrelid::regclass::text,
      conname,
      pg_catalog.pg_get_constraintdef(oid, true)
    )
    order by conrelid::regclass::text, conname
  )
  into unknown_dependencies
  from pg_catalog.pg_constraint
  where contype = 'f'
    and confrelid = 'public.customers'::regclass
    and not public.is_known_customer_foreign_key(oid);

  if unknown_dependencies is not null then
    raise exception 'unhandled customer dependencies'
      using
        errcode = '23514',
        detail = to_jsonb(unknown_dependencies)::text;
  end if;

  select count(*)
  into survivor_portal_count
  from public.customer_portal_users
  where organization_id = target_organization_id
    and customer_id = survivor.id;

  select count(*)
  into portal_count
  from public.customer_portal_users
  where organization_id = target_organization_id
    and customer_id = merged.id;

  if survivor_portal_count > 0 and portal_count > 0 then
    raise exception
      'both customers have portal identities; resolve portal access before merge'
      using errcode = '23514';
  end if;

  if notes_strategy = 'SURVIVOR' then
    resolved_notes := survivor.notes;
  elsif notes_strategy = 'MERGED' then
    resolved_notes := merged.notes;
  elsif notes_strategy = 'CUSTOM' then
    resolved_notes :=
      nullif(trim(resolved->>'notes'), '');
  elsif notes_strategy = 'COMBINE' then
    if nullif(trim(coalesce(survivor.notes, '')), '') is null then
      resolved_notes := merged.notes;
    elsif nullif(trim(coalesce(merged.notes, '')), '') is null
       or survivor.notes = merged.notes then
      resolved_notes := survivor.notes;
    else
      resolved_notes := format(
        '[%s]%s%s%s[%s]%s%s',
        survivor.customer_number,
        E'\n',
        survivor.notes,
        E'\n\n',
        merged.customer_number,
        E'\n',
        merged.notes
      );
    end if;
  else
    raise exception 'invalid notes strategy'
      using errcode = '22023';
  end if;

  set constraints
    public.service_requests_organization_id_customer_id_requester_use_fkey
    deferred;

  update public.customer_portal_users
  set customer_id = survivor.id
  where organization_id = target_organization_id
    and customer_id = merged.id;
  get diagnostics portal_count = row_count;

  update public.service_requests
  set customer_id = survivor.id
  where organization_id = target_organization_id
    and customer_id = merged.id;
  get diagnostics request_count = row_count;

  update public.cases
  set customer_id = survivor.id
  where organization_id = target_organization_id
    and customer_id = merged.id;
  get diagnostics case_count = row_count;

  update public.guided_case_intake_drafts
  set customer_id = survivor.id
  where organization_id = target_organization_id
    and customer_id = merged.id;
  get diagnostics draft_count = row_count;

  -- Durable evidence follows the consolidated Customer.
  update public.case_document_confirmations
  set customer_id = survivor.id
  where organization_id = target_organization_id
    and customer_id = merged.id;
  get diagnostics confirmation_count = row_count;

  -- Preserve tracked delivery history and its Customer association.
  update public.email_deliveries
  set customer_id = survivor.id
  where organization_id = target_organization_id
    and customer_id = merged.id;
  get diagnostics email_delivery_count = row_count;

  update public.customers
  set
    first_name = case
      when resolved ? 'first_name'
        then nullif(trim(resolved->>'first_name'), '')
      else survivor.first_name
    end,
    last_name = case
      when resolved ? 'last_name'
        then nullif(trim(resolved->>'last_name'), '')
      else survivor.last_name
    end,
    name = coalesce(
      nullif(trim(resolved->>'name'), ''),
      survivor.name
    ),
    email = case
      when resolved ? 'email'
        then nullif(lower(trim(resolved->>'email')), '')
      else survivor.email
    end,
    phone = case
      when resolved ? 'phone'
        then nullif(
          regexp_replace(
            resolved->>'phone',
            '[^0-9]',
            '',
            'g'
          ),
          ''
        )
      else survivor.phone
    end,
    street_address = case
      when resolved ? 'street_address'
        then nullif(trim(resolved->>'street_address'), '')
      else survivor.street_address
    end,
    city = case
      when resolved ? 'city'
        then nullif(trim(resolved->>'city'), '')
      else survivor.city
    end,
    state = case
      when resolved ? 'state'
        then nullif(upper(trim(resolved->>'state')), '')
      else survivor.state
    end,
    postal_code = case
      when resolved ? 'postal_code'
        then nullif(trim(resolved->>'postal_code'), '')
      else survivor.postal_code
    end,
    type = coalesce(
      nullif(resolved->>'type', '')::public.customer_type,
      survivor.type
    ),
    status = coalesce(
      nullif(resolved->>'status', '')::public.customer_status,
      survivor.status
    ),
    notes = resolved_notes
  where id = survivor.id
    and organization_id = target_organization_id;

  if nullif(trim(resolved->>'name'), '') is not null then
    update public.customers
    set name = trim(resolved->>'name')
    where id = survivor.id
      and organization_id = target_organization_id;
  end if;

  -- Every relationship that must survive the merge must now reference
  -- the survivor. customer_geocodes is intentionally excluded because
  -- it is disposable derived cache and may cascade with the losing row.
  if exists (
      select 1
      from public.customer_portal_users
      where organization_id = target_organization_id
        and customer_id = merged.id
    )
    or exists (
      select 1
      from public.cases
      where organization_id = target_organization_id
        and customer_id = merged.id
    )
    or exists (
      select 1
      from public.service_requests
      where organization_id = target_organization_id
        and customer_id = merged.id
    )
    or exists (
      select 1
      from public.guided_case_intake_drafts
      where organization_id = target_organization_id
        and customer_id = merged.id
    )
    or exists (
      select 1
      from public.case_document_confirmations
      where organization_id = target_organization_id
        and customer_id = merged.id
    )
    or exists (
      select 1
      from public.email_deliveries
      where organization_id = target_organization_id
        and customer_id = merged.id
    )
  then
    raise exception
      'customer still has references after reparenting'
      using errcode = '23514';
  end if;

  insert into public.customer_merge_history(
    organization_id,
    surviving_customer_id,
    merged_customer_id,
    surviving_customer_number,
    merged_customer_number,
    surviving_customer_snapshot,
    merged_customer_snapshot,
    field_resolution,
    dependency_move_summary,
    performed_by_user_id
  )
  values (
    target_organization_id,
    survivor.id,
    merged.id,
    survivor.customer_number,
    merged.customer_number,
    to_jsonb(survivor),
    to_jsonb(merged),
    target_field_resolution,
    jsonb_build_object(
      'cases', case_count,
      'service_requests', request_count,
      'guided_intake_drafts', draft_count,
      'portal_links', portal_count,
      'case_document_confirmations', confirmation_count,
      'email_deliveries', email_delivery_count
    ),
    actor
  )
  returning id into audit_id;

  -- customer_geocodes for the losing row is intentionally removed here
  -- by its reviewed ON DELETE CASCADE foreign key.
  delete from public.customers
  where id = merged.id
    and organization_id = target_organization_id;

  if not found then
    raise exception 'merged customer delete failed'
      using errcode = 'P0001';
  end if;

  set constraints
    public.service_requests_organization_id_customer_id_requester_use_fkey
    immediate;

  return jsonb_build_object(
    'merged', true,
    'audit_id', audit_id,
    'surviving_customer_id', survivor.id,
    'merged_customer_id', merged.id,
    'dependency_move_summary',
      jsonb_build_object(
        'cases', case_count,
        'service_requests', request_count,
        'guided_intake_drafts', draft_count,
        'portal_links', portal_count,
        'case_document_confirmations', confirmation_count,
        'email_deliveries', email_delivery_count
      )
  );
end;
$$;

alter function public.super_admin_merge_customers(
  uuid,
  uuid,
  uuid,
  jsonb,
  text
)
owner to postgres;

comment on function public.super_admin_merge_customers(
  uuid,
  uuid,
  uuid,
  jsonb,
  text
) is
  'SUPER_ADMIN duplicate Customer merge. Durable Customer-linked records are reparented to the survivor, derived geocode cache for the losing Customer is discarded, and every unreviewed future Customer foreign key remains fail-closed.';


commit;
