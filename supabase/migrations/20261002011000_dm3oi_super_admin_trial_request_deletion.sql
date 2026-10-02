begin;

create table if not exists public.platform_trial_request_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  trial_request_id uuid not null,
  request_number integer not null,
  business_name text not null,
  status text not null,
  converted_organization_id uuid,
  request_snapshot jsonb not null,
  history_snapshot jsonb not null default '[]'::jsonb,
  deleted_history_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.platform_trial_request_deletion_audit
  enable row level security;

revoke all on public.platform_trial_request_deletion_audit
  from public, anon, authenticated;


create or replace function public.permanently_delete_trial_request(
  target_trial_request_id uuid,
  confirmation_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  request_record public.trial_requests;
  expected_confirmation text;
  request_snapshot jsonb;
  history_snapshot jsonb;
  deleted_history_count integer := 0;
  deleted_request_count integer := 0;
  audit_id uuid;
begin
  if actor is null or not public.is_super_admin(actor) then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  select *
  into request_record
  from public.trial_requests
  where id = target_trial_request_id
  for update;

  if not found then
    raise exception 'trial request not found'
      using errcode = 'P0002';
  end if;

  expected_confirmation :=
    'DELETE TRIAL REQUEST #' || request_record.request_number::text;

  if confirmation_text <> expected_confirmation then
    raise exception 'confirmation text does not match'
      using errcode = '22023';
  end if;

  request_snapshot := to_jsonb(request_record);

  select coalesce(
    jsonb_agg(
      to_jsonb(history_row)
      order by history_row.created_at, history_row.id
    ),
    '[]'::jsonb
  )
  into history_snapshot
  from public.trial_request_status_history history_row
  where history_row.trial_request_id = target_trial_request_id;

  delete from public.trial_request_status_history
  where trial_request_id = target_trial_request_id;

  get diagnostics deleted_history_count = row_count;

  delete from public.trial_requests
  where id = target_trial_request_id;

  get diagnostics deleted_request_count = row_count;

  if deleted_request_count <> 1 then
    raise exception 'trial request deletion failed'
      using errcode = 'P0001';
  end if;

  insert into public.platform_trial_request_deletion_audit (
    actor_user_id,
    trial_request_id,
    request_number,
    business_name,
    status,
    converted_organization_id,
    request_snapshot,
    history_snapshot,
    deleted_history_count
  )
  values (
    actor,
    request_record.id,
    request_record.request_number,
    request_record.business_name,
    request_record.status::text,
    request_record.converted_organization_id,
    request_snapshot,
    history_snapshot,
    deleted_history_count
  )
  returning id into audit_id;

  return jsonb_build_object(
    'auditId', audit_id,
    'trialRequestId', request_record.id,
    'requestNumber', request_record.request_number,
    'businessName', request_record.business_name,
    'status', request_record.status,
    'convertedOrganizationId', request_record.converted_organization_id,
    'historyDeleted', deleted_history_count
  );
end;
$$;

revoke all on function public.permanently_delete_trial_request(uuid, text)
  from public, anon;

grant execute on function public.permanently_delete_trial_request(uuid, text)
  to authenticated;

commit;
