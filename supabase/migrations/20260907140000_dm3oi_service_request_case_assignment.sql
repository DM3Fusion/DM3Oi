-- Guarded, tenant- and customer-scoped Service Request to Case assignment.

alter table public.service_request_activity
  drop constraint service_request_activity_event_type_check;
alter table public.service_request_activity
  add constraint service_request_activity_event_type_check check (event_type in (
    'CREATED','STATUS_CHANGED','PRIORITY_CHANGED','ASSIGNMENT_CHANGED',
    'CASE_LINKED','CASE_CHANGED','CASE_UNLINKED'
  ));

create or replace function public.set_service_request_case(
  target_service_request_id uuid,
  target_case_id uuid,
  expected_case_id uuid
) returns public.service_requests
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  item public.service_requests;
  previous_case public.cases;
  target_case public.cases;
  event_name text;
begin
  if actor is null then
    raise exception 'not authorized' using errcode='42501';
  end if;

  select * into item
  from public.service_requests
  where id=target_service_request_id
  for update;
  if not found then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if not public.has_effective_organization_permission(item.organization_id,'MANAGE_SERVICE_REQUEST')
    or not public.can_manage_service_request(item.id,item.organization_id,actor)
  then
    raise exception 'not authorized' using errcode='42501';
  end if;

  if item.case_id is distinct from expected_case_id then
    raise exception 'service request case link changed' using errcode='40001';
  end if;

  if item.case_id is not null then
    select * into previous_case
    from public.cases
    where id=item.case_id and organization_id=item.organization_id;
  end if;

  if target_case_id is not null then
    select * into target_case
    from public.cases
    where id=target_case_id
      and organization_id=item.organization_id
      and customer_id=item.customer_id
    for update;
    if not found or not public.can_access_case(target_case.id,target_case.organization_id,actor) then
      raise exception 'invalid target case' using errcode='23514';
    end if;
  end if;

  if item.case_id is not distinct from target_case_id then
    if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then
      item.created_by_user_id:=null;
    end if;
    return item;
  end if;

  update public.service_requests
  set case_id=target_case_id
  where id=item.id
  returning * into item;

  event_name:=case
    when previous_case.id is null then 'CASE_LINKED'
    when target_case.id is null then 'CASE_UNLINKED'
    else 'CASE_CHANGED'
  end;

  insert into public.service_request_activity(
    organization_id,service_request_id,event_type,actor_user_id,previous_value,new_value,metadata
  ) values (
    item.organization_id,
    item.id,
    event_name,
    actor,
    case when previous_case.id is null then null else to_jsonb(previous_case.case_number) end,
    case when target_case.id is null then null else to_jsonb(target_case.case_number) end,
    jsonb_build_object(
      'previous_case_number',previous_case.case_number,
      'previous_case_title',previous_case.title,
      'new_case_number',target_case.case_number,
      'new_case_title',target_case.title
    )
  );

  if not public.is_super_admin(actor) and public.is_super_admin(item.created_by_user_id) then
    item.created_by_user_id:=null;
  end if;
  return item;
end
$$;

alter function public.set_service_request_case(uuid,uuid,uuid) owner to postgres;
revoke all on function public.set_service_request_case(uuid,uuid,uuid) from public,anon;
grant execute on function public.set_service_request_case(uuid,uuid,uuid) to authenticated;

comment on function public.set_service_request_case(uuid,uuid,uuid) is
  'Links, changes, or removes a Service Request Case link after effective-permission, tenant, customer, and Case-visibility validation.';
